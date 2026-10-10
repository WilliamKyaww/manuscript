import type { AskScope, ChatMessage, ChatMode, SendMessageInput } from '@skb/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MessagesSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { notifyError } from '../../lib/notify';
import { aiStatusQuery } from '../ai/api';
import { usePageScope } from '../ai/usePageScope';
import { threadQuery, useChatActions } from './api';
import { Composer } from './Composer';
import { withRun } from './chat-run';
import { type ApprovalChoice, useChat } from './chat-store';
import { MessageView } from './MessageView';

/**
 * One conversation with its message box (tasks 13.02–13.10), used by the Chat page and the side
 * panel. With no thread yet it is a new chat: the first message creates the thread.
 */

const EXAMPLES = [
  'Create flashcards from lectures 1–3',
  'Summarise the consensus lectures into a note, using my notes too',
  'Explain this page in simpler terms',
];

export interface ChatWorkspaceProps {
  threadId: string | null;
  onThreadCreated(id: string): void;
  compact?: boolean;
}

function UsageLine({
  usage,
  compacted,
}: {
  usage: { requests: number; inputTokens: number; outputTokens: number; cost: number };
  compacted: boolean;
}) {
  if (usage.requests === 0 && !compacted) return null;
  return (
    <p className="border-b border-border px-3 py-1 text-xs text-muted">
      {usage.requests} {usage.requests === 1 ? 'answer' : 'answers'} ·{' '}
      {usage.inputTokens.toLocaleString('en-GB')} tokens in ·{' '}
      {usage.outputTokens.toLocaleString('en-GB')} out
      {usage.cost > 0 ? ` · about $${usage.cost.toFixed(4)}` : ''}
      {compacted ? ' · earlier messages are summarised to fit the model' : ''}
    </p>
  );
}

export function ChatWorkspace({ threadId, onThreadCreated, compact }: ChatWorkspaceProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const status = useQuery(aiStatusQuery(api));
  const detail = useQuery({
    ...threadQuery(api, threadId ?? ''),
    enabled: threadId !== null,
  });
  const actions = useChatActions();
  const run = useChat((state) => (threadId ? state.runs[threadId] : undefined));
  const selection = useChat((state) => state.selection);
  const page = usePageScope();
  const [draft, setDraft] = useState<{ mode: ChatMode; scope: AskScope }>({
    mode: 'assistant',
    scope: 'knowledge',
  });
  const log = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);

  const thread = detail.data;
  const settings = thread ?? draft;
  const messages = withRun(thread?.messages ?? [], run);
  const streaming = run?.phase === 'streaming';
  const ready = status.data?.enabled ?? false;
  const waiting = Boolean(thread?.awaitingApproval) && !streaming;

  // Follow the conversation as it grows, unless the person has scrolled up to read.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every change to the conversation.
  useEffect(() => {
    const element = log.current;
    if (element && stuck.current) element.scrollTop = element.scrollHeight;
  }, [messages.length, run?.assistant?.parts, run?.error]);

  const changeSettings = (patch: { mode?: ChatMode; scope?: AskScope }) => {
    if (threadId) actions.update.mutate({ id: threadId, ...patch }, { onError: notifyError });
    else setDraft((current) => ({ ...current, ...patch }));
  };

  const send = async (input: SendMessageInput) => {
    stuck.current = true;
    let id = threadId;
    if (!id) {
      try {
        const created = await actions.create.mutateAsync({ ...draft });
        id = created.id;
        onThreadCreated(id);
      } catch (error) {
        notifyError(error);
        return;
      }
    }
    void useChat.getState().send(api, queryClient, id, input);
  };

  const decide = (
    message: ChatMessage,
    decisions: { approvalId: string; decision: ApprovalChoice }[],
  ) => {
    if (!threadId) return;
    stuck.current = true;
    void useChat.getState().decide(api, queryClient, threadId, message, decisions);
  };

  const blocked = !ready
    ? 'Chat needs an AI model. Set one up in Settings.'
    : waiting
      ? 'Approve or decline the request above to carry on.'
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {thread && <UsageLine usage={thread.usage} compacted={thread.compacted} />}
      {thread && thread.allowedTools.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1 text-xs text-muted">
          Allowed without asking in this chat: {thread.allowedTools.join(', ')}.
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              actions.update.mutate(
                { id: thread.id, clearAllowedTools: true },
                { onError: notifyError },
              )
            }
          >
            Ask again
          </Button>
        </p>
      )}
      <div
        ref={log}
        role="log"
        aria-label="Conversation"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
        onScroll={(event) => {
          const element = event.currentTarget;
          stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
      >
        {threadId && detail.isPending && <LoadingState label="Loading the conversation" />}
        {detail.isError && (
          <ErrorState
            title="Could not load this conversation"
            message="Check that the Manuscript server is running."
            onRetry={() => detail.refetch()}
          />
        )}
        {messages.length === 0 && !detail.isPending && (
          <EmptyState
            icon={<MessagesSquare size={22} />}
            title="Ask, study or make something"
            description={
              <>
                <p>
                  Answers come from your own sources and notes, with citations. The assistant can
                  also make notes, cards and quizzes for you; it asks before anything risky, and you
                  can undo what it does.
                </p>
                <ul className="mt-2 list-disc pl-5 text-left">
                  {EXAMPLES.map((example) => (
                    <li key={example}>{example}</li>
                  ))}
                </ul>
              </>
            }
          />
        )}
        {messages.map((message) => (
          <MessageView
            key={message.id}
            message={message}
            busy={streaming}
            streaming={streaming && message.id === run?.assistant?.id}
            onDecide={decide}
          />
        ))}
        {run?.error && run.phase !== 'streaming' && (
          <p
            role={run.phase === 'stopped' ? 'status' : 'alert'}
            className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-muted"
          >
            {run.error.message}
            {run.error.code === 'not_configured' || run.error.code === 'budget' ? (
              <>
                {' '}
                <Link to="/settings" className="underline">
                  Settings → AI
                </Link>
              </>
            ) : null}
          </p>
        )}
      </div>
      <Composer
        compact={compact}
        mode={settings.mode}
        scope={settings.scope}
        onSettings={changeSettings}
        busy={streaming}
        blocked={blocked}
        page={page}
        selection={selection}
        onClearSelection={() => useChat.getState().clearSelection()}
        onSend={(input) => void send(input)}
        onStop={() => threadId && useChat.getState().stop(threadId)}
      />
      {status.data && !ready && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted">
          {status.data.roles.chat.reason}{' '}
          <Link to="/settings" className="underline">
            Set up AI in Settings
          </Link>
          . Everything else in Manuscript works without it.
        </p>
      )}
      {status.data?.mock && (
        <p className="border-t border-border px-3 py-1 text-xs text-muted">
          Test mode: answers come from a built-in test model.
        </p>
      )}
    </div>
  );
}
