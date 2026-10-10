import { z } from 'zod';
import { EXTRACTED_RELATIONS, GENERATED_QUESTION_KINDS, GENERATION_TASKS } from '../ai/generation';
import { CONFIDENCES } from '../graph/vocabulary';
import { idSchema } from '../ids';
import { LocatorSchema } from '../sources/types';
import { CardSchema, CardSetIdSchema } from './cards';
import { defineEndpoint } from './contract';
import { LectureIdSchema } from './course';
import { JobSummarySchema } from './jobs';
import { NoteIdSchema } from './notes';
import { AnswerIdSchema, QuestionSchema } from './questions';
import { SourceIdSchema } from './sources';

/**
 * Generation, drafts and the proposals Inbox (agent-system.md §11, knowledge-system.md §8,
 * Phase 11). What a model makes lands as drafts (cards, questions) or proposals (concepts,
 * relations, aliases, links, notes) and enters the knowledge base only when accepted — unless
 * auto-accept is switched on for that kind.
 */

export const GenerationScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('source'),
    sourceId: SourceIdSchema,
    /** First and last page or slide (1-based, inclusive); the whole source when absent. */
    from: z.number().int().min(1).optional(),
    to: z.number().int().min(1).optional(),
  }),
  z.object({ kind: z.literal('lecture'), lectureId: LectureIdSchema }),
  z.object({ kind: z.literal('note'), noteId: NoteIdSchema }),
  z.object({
    kind: z.literal('selection'),
    text: z.string().trim().min(1).max(20_000),
    /** Where the selection is, kept as every generated item's locator. */
    locator: LocatorSchema,
    title: z.string().max(200),
  }),
]);
export type GenerationScope = z.infer<typeof GenerationScopeSchema>;

export const GenerationRequestSchema = z.object({
  task: z.enum(GENERATION_TASKS),
  scope: GenerationScopeSchema,
  /** Cards, questions or concepts to aim for (a note is one note). */
  count: z.number().int().min(1).max(50).default(10),
  difficulty: z.enum(['easy', 'mixed', 'hard']).default('mixed'),
  /** What to concentrate on, in the student's words. */
  focus: z.string().trim().max(300).default(''),
  cardKinds: z
    .array(z.enum(['basic', 'cloze']))
    .min(1)
    .default(['basic', 'cloze']),
  questionKinds: z
    .array(z.enum(GENERATED_QUESTION_KINDS))
    .min(1)
    .default(['mcq', 'short', 'explain']),
  /** Cards go to this set (a set named after the scope is made otherwise). */
  setId: CardSetIdSchema.optional(),
});
export type GenerationRequest = z.input<typeof GenerationRequestSchema>;

export const GenerationEstimateSchema = z.object({
  passages: z.number().int(),
  materialTokens: z.number().int(),
  /** The material was longer than the budget: only the first part is used. */
  truncated: z.boolean(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  /** Estimated US dollars, or null when no prices are set. */
  cost: z.number().nullable(),
  /** "Anthropic · claude-sonnet-5-5", or null when AI is not set up. */
  model: z.string().nullable(),
  /** Why generation cannot run, if it cannot. */
  problem: z.string().nullable(),
});
export type GenerationEstimate = z.infer<typeof GenerationEstimateSchema>;

// --- Drafts -------------------------------------------------------------------------------------

const Duplicate = z.object({ id: z.string(), text: z.string() }).nullable();

export const DraftsSchema = z.object({
  cards: z.array(CardSchema.extend({ duplicateOf: Duplicate, advice: z.array(z.string()) })),
  questions: z.array(QuestionSchema.extend({ duplicateOf: Duplicate })),
});
export type Drafts = z.infer<typeof DraftsSchema>;

const DraftIds = z.object({
  cardIds: z.array(idSchema('card')).max(1_000).default([]),
  questionIds: z.array(idSchema('question')).max(1_000).default([]),
});

// --- Proposals ----------------------------------------------------------------------------------

export const ProposalIdSchema = idSchema('proposal');
export const PROPOSAL_KINDS = [
  'concept',
  'relation',
  'alias',
  'link',
  'note',
  'correction',
  'addition',
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export const ProposalStatusSchema = z.enum(['pending', 'accepted', 'rejected', 'superseded']);

/** A concept a relation proposal points at: an existing one, or one proposed alongside it. */
export const ProposedEndSchema = z.object({
  conceptId: z.string().nullable(),
  proposalId: z.string().nullable(),
  name: z.string(),
});

export const ProposalPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('concept'),
    name: z.string(),
    aliases: z.array(z.string()),
    summary: z.string(),
    moduleIds: z.array(z.string()),
    /** An existing concept with a name close enough that the two may be one (to merge into). */
    similarTo: z.object({ id: z.string(), name: z.string(), score: z.number() }).nullable(),
  }),
  z.object({
    kind: z.literal('relation'),
    from: ProposedEndSchema,
    to: ProposedEndSchema,
    relation: z.enum(EXTRACTED_RELATIONS),
    confidence: z.enum(CONFIDENCES),
    score: z.number().nullable(),
  }),
  z.object({
    kind: z.literal('alias'),
    conceptId: z.string(),
    conceptName: z.string(),
    alias: z.string(),
    /** How alike the names are (Jaro–Winkler), and whether a model judged them the same. */
    similarity: z.number(),
    judged: z.boolean(),
  }),
  z.object({
    kind: z.literal('link'),
    /** An unlinked mention to turn into a link, or two notes alike in meaning to relate. */
    variant: z.enum(['mention', 'related']),
    noteId: z.string(),
    noteTitle: z.string(),
    target: z.object({ kind: z.enum(['note', 'concept']), id: z.string(), title: z.string() }),
    /** mention only: where the text is, and the note's hash when it was found. */
    text: z.string(),
    offset: z.number().int(),
    sourceHash: z.string(),
    similarity: z.number().nullable(),
  }),
  z.object({
    kind: z.literal('note'),
    title: z.string(),
    folder: z.string(),
    content: z.string(),
  }),
  /** Something the student wrote that the lecture material contradicts (Phase 14). */
  z.object({
    kind: z.literal('correction'),
    noteId: z.string(),
    noteTitle: z.string(),
    /** The words in the note that are wrong, exactly as they are written there. */
    text: z.string(),
    /** What to put in their place. */
    replacement: z.string(),
    /** Why, in the tutor's words. */
    explanation: z.string(),
  }),
  /** Something worth keeping in a note after a mistake in practice (Phase 15). */
  z.object({
    kind: z.literal('addition'),
    noteId: z.string(),
    noteTitle: z.string(),
    /** The section it goes under (made if the note has none like it). */
    heading: z.string(),
    /** Markdown to add at the end of that section. */
    text: z.string(),
  }),
]);
export type ProposalPayload = z.infer<typeof ProposalPayloadSchema>;

