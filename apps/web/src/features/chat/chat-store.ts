import {
  ChatEventSchema,
  type ChatMessage,
  decideApprovalsPath,
  type SendMessageInput,
  sendMessagePath,
} from '@skb/core';
import type { QueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import type { ApiClient } from '../../lib/api/client';
import { describeError } from '../../lib/notify';
import { refreshKnowledge } from '../agent/api';
import { chatKeys } from './api';
import { applyChatEvent, type LiveRun, newRun } from './chat-run';

/**
 * Chat state that outlives the views (tasks 13.02, 13.09): the side panel's visibility and thread,
 * and the run streaming into each thread. A run keeps going if the person moves to another page or
 * closes the panel; Stop is the only way to end it early.
 */

export type ApprovalChoice = 'once' | 'chat' | 'decline';

interface ChatState {
  panelOpen: boolean;
  /** The thread the panel shows; null is a new chat. */
  panelThreadId: string | null;
  /** Text selected on the page when the panel was opened, offered to the next message. */
  selection: string;
  runs: Record<string, LiveRun>;
  openPanel(thread?: string | null): void;
  closePanel(): void;
  setPanelThread(id: string | null): void;
  clearSelection(): void;
  send(
    api: ApiClient,
    queryClient: QueryClient,
    threadId: string,
    input: SendMessageInput,
  ): Promise<void>;
  decide(
    api: ApiClient,
    queryClient: QueryClient,
    threadId: string,
    message: ChatMessage,
    decisions: { approvalId: string; decision: ApprovalChoice }[],
  ): Promise<void>;
  stop(threadId: string): void;
}

const controllers = new Map<string, AbortController>();

const selectedText = () =>
  typeof window === 'undefined'
    ? ''
    : (window.getSelection()?.toString().trim().slice(0, 8_000) ?? '');

export const useChat = create<ChatState>((set, get) => {
  const setRun = (threadId: string, run: LiveRun | null) =>
    set((state) => {
      const runs = { ...state.runs };
      if (run) runs[threadId] = run;
      else delete runs[threadId];
      return { runs };
    });

  /** Streams one run into the thread's live state, then swaps in what was saved. */
  async function drive(
    api: ApiClient,
    queryClient: QueryClient,
    threadId: string,
    path: string,
    body: unknown,
    first: LiveRun,
  ): Promise<void> {
    controllers.get(threadId)?.abort();
    const controller = new AbortController();
    controllers.set(threadId, controller);
    setRun(threadId, first);
    let finished = false;
    const apply = (event: Parameters<typeof applyChatEvent>[1]) => {
      if (controllers.get(threadId) !== controller) return;
      if (event.type === 'done') {
        finished = true;
        return;
      }
      const run = get().runs[threadId];
      if (run) setRun(threadId, applyChatEvent(run, event));
    };
    try {
      await api.stream(path, body, ChatEventSchema, apply, controller.signal);
    } catch (reason) {
      if (controllers.get(threadId) !== controller) return;
      const run = get().runs[threadId];
      if (run) {
        setRun(threadId, {
          ...run,
          phase: controller.signal.aborted ? 'stopped' : 'failed',
          error: controller.signal.aborted
            ? { code: 'cancelled', message: 'Stopped.' }
            : { code: 'request', message: describeError(reason).description },
        });
      }
    }
    if (controllers.get(threadId) !== controller) return;
    controllers.delete(threadId);
    // What the run did is saved with the thread; show that, then drop the live copy.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: chatKeys.all }),
      queryClient.refetchQueries({ queryKey: chatKeys.thread(threadId) }),
    ]);
    const run = get().runs[threadId];
    if (finished || run?.phase === 'stopped' || run?.phase === 'failed') {
      // A failed or stopped run keeps its notice on screen until the person sends again.
      if (finished) setRun(threadId, null);
      else if (run) setRun(threadId, { ...run, assistant: null, user: null });
    }
    refreshKnowledge(queryClient);
  }

  return {
    panelOpen: false,
    panelThreadId: null,
    selection: '',
    runs: {},
    openPanel: (thread) =>
      set((state) => ({
        panelOpen: true,
        panelThreadId: thread === undefined ? state.panelThreadId : thread,
        selection: selectedText() || state.selection,
      })),
    closePanel: () => set({ panelOpen: false }),
    setPanelThread: (id) => set({ panelThreadId: id }),
    clearSelection: () => set({ selection: '' }),
    send: (api, queryClient, threadId, input) =>
      drive(api, queryClient, threadId, sendMessagePath(threadId), input, newRun()),
    decide(api, queryClient, threadId, message, decisions) {
      // The run carries on in the message it paused in.
      const resumed = newRun({
        id: message.id,
        createdAt: message.createdAt,
        parts: message.parts.map((part) =>
          part.type === 'tool' && part.state === 'awaiting_approval'
            ? { ...part, state: 'running' as const }
            : part,
        ),
      });
      return drive(
        api,
        queryClient,
        threadId,
        decideApprovalsPath(threadId),
        { decisions },
        resumed,
      );
    },
    stop: (threadId) => controllers.get(threadId)?.abort(),
  };
});

/** Test hook: forget every run and close the panel. */
export function resetChatState(): void {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  useChat.setState({ panelOpen: false, panelThreadId: null, selection: '', runs: {} });
}
