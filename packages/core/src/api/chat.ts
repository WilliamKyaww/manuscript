import { z } from 'zod';
import { idSchema } from '../ids';
import { ASK_SCOPES, AskFilterSchema, PassageSchema, UsageTotalsSchema } from './ai';
import { defineEndpoint } from './contract';

/**
 * Chat (agent-system.md §§3, 4, 9, Phase 13): persistent threads in which the assistant answers
 * from the student's material and acts through the tools, streaming as it goes. A run that needs the
 * student's approval pauses, and resumes when they decide.
 */

export const ThreadIdSchema = idSchema('thread');
export const MessageIdSchema = idSchema('message');

export const CHAT_MODES = ['assistant', 'tutor', 'read_only'] as const;
export type ChatMode = (typeof CHAT_MODES)[number];
export const ChatModeSchema = z.enum(CHAT_MODES);

/** What a person may @mention to scope or inform a message. */
export const MENTION_KINDS = ['note', 'concept', 'module', 'lecture', 'source'] as const;
export const MentionSchema = z.object({
  kind: z.enum(MENTION_KINDS),
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
});
export type Mention = z.infer<typeof MentionSchema>;

export const TOOL_STATES = [
  'running',
  'ok',
  'error',
  'denied',
  'declined',
  'awaiting_approval',
] as const;
export type ToolState = (typeof TOOL_STATES)[number];

/** One tool call in an assistant message, shown as an activity row. */
export const ToolPartSchema = z.object({
  type: z.literal('tool'),
  /** The model's id for the call; unique within a thread. */
  callId: z.string(),
  tool: z.string(),
  state: z.enum(TOOL_STATES),
  /** "Found Lecture 1 — Introduction to consensus". */
  summary: z.string(),
  risk: z.enum(['read', 'write', 'destructive']).nullable(),
  /** The log entry of a call that changed something (for Undo and result cards). */
  actionId: z.string().nullable(),
  /** Why the call needs approval, or was refused. */
  reason: z.string().nullable(),
  /** The arguments, for the details disclosure and for approvals. */
  input: z.unknown(),
  /** What the tool returned (kept small), for result cards. */
  output: z.unknown(),
  /** For a call waiting on the person: the id to answer it by. */
  approvalId: z.string().nullable(),
  /** The tool may be approved for the rest of the chat (not offered for destructive calls). */
  canAllowForChat: z.boolean(),
});
export type ToolPart = z.infer<typeof ToolPartSchema>;

export const GROUNDINGS = ['sources', 'mixed', 'general', 'not_found'] as const;

export const ChatPartSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string() }),
  ToolPartSchema,
  /** The passages the answer could cite, with their keys. */
  z.object({ type: z.literal('passages'), passages: z.array(PassageSchema) }),
  z.object({
    type: z.literal('grounding'),
    grounding: z.enum(GROUNDINGS),
    cited: z.array(z.string()),
    dropped: z.array(z.string()),
  }),
  /** Something the person should know that the model did not say ("Stopped", an error). */
  z.object({ type: z.literal('notice'), tone: z.enum(['info', 'error']), text: z.string() }),
]);
export type ChatPart = z.infer<typeof ChatPartSchema>;

