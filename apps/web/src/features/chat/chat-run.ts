import type { ChatEvent, ChatMessage, ChatPart, ToolPart } from '@skb/core';

/**
 * A run in progress, built from the stream (task 13.02): the person's message, the assistant's
 * parts so far, and how it ended. Kept apart from the saved thread, which replaces it once the
 * run is over.
 */

export type RunPhase = 'streaming' | 'failed' | 'stopped';

export interface LiveRun {
  phase: RunPhase;
  /** The message just sent (a resumed run has none: its message is already saved). */
  user: ChatMessage | null;
  assistant: { id: string; createdAt: string; parts: ChatPart[] } | null;
  error: { code: string; message: string } | null;
}

export const newRun = (assistant: LiveRun['assistant'] = null): LiveRun => ({
  phase: 'streaming',
  user: null,
  assistant,
  error: null,
});

function upsertTool(parts: ChatPart[], part: ToolPart): ChatPart[] {
  const index = parts.findIndex((entry) => entry.type === 'tool' && entry.callId === part.callId);
  if (index < 0) return [...parts, part];
  return parts.map((entry, at) => (at === index ? part : entry));
}

/** Applies one event to the run; `done` is handled by the caller, which swaps in the saved thread. */
export function applyChatEvent(run: LiveRun, event: ChatEvent): LiveRun {
  switch (event.type) {
    case 'user':
      return { ...run, user: event.message };
    case 'assistant':
      // A resumed run carries on in the message it paused in.
      return {
        ...run,
        assistant:
          run.assistant?.id === event.id
            ? run.assistant
            : { id: event.id, createdAt: event.createdAt, parts: [] },
      };
    case 'passages': {
      if (!run.assistant) return run;
      const parts = run.assistant.parts.filter((part) => part.type !== 'passages');
      return {
        ...run,
        assistant: {
          ...run.assistant,
          parts: [{ type: 'passages', passages: event.passages }, ...parts],
        },
      };
    }
    case 'text': {
      if (!run.assistant) return run;
      const parts = [...run.assistant.parts];
      const last = parts.at(-1);
      if (last?.type === 'text')
        parts[parts.length - 1] = { type: 'text', text: last.text + event.delta };
      else parts.push({ type: 'text', text: event.delta });
      return { ...run, assistant: { ...run.assistant, parts } };
    }
    case 'tool':
      return run.assistant
        ? {
            ...run,
            assistant: { ...run.assistant, parts: upsertTool(run.assistant.parts, event.part) },
          }
        : run;
    case 'error':
      return {
        ...run,
        phase: event.code === 'cancelled' ? 'stopped' : 'failed',
        error: { code: event.code, message: event.message },
      };
    default:
      return run;
  }
}

/** The saved messages with a run's messages on the end (or in place, when it resumes one). */
export function withRun(saved: readonly ChatMessage[], run: LiveRun | undefined): ChatMessage[] {
  if (!run) return [...saved];
  const messages = [...saved];
  if (run.user && !messages.some((message) => message.id === run.user?.id)) messages.push(run.user);
  if (run.assistant) {
    const live: ChatMessage = {
      id: run.assistant.id as ChatMessage['id'],
      role: 'assistant',
      parts: run.assistant.parts,
      mentions: [],
      createdAt: run.assistant.createdAt,
    };
    const at = messages.findIndex((message) => message.id === live.id);
    if (at >= 0) messages[at] = live;
    else messages.push(live);
  }
  return messages;
}