/** A quote from the material a proposal came from, with where it is. */
export const ProposalEvidenceSchema = z.object({
  quote: z.string(),
  title: z.string(),
  label: z.string(),
  locator: LocatorSchema.nullable(),
});

export const ProposalSchema = z.object({
  id: ProposalIdSchema,
  kind: z.enum(PROPOSAL_KINDS),
  status: ProposalStatusSchema,
  payload: ProposalPayloadSchema,
  evidence: z.array(ProposalEvidenceSchema),
  /** What made it: "Concepts from Lecture 3 (slides 1–3)". */
  origin: z.string(),
  createdAt: z.string(),
  decidedAt: z.string().nullable(),
  /** What accepting it made or changed, once accepted. */
  result: z.object({ kind: z.string(), id: z.string() }).nullable(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const ProposalEditSchema = z.object({
  /** concept: a corrected name, summary or aliases; note: a title or content. */
  name: z.string().trim().min(1).max(120).optional(),
  summary: z.string().max(4_000).optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(200_000).optional(),
  /** concept: add the name and aliases to this existing concept instead of creating one. */
  mergeInto: idSchema('concept').optional(),
});
export type ProposalEdit = z.infer<typeof ProposalEditSchema>;

export const InboxCountsSchema = z.object({
  drafts: z.number().int(),
  proposals: z.number().int(),
});

// --- Grading ------------------------------------------------------------------------------------

export const AiGradeSchema = z.object({
  /** The score the model suggests; the student decides. */
  score: z.union([z.literal(0), z.literal(0.5), z.literal(1)]),
  feedback: z.string(),
  misconceptions: z.array(z.string()),
});
export type AiGrade = z.infer<typeof AiGradeSchema>;

// --- Endpoints ----------------------------------------------------------------------------------

export const estimateGenerationEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/ai/generate/estimate',
  body: GenerationRequestSchema,
  response: GenerationEstimateSchema,
});
export const startGenerationEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/ai/generate',
  status: 201,
  body: GenerationRequestSchema,
  response: JobSummarySchema,
});
export const listDraftsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/drafts',
  response: DraftsSchema,
});
export const acceptDraftsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/drafts/accept',
  body: DraftIds,
  response: z.object({ cards: z.number().int(), questions: z.number().int() }),
});
export const rejectDraftsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/drafts/reject',
  body: DraftIds,
  response: z.object({ cards: z.number().int(), questions: z.number().int() }),
});
export const listProposalsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/proposals',
  query: z.object({
    status: ProposalStatusSchema.default('pending'),
    kind: z.enum(PROPOSAL_KINDS).optional(),
  }),
  response: z.object({ proposals: z.array(ProposalSchema) }),
});
export const acceptProposalEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/proposals/:id/accept',
  params: z.object({ id: ProposalIdSchema }),
  body: ProposalEditSchema.default({}),
  response: ProposalSchema,
});
export const rejectProposalEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/proposals/:id/reject',
  params: z.object({ id: ProposalIdSchema }),
  response: ProposalSchema,
});
export const bulkProposalsEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/proposals/bulk',
  body: z.object({
    ids: z.array(ProposalIdSchema).min(1).max(500),
    action: z.enum(['accept', 'reject']),
  }),
  response: z.object({ done: z.number().int(), failed: z.array(z.string()) }),
});
export const inboxCountsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/inbox/counts',
  response: InboxCountsSchema,
});
export const aiGradeEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/answers/:id/ai-grade',
  params: z.object({ id: AnswerIdSchema }),
  response: AiGradeSchema,
});
export const suggestLinksEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/ai/link-suggestions',
  body: z.object({ noteId: NoteIdSchema }),
  response: z.object({ created: z.number().int() }),
});
