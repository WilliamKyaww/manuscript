import { z } from 'zod';
import { TOOL_PERMISSIONS } from '../agent/policy';
import { LocatorSchema } from '../sources/types';
import { ConceptIdSchema } from './concepts';
import { defineEndpoint } from './contract';
import { LectureIdSchema, ModuleIdSchema } from './course';
import { SourceIdSchema } from './sources';

/**
 * The AI layer (agent-system.md §2, Phase 10): providers, a model per role, spend limits, usage,
 * embeddings and grounded answers. API keys are written, never read back: the client only learns
 * whether a provider has one.
 */

export const AI_ROLES = ['chat', 'fast', 'embedding', 'transcription'] as const;
export type AiRole = (typeof AI_ROLES)[number];
export const AiRoleSchema = z.enum(AI_ROLES);

export const PROVIDER_KINDS = ['anthropic', 'openai', 'openai-compatible'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];
export const ProviderKindSchema = z.enum(PROVIDER_KINDS);

const ProviderIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,39}$/u, 'Lower-case letters, digits and hyphens.');

const Url = z
  .string()
  .trim()
  .url()
  .refine((value) => /^https?:\/\//u.test(value), 'Use an http:// or https:// address.');

export const ProviderSchema = z.object({
  id: ProviderIdSchema,
  kind: ProviderKindSchema,
  name: z.string(),
  /** For OpenAI-compatible servers (Ollama, LM Studio, OpenRouter…); optional for the others. */
  baseUrl: z.string().nullable(),
  hasKey: z.boolean(),
});
export type Provider = z.infer<typeof ProviderSchema>;

export const ProviderInputSchema = z.object({
  kind: ProviderKindSchema,
  name: z.string().trim().min(1).max(60),
  baseUrl: Url.nullish(),
  /** Written once; never returned. */
  apiKey: z.string().trim().min(1).max(500).optional(),
});
export type ProviderInput = z.input<typeof ProviderInputSchema>;

export const ProviderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  baseUrl: Url.nullish(),
  /** A new key; null removes the stored one. */
  apiKey: z.string().trim().min(1).max(500).nullish(),
});

const Price = z.number().min(0).max(1_000).nullable();

export const RoleSettingsSchema = z.object({
  providerId: ProviderIdSchema.nullable(),
  model: z.string().trim().max(200),
  /** The longest answer a request may ask for. */
  maxOutputTokens: z.number().int().min(64).max(64_000),
  /** US dollars per million tokens, for spend estimates (provider prices change; set your own). */
  inputPrice: Price,
  outputPrice: Price,
});
export type RoleSettings = z.infer<typeof RoleSettingsSchema>;

const role = (maxOutputTokens: number): RoleSettings => ({
  providerId: null,
  model: '',
  maxOutputTokens,
  inputPrice: null,
  outputPrice: null,
});

/** What may skip the Inbox and enter the knowledge base as soon as it is generated (all off by default). */
export const AUTO_ACCEPT_KINDS = [
  'cards',
  'questions',
  'concepts',
  'relations',
  'aliases',
  'links',
  'notes',
] as const;
export type AutoAcceptKind = (typeof AUTO_ACCEPT_KINDS)[number];

const AutoAcceptSchema = z.object(
  Object.fromEntries(AUTO_ACCEPT_KINDS.map((kind) => [kind, z.boolean()])) as Record<
    AutoAcceptKind,
    z.ZodBoolean
  >,
);
export type AutoAccept = z.infer<typeof AutoAcceptSchema>;

const NO_AUTO_ACCEPT = Object.fromEntries(
  AUTO_ACCEPT_KINDS.map((kind) => [kind, false]),
) as AutoAccept;

export const AiPreferencesSchema = z.object({
  roles: z.object({
    chat: RoleSettingsSchema,
    fast: RoleSettingsSchema,
    embedding: RoleSettingsSchema,
    // Added in Phase 11: settings written before it have neither, and get the defaults.
    transcription: RoleSettingsSchema.default(() => role(1_000)),
  }),
  /** Estimated spend allowed per calendar month, in US dollars; null for no limit. */
  monthlyBudget: z.number().min(0).max(100_000).nullable(),
  /** Passages and context sent with one question, in tokens. */
  contextTokens: z.number().int().min(1_000).max(200_000),
  autoAccept: AutoAcceptSchema.default(() => ({ ...NO_AUTO_ACCEPT })),
  /** The person's override per agent tool (Phase 12); a tool without an entry has its risk's default. */
  toolPermissions: z.record(z.string(), z.enum(TOOL_PERMISSIONS)).default(() => ({})),
});
export type AiPreferences = z.infer<typeof AiPreferencesSchema>;

