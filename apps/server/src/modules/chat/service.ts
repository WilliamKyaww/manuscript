import {
  AiError,
  type AskFilter,
  type AskScope,
  type ChatEvent,
  type ChatMessage,
  type ChatMode,
  type ChatPart,
  type ChatThread,
  type ChatThreadDetail,
  ConflictError,
  checkCitations,
  classifyGrounding,
  type DecideApprovalsInput,
  estimateTokens,
  type IdFactory,
  type Mention,
  NotFoundError,
  type Passage,
  type SendMessageInput,
  SendMessageSchema,
  type ToolPart,
  UNTRUSTED_RULE,
  wrapUntrusted,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import type {
  AgentMode,
  AgentRunner,
  ApprovalDecision,
  ConversationMessage,
  PendingApproval,
  StreamEnd,
} from '../agent/runner';
import type { RetrievalService } from '../ai/retrieval';
import type { AiService } from '../ai/service';
import { summariseConversation } from '../ai/summarise';
import {
  type ChatRepository,
  messageView,
  type Pending,
  plainText,
  type ThreadRow,
} from './repository';

/**
 * Chat (tasks 13.02, 13.10, agent-system.md §§3, 4, 5, 9): persistent threads in which the
 * assistant answers from the student's material and acts through the tools. A message becomes a
 * run of the agent runner whose events are stored as the assistant's message and streamed to the
 * client; a run that needs the student's approval pauses (everything it needs is kept with the
 * thread) and carries on when they decide. Retrieved passages are given to the model with citation
 * keys, the keys in its answer are checked, and the answer is labelled by how grounded it is. Long
 * threads keep their latest turns and a summary of the rest.
 */

const MODE_OF: Record<ChatMode, AgentMode> = {
  assistant: 'agent',
  tutor: 'tutor',
  read_only: 'ask',
};

const SCOPE_RULES: Record<AskScope, string> = {
  sources:
    'Scope: sources. Answer only from the numbered passages and from what the tools return about the student’s lecture material. If they do not contain the answer, say "I could not find this in your sources." Do not add anything from general knowledge.',
  knowledge:
    'Scope: knowledge base. Answer only from the numbered passages and from what the tools return about the student’s lecture material and notes. If they do not contain the answer, say "I could not find this in your sources." Do not add anything from general knowledge.',
  general:
    'Scope: general. Prefer the passages and cite them. You may add general knowledge where they fall short, but never put a citation key on it: uncited sentences are shown as general knowledge.',
};

const CITING =
  'After each sentence that uses a passage, cite it with its key in square brackets, such as [S2] or [S1, S3]. Use only keys that appear in the passages.';

const KEEP_TURNS = 2;
const TITLE_LENGTH = 60;
const TRANSCRIPT_LINE = 700;

export interface ChatDependencies {
  repo: ChatRepository;
  runner: AgentRunner;
  ai: AiService;
  retrieval: RetrievalService;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
}

export type ChatService = ReturnType<typeof createChatService>;

const costOf = (
  prices: { inputPrice: number | null; outputPrice: number | null },
  input: number,
  output: number,
) => (input * (prices.inputPrice ?? 0) + output * (prices.outputPrice ?? 0)) / 1_000_000;

function upsertTool(parts: ChatPart[], part: ToolPart): void {
  const index = parts.findIndex((entry) => entry.type === 'tool' && entry.callId === part.callId);
  if (index >= 0) parts[index] = part;
  else parts.push(part);
}

function appendText(parts: ChatPart[], delta: string): void {
  const last = parts.at(-1);
  if (last?.type === 'text') last.text += delta;
  else parts.push({ type: 'text', text: delta });
}

const oneLine = (text: string) => text.replace(/\s+/gu, ' ').trim();

/** The words of a message as the model has it, for a transcript. */
function wordsOf(message: ConversationMessage): string {
  const { content } = message;
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'tool-call') return `(used ${part.toolName})`;
      return '';
    })
    .filter(Boolean)
    .join(' ');
}