export const ChatMessageSchema = z.object({
  id: MessageIdSchema,
  role: z.enum(['user', 'assistant']),
  parts: z.array(ChatPartSchema),
  mentions: z.array(MentionSchema),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatThreadSchema = z.object({
  id: ThreadIdSchema,
  title: z.string(),
  mode: ChatModeSchema,
  scope: z.enum(ASK_SCOPES),
  filter: AskFilterSchema,
  /** Tools the person approved for the rest of this chat. */
  allowedTools: z.array(z.string()),
  messageCount: z.number().int(),
  /** The last run is waiting for the person to approve or decline. */
  awaitingApproval: z.boolean(),
  /** Earlier turns have been summarised to fit the model's context. */
  compacted: z.boolean(),
  usage: UsageTotalsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ChatThread = z.infer<typeof ChatThreadSchema>;

export const ChatThreadDetailSchema = ChatThreadSchema.extend({
  messages: z.array(ChatMessageSchema),
});
export type ChatThreadDetail = z.infer<typeof ChatThreadDetailSchema>;

// --- Streaming ----------------------------------------------------------------------------------

/** The page the person is on, told to the assistant with a message. */
export const PageContextSchema = z.object({
  /** "viewing the note “Paxos”". */
  label: z.string().max(300),
  filter: AskFilterSchema.default({}),
  /** Note id of the open note, so the assistant can read it. */
  noteId: z.string().optional(),
  /** Text the person has selected on the page. */
  selection: z.string().max(8_000).optional(),
});
export type PageContext = z.infer<typeof PageContextSchema>;

export const SendMessageSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  mentions: z.array(MentionSchema).max(20).default([]),
  /** Narrow the answer to the page on screen. */
  context: PageContextSchema.optional(),
  /** Narrow retrieval to the page's module, lecture, source or concept. */
  onlyThisPage: z.boolean().default(false),
});
export type SendMessageInput = z.input<typeof SendMessageSchema>;

export const ApprovalDecisionSchema = z.object({
  approvalId: z.string().min(1),
  /** Approve this call, approve this tool for the rest of the chat, or decline. */
  decision: z.enum(['once', 'chat', 'decline']),
});
export const DecideApprovalsSchema = z.object({
  decisions: z.array(ApprovalDecisionSchema).min(1).max(50),
});
export type DecideApprovalsInput = z.input<typeof DecideApprovalsSchema>;

/** The stream of one run: one JSON object per line (application/x-ndjson). */
export const ChatEventSchema = z.discriminatedUnion('type', [
  /** The person's message, saved. */
  z.object({ type: z.literal('user'), message: ChatMessageSchema }),
  /** The assistant's message has begun (its id, for the parts that follow). */
  z.object({ type: z.literal('assistant'), id: MessageIdSchema, createdAt: z.string() }),
  z.object({ type: z.literal('passages'), passages: z.array(PassageSchema) }),
  z.object({ type: z.literal('text'), delta: z.string() }),
  /** A tool call started, finished, or is waiting; replaces any earlier state of the same call. */
  z.object({ type: z.literal('tool'), part: ToolPartSchema }),
  /** The run stopped to ask the person; the calls are in the message's tool parts. */
  z.object({ type: z.literal('paused'), approvalIds: z.array(z.string()) }),
  /** The run is over; the message and thread as saved. */
  z.object({ type: z.literal('done'), message: ChatMessageSchema, thread: ChatThreadSchema }),
  z.object({
    type: z.literal('error'),
    code: z.enum(['not_configured', 'budget', 'provider', 'cancelled', 'failed']),
    message: z.string(),
  }),
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;

// --- Endpoints ----------------------------------------------------------------------------------

const ThreadParams = z.object({ id: ThreadIdSchema });
const ok = z.object({ ok: z.literal(true) });

export const listThreadsEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/chat/threads',
  query: z.object({ q: z.string().trim().max(200).optional() }),
  response: z.object({ threads: z.array(ChatThreadSchema) }),
});
export const createThreadEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/chat/threads',
  status: 201,
  body: z.object({
    title: z.string().trim().max(200).optional(),
    mode: ChatModeSchema.default('assistant'),
    scope: z.enum(ASK_SCOPES).default('knowledge'),
    filter: AskFilterSchema.default({}),
  }),
  response: ChatThreadSchema,
});
export const getThreadEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/chat/threads/:id',
  params: ThreadParams,
  response: ChatThreadDetailSchema,
});
export const updateThreadEndpoint = defineEndpoint({
  method: 'PATCH',
  path: '/api/chat/threads/:id',
  params: ThreadParams,
  body: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    mode: ChatModeSchema.optional(),
    scope: z.enum(ASK_SCOPES).optional(),
    filter: AskFilterSchema.optional(),
    /** Forget the tools approved for this chat. */
    clearAllowedTools: z.boolean().optional(),
  }),
  response: ChatThreadSchema,
});
export const deleteThreadEndpoint = defineEndpoint({
  method: 'DELETE',
  path: '/api/chat/threads/:id',
  params: ThreadParams,
  response: ok,
});

/** Streams ChatEvent lines; declared here for its paths and bodies only. */
export const sendMessagePath = (id: string) => `/api/chat/threads/${id}/messages`;
export const decideApprovalsPath = (id: string) => `/api/chat/threads/${id}/approvals`;