export const DEFAULT_AI_PREFERENCES: AiPreferences = {
  roles: {
    chat: role(2_000),
    fast: role(1_000),
    embedding: role(1_000),
    transcription: role(1_000),
  },
  monthlyBudget: 10,
  contextTokens: 12_000,
  autoAccept: { ...NO_AUTO_ACCEPT },
  toolPermissions: {},
};

/**
 * A few model ids to start from, per provider kind and role. They are suggestions only: any model
 * id the provider accepts works, and providers rename models often — check the provider's list.
 */
export const MODEL_SUGGESTIONS: Record<ProviderKind, Record<AiRole, string[]>> = {
  anthropic: {
    chat: ['claude-sonnet-5-5', 'claude-opus-5-5'],
    fast: ['claude-haiku-4-5-20251001'],
    embedding: [],
    transcription: [],
  },
  openai: {
    chat: [],
    fast: [],
    embedding: ['text-embedding-3-small', 'text-embedding-3-large'],
    // whisper-1 gives timed segments (exact times in the transcript); the others text only.
    transcription: ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'],
  },
  'openai-compatible': {
    chat: ['llama3.2', 'qwen2.5', 'deepseek-chat'],
    fast: ['llama3.2', 'qwen2.5'],
    embedding: ['nomic-embed-text', 'mxbai-embed-large'],
    transcription: ['whisper-1', 'whisper-large-v3'],
  },
};

export const RoleStatusSchema = z.object({
  ready: z.boolean(),
  /** Why the role cannot be used yet, in words for the student. */
  reason: z.string().nullable(),
  label: z.string().nullable(),
});

export const UsageTotalsSchema = z.object({
  requests: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  /** Estimated from the prices set per role (0 where none is set). */
  cost: z.number(),
});

export const AiStatusSchema = z.object({
  /** Answers can be asked for (the chat role works). */
  enabled: z.boolean(),
  /** A built-in test model answers instead of a provider (SKB_AI_PROVIDER=mock). */
  mock: z.boolean(),
  roles: z.object({
    chat: RoleStatusSchema,
    fast: RoleStatusSchema,
    embedding: RoleStatusSchema,
    transcription: RoleStatusSchema,
  }),
  month: UsageTotalsSchema.extend({
    budget: z.number().nullable(),
    /** At or above 80 % of the budget. */
    warning: z.boolean(),
    /** The budget is used up: requests are refused until next month. */
    exhausted: z.boolean(),
  }),
});
export type AiStatus = z.infer<typeof AiStatusSchema>;

export const AiSettingsSchema = z.object({
  providers: z.array(ProviderSchema),
  preferences: AiPreferencesSchema,
  status: AiStatusSchema,
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const UsageRowSchema = z.object({
  id: z.string(),
  role: AiRoleSchema,
  provider: z.string(),
  model: z.string(),
  purpose: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  cost: z.number(),
  createdAt: z.string(),
});

export const UsageReportSchema = z.object({
  month: z.string(),
  totals: UsageTotalsSchema,
  byModel: z.array(
    UsageTotalsSchema.extend({ role: AiRoleSchema, provider: z.string(), model: z.string() }),
  ),
  recent: z.array(UsageRowSchema),
});
export type UsageReport = z.infer<typeof UsageReportSchema>;

export const ConnectionResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  latencyMs: z.number().int(),
});

export const EmbeddingStatusSchema = z.object({
  /** "provider/model", or null when no embedding model is set. */
  model: z.string().nullable(),
  embedded: z.number().int(),
  total: z.number().int(),
  /** Queued or running embedding work. */
  running: z.boolean(),
  error: z.string().nullable(),
});
export type EmbeddingStatus = z.infer<typeof EmbeddingStatusSchema>;

// --- Asking ---------------------------------------------------------------------------------------

export const ASK_SCOPES = ['sources', 'knowledge', 'general'] as const;
export type AskScope = (typeof ASK_SCOPES)[number];

export const AskFilterSchema = z.object({
  moduleId: ModuleIdSchema.optional(),
  lectureId: LectureIdSchema.optional(),
  sourceIds: z.array(SourceIdSchema).max(50).optional(),
  conceptIds: z.array(ConceptIdSchema).max(50).optional(),
});
export type AskFilter = z.infer<typeof AskFilterSchema>;

export const AskInputSchema = z.object({
  question: z.string().trim().min(1).max(4_000),
  scope: z.enum(ASK_SCOPES),
  filter: AskFilterSchema.default({}),
});
export type AskInput = z.input<typeof AskInputSchema>;

export const PassageSchema = z.object({
  key: z.string(),
  kind: z.enum(['source', 'note']),
  title: z.string(),
  /** "p. 12", "Slide 3", a heading. */
  label: z.string(),
  locator: LocatorSchema,
  text: z.string(),
});
export type Passage = z.infer<typeof PassageSchema>;