export function createChatService(deps: ChatDependencies) {
  const { repo, runner, ai, retrieval, clock, ids, logger } = deps;
  const now = () => clock.now().toISOString();

  const view = (row: ThreadRow): ChatThread => ({
    id: row.id as ChatThread['id'],
    title: row.title,
    mode: row.mode,
    scope: row.scope,
    filter: row.filter,
    allowedTools: row.allowedTools,
    messageCount: row.messageCount,
    awaitingApproval: row.pending !== null,
    compacted: row.summary !== '',
    usage: {
      requests: row.assistantCount,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cost: row.cost,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const require = (id: string): ThreadRow => {
    const row = repo.thread(id);
    if (!row) throw new NotFoundError('That conversation does not exist.');
    return row;
  };

  /** Filters from what was @mentioned, on top of the thread's own. */
  function filterFor(
    thread: ThreadRow,
    mentions: readonly Mention[],
    extra?: AskFilter,
  ): AskFilter {
    const filter: AskFilter = { ...thread.filter, ...extra };
    for (const mention of mentions) {
      if (mention.kind === 'module') filter.moduleId = mention.id as never;
      if (mention.kind === 'lecture') filter.lectureId = mention.id as never;
      if (mention.kind === 'source')
        filter.sourceIds = [...new Set([...(filter.sourceIds ?? []), mention.id])] as never;
      if (mention.kind === 'concept')
        filter.conceptIds = [...new Set([...(filter.conceptIds ?? []), mention.id])] as never;
    }
    return filter;
  }

  function instructionsFor(
    thread: ThreadRow,
    input: {
      mentions: readonly Mention[];
      selection: string | undefined;
      noteId: string | undefined;
    },
  ): string {
    const lines = [SCOPE_RULES[thread.scope], CITING];
    if (input.noteId)
      lines.push(
        `The note the student has open has the id ${input.noteId}; read it with the tools when it helps.`,
      );
    if (thread.summary) lines.push(`Earlier in this conversation (summarised): ${thread.summary}`);
    if (input.mentions.length > 0)
      lines.push(
        `The student pointed at: ${input.mentions
          .map(
            (mention) =>
              `${mention.kind} “${oneLine(mention.label).slice(0, 100)}” (id ${mention.id})`,
          )
          .join('; ')}. Use the tools to read them when you need their content.`,
      );
    if (input.selection)
      lines.push(
        `The student has this text selected on the page:\n${wrapUntrusted({ key: 'selection', title: 'Selection', location: 'selection', text: input.selection })}`,
      );
    lines.push(UNTRUSTED_RULE);
    return lines.join('\n');
  }

  /** The message sent to the model: the retrieved passages, then the question. */
  function questionMessage(text: string, passages: readonly Passage[]): string {
    const material = passages
      .map((passage) =>
        wrapUntrusted({
          key: passage.key,
          title: passage.title,
          location: passage.label,
          text: passage.text,
        }),
      )
      .join('\n\n');
    return `${passages.length ? `Passages:\n\n${material}\n\n` : ''}Question: ${text}`;
  }

  /** Keeps the latest turns and summarises the rest once the history outgrows the context budget. */
  async function compact(
    thread: ThreadRow,
    history: ConversationMessage[],
    signal: AbortSignal,
  ): Promise<{ history: ConversationMessage[]; summary: string } | null> {
    const budget = ai.settings().preferences.contextTokens;
    if (estimateTokens(JSON.stringify(history)) <= budget) return null;
    const turns = history.flatMap((message, index) => (message.role === 'user' ? [index] : []));
    const cut = turns.at(-KEEP_TURNS);
    if (turns.length <= KEEP_TURNS || cut === undefined || cut === 0) return null;
    const transcript = history
      .slice(0, cut)
      .flatMap((message) => {
        if (message.role !== 'user' && message.role !== 'assistant') return [];
        const text = oneLine(wordsOf(message).replace(/^[\s\S]*Question: /u, ''));
        return text
          ? [
              `${message.role === 'user' ? 'Student' : 'Assistant'}: ${text.slice(0, TRANSCRIPT_LINE)}`,
            ]
          : [];
      })
      .join('\n');
    try {
      const summary = await summariseConversation(ai, thread.summary, transcript, signal);
      return summary ? { history: history.slice(cut), summary } : null;
    } catch (error) {
      if (signal.aborted) throw error;
      logger.warn('chat.compaction.failed', { error });
      return null;
    }
  }

  interface Drive {
    thread: ThreadRow;
    assistant: { id: string; parts: ChatPart[]; createdAt: string };
    messages: ConversationMessage[];
    decisions: ApprovalDecision[];
    approvedCalls: string[];
    steps: number;
    context: string | undefined;
    instructions: string;
    userIndex: number;
    request: string;
    allowedTools: string[];
    signal: AbortSignal;
  }

  /** One run: streams the runner's events into the assistant's message, then settles the thread. */
  async function* drive(run: Drive): AsyncGenerator<ChatEvent> {
    const { thread, assistant, signal } = run;
    const parts = assistant.parts;
    const save = () => repo.updateMessage(assistant.id, parts);
    const asMessage = (): ChatMessage => ({
      id: assistant.id as ChatMessage['id'],
      role: 'assistant',
      parts,
      mentions: [],
      createdAt: assistant.createdAt,
    });
    const settled = () => view(require(thread.id));

    let end: StreamEnd;
    try {
      const events = runner.stream({
        mode: MODE_OF[thread.mode],
        messages: run.messages,
        decisions: run.decisions,
        approvedCalls: run.approvedCalls,
        allowedTools: run.allowedTools,
        stepsUsed: run.steps,
        ...(run.context ? { context: run.context } : {}),
        instructions: run.instructions,
        signal,
        threadId: thread.id,
        purpose: 'chat',
      });
      for (;;) {
        const next = await events.next();
        if (next.done) {
          end = next.value;
          break;
        }
        const event = next.value;
        if (event.type === 'text') {
          appendText(parts, event.delta);
          yield { type: 'text', delta: event.delta };
        } else {
          upsertTool(parts, event.part);
          yield { type: 'tool', part: event.part };
        }
      }
    } catch (error) {
      // Stopped or failed: keep what was done, mark what was unfinished, and say so.
      for (const [index, part] of parts.entries())
        if (
          part.type === 'tool' &&
          (part.state === 'running' || part.state === 'awaiting_approval')
        )
          parts[index] = { ...part, state: 'error', reason: 'Stopped before it finished.' };
      const stopped = signal.aborted;
      const aiError = error instanceof AiError ? error : null;
      parts.push({
        type: 'notice',
        tone: stopped ? 'info' : 'error',
        text: stopped
          ? 'Stopped.'
          : (aiError?.message ?? 'Something went wrong while answering. Try again.'),
      });
      if (!stopped && !aiError) logger.error('chat.run.failed', { error });
      save();
      repo.updateThread(thread.id, { pending: null }, now());
      yield {
        type: 'error',
        code: stopped
          ? 'cancelled'
          : aiError
            ? (aiError.reason as 'not_configured' | 'budget' | 'provider')
            : 'failed',
        message: stopped
          ? 'Stopped.'
          : (aiError?.message ?? 'Something went wrong while answering.'),
      };
      return;
    }

    const prices = ai.settings().preferences.roles.chat;
    repo.addUsage(
      thread.id,
      end.usage.inputTokens,
      end.usage.outputTokens,
      costOf(prices, end.usage.inputTokens, end.usage.outputTokens),
    );

    // Tools approved "for this chat" stay approved.
    const allowedTools = run.allowedTools;

    if (end.finish === 'paused') {
      const pending: Pending = {
        assistantMessageId: assistant.id,
        calls: end.pending.map((call: PendingApproval) => ({ ...call })),
        approvedCalls: end.approvedCalls,
        steps: end.steps,
        ...(run.context ? { context: run.context } : {}),
        instructions: run.instructions,
        userIndex: run.userIndex,
        request: run.request,
      };
      save();
      repo.updateThread(thread.id, { history: end.messages, pending, allowedTools }, now());
      yield { type: 'paused', approvalIds: end.pending.map((call) => call.approvalId) };
      yield { type: 'done', message: asMessage(), thread: settled() };
      return;
    }

    // Check the citations in what was said, and label the answer by how grounded it is.
    const passages = parts.flatMap((part) => (part.type === 'passages' ? part.passages : []));
    const known = new Set(passages.map((passage) => passage.key));
    const cited: string[] = [];
    const dropped: string[] = [];
    for (const [index, part] of parts.entries()) {
      if (part.type !== 'text') continue;
      const checked = checkCitations(part.text, known);
      parts[index] = { type: 'text', text: checked.text };
      for (const key of checked.used) if (!cited.includes(key)) cited.push(key);
      for (const key of checked.unknown) if (!dropped.includes(key)) dropped.push(key);
    }
    const said = plainText(parts);
    const usedTools = parts.some((part) => part.type === 'tool' && part.state === 'ok');
    if (said.trim() && (passages.length > 0 || !usedTools)) {
      const grounding =
        passages.length === 0 && thread.scope !== 'general' ? 'not_found' : classifyGrounding(said);
      parts.push({ type: 'grounding', grounding, cited, dropped });
    }
    if (end.finish === 'step-limit' || end.finish === 'timeout')
      parts.push({
        type: 'notice',
        tone: 'info',
        text:
          end.finish === 'timeout'
            ? 'I ran out of time before finishing. What was done is listed above.'
            : 'I used all the steps allowed for one request. What was done is listed above.',
      });
    save();

    // The model keeps the question without the passages, which only mattered for this answer.
    const history = [...end.messages];
    if (run.request && history[run.userIndex]?.role === 'user')
      history[run.userIndex] = { role: 'user', content: `Question: ${run.request}` };
    let summary = thread.summary;
    let kept = history;
    const compacted = await compact(thread, history, signal);
    if (compacted) {
      kept = compacted.history;
      summary = compacted.summary;
    }
    repo.updateThread(thread.id, { history: kept, summary, pending: null, allowedTools }, now());
    yield { type: 'done', message: asMessage(), thread: settled() };
  }

  return {
    listThreads: (query?: string): ChatThread[] => repo.threads(query).map(view),

    createThread(input: {
      title?: string | undefined;
      mode: ChatMode;
      scope: AskScope;
      filter: AskFilter;
    }): ChatThread {
      const id = ids('thread');
      repo.insertThread({
        id,
        title: input.title?.trim() || 'New chat',
        mode: input.mode,
        scope: input.scope,
        filter: input.filter,
        at: now(),
      });
      return view(require(id));
    },

    getThread(id: string): ChatThreadDetail {
      const row = require(id);
      return { ...view(row), messages: repo.messages(id).map(messageView) };
    },

    updateThread(
      id: string,
      patch: {
        title?: string | undefined;
        mode?: ChatMode | undefined;
        scope?: AskScope | undefined;
        filter?: AskFilter | undefined;
        clearAllowedTools?: boolean | undefined;
      },
    ): ChatThread {
      require(id);
      repo.updateThread(
        id,
        {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.mode !== undefined ? { mode: patch.mode } : {}),
          ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
          ...(patch.filter !== undefined ? { filter: patch.filter } : {}),
          ...(patch.clearAllowedTools ? { allowedTools: [] } : {}),
        },
        now(),
      );
      return view(require(id));
    },

    /** Checked before a stream opens, so a refusal is an ordinary problem response. */
    assertCanSend(id: string): void {
      if (require(id).pending)
        throw new ConflictError(
          'This conversation is waiting for you to approve or decline something. Decide that first.',
        );
    },
    assertCanDecide(id: string): void {
      if (!require(id).pending)
        throw new ConflictError('Nothing in this conversation is waiting for approval.');
    },

    deleteThread(id: string): void {
      require(id);
      repo.removeThread(id);
    },

    /** Sends a message and streams the run: the saved message, passages, text, tools, the end. */
    async *send(
      threadId: string,
      raw: SendMessageInput,
      signal: AbortSignal,
    ): AsyncGenerator<ChatEvent> {
      const input = SendMessageSchema.parse(raw);
      const thread = require(threadId);
      if (thread.pending)
        throw new ConflictError(
          'This conversation is waiting for you to approve or decline something. Decide that first.',
        );
      try {
        ai.require('chat');
      } catch (error) {
        if (error instanceof AiError) {
          yield { type: 'error', code: error.reason, message: error.message };
          return;
        }
        throw error;
      }

      const at = now();
      const userMessage = {
        id: ids('message'),
        threadId,
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: input.text }],
        mentions: input.mentions,
        createdAt: at,
      };
      repo.transaction(() => {
        repo.insertMessage(userMessage);
        const title =
          thread.messageCount === 0 && thread.title === 'New chat'
            ? oneLine(input.text).slice(0, TITLE_LENGTH)
            : undefined;
        repo.updateThread(threadId, title ? { title } : {}, at);
      });
      yield { type: 'user', message: messageView(userMessage) };

      // What the assistant is given: the passages that match, the page, what was pointed at.
      const filter = filterFor(
        thread,
        input.mentions,
        input.onlyThisPage ? input.context?.filter : undefined,
      );
      let passages: Passage[] = [];
      try {
        const found = await retrieval.retrieve({
          question: input.text,
          scope: thread.scope,
          filter,
          budgetTokens: ai.settings().preferences.contextTokens,
          signal,
        });
        passages = found.passages;
      } catch (error) {
        if (signal.aborted) throw error;
        logger.warn('chat.retrieval.failed', { error });
      }

      const assistant = {
        id: ids('message'),
        createdAt: now(),
        parts: [] as ChatPart[],
      };
      if (passages.length > 0) {
        assistant.parts.push({ type: 'passages', passages });
      }
      repo.insertMessage({
        id: assistant.id,
        threadId,
        role: 'assistant',
        parts: assistant.parts,
        mentions: [],
        createdAt: assistant.createdAt,
      });
      yield { type: 'assistant', id: assistant.id as never, createdAt: assistant.createdAt };
      if (passages.length > 0) yield { type: 'passages', passages };

      const history = [...thread.history];
      const userIndex = history.length;
      history.push({ role: 'user', content: questionMessage(input.text, passages) });
      yield* drive({
        thread,
        assistant,
        messages: history,
        decisions: [],
        approvedCalls: [],
        steps: 0,
        context: input.context?.label,
        instructions: instructionsFor(thread, {
          mentions: input.mentions,
          selection: input.context?.selection,
          noteId: input.context?.noteId,
        }),
        userIndex,
        request: input.text,
        allowedTools: thread.allowedTools,
        signal,
      });
    },

    /** Applies the student's decisions to a paused run and carries on streaming it. */
    async *decide(
      threadId: string,
      input: DecideApprovalsInput,
      signal: AbortSignal,
    ): AsyncGenerator<ChatEvent> {
      const thread = require(threadId);
      const pending = thread.pending;
      if (!pending)
        throw new ConflictError('Nothing in this conversation is waiting for approval.');
      const decided = new Map(input.decisions.map((entry) => [entry.approvalId, entry.decision]));
      const missing = pending.calls.filter((call) => !decided.has(call.approvalId));
      if (missing.length > 0)
        throw new ConflictError(
          'Decide on every call that is waiting: approve or decline each one.',
        );
      if ([...decided.keys()].some((id) => !pending.calls.some((call) => call.approvalId === id)))
        throw new ConflictError('One of those approvals is not waiting any more.');
      const message = repo.message(pending.assistantMessageId);
      if (!message) throw new NotFoundError('The message this belongs to no longer exists.');
      try {
        ai.require('chat');
      } catch (error) {
        if (error instanceof AiError) {
          yield { type: 'error', code: error.reason, message: error.message };
          return;
        }
        throw error;
      }

      const allowedTools = new Set(thread.allowedTools);
      const decisions: ApprovalDecision[] = pending.calls.map((call) => {
        const choice = decided.get(call.approvalId) ?? 'decline';
        // Destructive calls ask every time, so "for this chat" does not apply to them.
        if (choice === 'chat' && call.risk !== 'destructive') allowedTools.add(call.tool);
        return {
          pending: call,
          approved: choice !== 'decline',
          forChat: choice === 'chat',
        };
      });

      // The run carries on in the same assistant message.
      repo.updateThread(threadId, { pending: null }, now());
      yield { type: 'assistant', id: message.id as never, createdAt: message.createdAt };
      yield* drive({
        thread: { ...thread, pending: null },
        assistant: { id: message.id, parts: message.parts, createdAt: message.createdAt },
        messages: thread.history,
        decisions,
        approvedCalls: pending.approvedCalls,
        steps: pending.steps,
        context: pending.context,
        instructions: pending.instructions,
        userIndex: pending.userIndex,
        request: pending.request,
        allowedTools: [...allowedTools],
        signal,
      });
    },
  };
}