/** The answer stream: one JSON object per line (application/x-ndjson). */
export const AskEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('passages'), passages: z.array(PassageSchema) }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  z.object({
    type: z.literal('done'),
    text: z.string(),
    /** Keys cited, in order; unknown ones are removed from the text. */
    cited: z.array(z.string()),
    dropped: z.array(z.string()),
    grounding: z.enum(['sources', 'mixed', 'general', 'not_found']),
    usage: UsageTotalsSchema.nullable(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['not_configured', 'budget', 'provider', 'cancelled']),
    message: z.string(),
  }),
]);
export type AskEvent = z.infer<typeof AskEventSchema>;

// --- Endpoints ----------------------------------------------------------------------------------

const ProviderParams = z.object({ id: ProviderIdSchema });
const ok = z.object({ ok: z.literal(true) });

export const getAiSettingsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/ai/settings',
  response: AiSettingsSchema,
});
export const updateAiPreferencesEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/ai/preferences',
  body: z.object({
    roles: z
      .object({
        chat: RoleSettingsSchema.partial(),
        fast: RoleSettingsSchema.partial(),
        embedding: RoleSettingsSchema.partial(),
        transcription: RoleSettingsSchema.partial(),
      })
      .partial()
      .optional(),
    monthlyBudget: z.number().min(0).max(100_000).nullable().optional(),
    contextTokens: z.number().int().min(1_000).max(200_000).optional(),
    autoAccept: AutoAcceptSchema.partial().optional(),
  }),
  response: AiSettingsSchema,
});
export const createProviderEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/ai/providers',
  status: 201,
  body: ProviderInputSchema,
  response: ProviderSchema,
});
export const updateProviderEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/ai/providers/:id',
  params: ProviderParams,
  body: ProviderUpdateSchema,
  response: ProviderSchema,
});
export const deleteProviderEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/ai/providers/:id',
  params: ProviderParams,
  response: ok,
});
export const testProviderEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/ai/providers/:id/test',
  params: ProviderParams,
  body: z.object({ model: z.string().trim().min(1).max(200), role: AiRoleSchema.default('chat') }),
  response: ConnectionResultSchema,
});
export const aiStatusEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/ai/status',
  response: AiStatusSchema,
});
export const aiUsageEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/ai/usage',
  response: UsageReportSchema,
});
export const embeddingStatusEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/ai/embeddings',
  response: EmbeddingStatusSchema,
});
export const rebuildEmbeddingsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/ai/embeddings/rebuild',
  response: EmbeddingStatusSchema,
});

export const RelatedNotesSchema = z.object({
  /** False when semantic search is off or this note has no vector yet. */
  available: z.boolean(),
  notes: z.array(z.object({ id: z.string(), title: z.string(), score: z.number() })),
});
export type RelatedNotes = z.infer<typeof RelatedNotesSchema>;

export const relatedNotesEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/ai/notes/:id/related',
  params: z.object({ id: z.string().regex(/^note_[0-9A-HJKMNP-TV-Z]{26}$/u) }),
  response: RelatedNotesSchema,
});

/** Streams AskEvent lines; not a JSON endpoint, so it is declared here for its path only. */
export const ASK_PATH = '/api/ai/ask';

/**
 * Writing help on selected text (Phase 26): improving, correcting, shortening or explaining what the
 * student wrote. The answer comes back to the editor, where the student chooses whether to use it;
 * nothing is written to a note by the server.
 */
export const WRITING_ACTIONS = [
  'improve',
  'proofread',
  'shorter',
  'longer',
  'simplify',
  'summarise',
  'explain',
  'list',
  'table',
  'custom',
] as const;
export const WritingActionSchema = z.enum(WRITING_ACTIONS);
export type WritingAction = z.infer<typeof WritingActionSchema>;

export const WritingRequestSchema = z
  .object({
    action: WritingActionSchema,
    text: z
      .string()
      .trim()
      .min(1, 'Select some text first.')
      .max(20_000, 'Select less text (at most 20,000 characters).'),
    /** What to do, in the student's words ("Edit with AI…"). */
    instruction: z.string().trim().max(500).optional(),
    /** The note's title, for context. */
    title: z.string().trim().max(300).optional(),
  })
  .refine((request) => request.action !== 'custom' || Boolean(request.instruction), {
    message: 'Say what to do with the text.',
    path: ['instruction'],
  });
export type WritingRequest = z.infer<typeof WritingRequestSchema>;

export const WritingResultSchema = z.object({
  text: z.string(),
  /** The model that answered, as Settings → AI names it. */
  model: z.string(),
});
export type WritingResult = z.infer<typeof WritingResultSchema>;

export const assistWritingEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/ai/write',
  body: WritingRequestSchema,
  response: WritingResultSchema,
});
