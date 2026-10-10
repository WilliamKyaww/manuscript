import type { ChatMessage, ChatPart, ToolPart } from '@skb/core';
import { Link, useRouter } from '@tanstack/react-router';
import { ExternalLink } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { Badge } from '../../components/Badge';
import { buttonClasses } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { cn } from '../../lib/cn';
import { locatorHref } from '../library/links';
import { CardMarkdown } from '../review/CardMarkdown';
import type { ApprovalChoice } from './chat-store';
import { withCitationLinks } from './citations';
import { ActivityRow, ApprovalCard } from './ToolParts';

/**
 * One message in a conversation (tasks 13.04–13.07). The person's words sit on the right. The
 * assistant's message is a sequence of text and activity, followed by how well grounded it is and
 * the passages it could cite.
 */

const GROUNDING = {
  sources: { label: 'From your sources', tone: 'success' },
  mixed: { label: 'Partly general knowledge', tone: 'warning' },
  general: { label: 'General knowledge', tone: 'warning' },
  not_found: { label: 'Not in your sources', tone: 'neutral' },
} as const;

type Block = { kind: 'part'; part: ChatPart } | { kind: 'tools'; parts: ToolPart[] };

/** Consecutive tool calls form one activity list. */
function blocks(parts: readonly ChatPart[]): Block[] {
  const result: Block[] = [];
  for (const part of parts) {
    if (part.type === 'passages' || part.type === 'grounding') continue;
    if (part.type === 'tool') {
      const last = result.at(-1);
      if (last?.kind === 'tools') last.parts.push(part);
      else result.push({ kind: 'tools', parts: [part] });
    } else result.push({ kind: 'part', part });
  }
  return result;
}

export interface MessageViewProps {
  message: ChatMessage;
  /** A run is writing to this message (or another run is going). */
  busy: boolean;
  streaming: boolean;
  onDecide(
    message: ChatMessage,
    decisions: { approvalId: string; decision: ApprovalChoice }[],
  ): void;
}

function UserMessage({ message }: { message: ChatMessage }) {
  const text = message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
  return (
    <article aria-label="You" className="flex justify-end">
      <div className="max-w-[85%] rounded-lg bg-accent-subtle px-3 py-2 text-sm">
        <p className="whitespace-pre-wrap break-words">{text}</p>
        {message.mentions.length > 0 && (
          <ul aria-label="Mentioned" className="mt-1 flex flex-wrap gap-1">
            {message.mentions.map((mention) => (
              <li key={`${mention.kind}:${mention.id}`}>
                <Badge>
                  {mention.kind} · {mention.label}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function MessageView({ message, busy, streaming, onDecide }: MessageViewProps) {
  const router = useRouter();
  const [choices, setChoices] = useState<Record<string, ApprovalChoice>>({});
  if (message.role === 'user') return <UserMessage message={message} />;

  const passages = message.parts.flatMap((part) => (part.type === 'passages' ? part.passages : []));
  const grounding = message.parts.find((part) => part.type === 'grounding');
  const waiting = message.parts.flatMap((part) =>
    part.type === 'tool' && part.state === 'awaiting_approval' && part.approvalId ? [part] : [],
  );

  const choose = (part: ToolPart, choice: ApprovalChoice) => {
    const next = { ...choices, [part.approvalId ?? '']: choice };
    setChoices(next);
    if (waiting.every((entry) => next[entry.approvalId ?? ''])) {
      setChoices({});
      onDecide(
        message,
        waiting.map((entry) => ({
          approvalId: entry.approvalId ?? '',
          decision: next[entry.approvalId ?? ''] ?? 'decline',
        })),
      );
    }
  };

  // Citation links go through the router (no page reload).
  const follow = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement).closest('a');
    const href = anchor?.getAttribute('href');
    if (!href?.startsWith('/') || anchor?.target) return;
    event.preventDefault();
    router.history.push(href);
  };

  const empty = message.parts.every((part) => part.type === 'passages');
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: delegates clicks on its links, which handle keys themselves.
    <article aria-label="Assistant" className="space-y-3" onClick={follow}>
      {blocks(message.parts).map((block, index) => {
        const key = `${message.id}:${index}`;
        if (block.kind === 'tools')
          return (
            <ul key={key} aria-label="Assistant activity" className="space-y-1.5">
              {block.parts.map((part) =>
                part.state === 'awaiting_approval' && part.approvalId ? (
                  <ApprovalCard
                    key={part.callId}
                    part={part}
                    choice={choices[part.approvalId]}
                    disabled={busy}
                    onChoose={(choice) => choose(part, choice)}
                  />
                ) : (
                  <ActivityRow key={part.callId} part={part} />
                ),
              )}
            </ul>
          );
        const { part } = block;
        if (part.type === 'text')
          return (
            <div key={key} aria-live="polite" aria-busy={streaming}>
              <CardMarkdown content={withCitationLinks(part.text, passages)} cardId={message.id} />
            </div>
          );
        if (part.type === 'notice')
          return (
            <p
              key={key}
              role={part.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'rounded-md px-3 py-2 text-sm',
                part.tone === 'error'
                  ? 'bg-danger-subtle text-danger'
                  : 'bg-surface-sunken text-muted',
              )}
            >
              {part.text}
              {part.tone === 'error' && /settings|provider|budget|model/iu.test(part.text) ? (
                <>
                  {' '}
                  <Link to="/settings" className="underline">
                    Settings → AI
                  </Link>
                </>
              ) : null}
            </p>
          );
        return null;
      })}
      {streaming && empty && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" label="" /> Thinking…
        </p>
      )}
      {grounding?.type === 'grounding' && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={GROUNDING[grounding.grounding].tone}>
            {GROUNDING[grounding.grounding].label}
          </Badge>
          {grounding.dropped.length > 0 && (
            <span className="text-xs text-muted">
              Removed citations to passages that were not given: {grounding.dropped.join(', ')}.
            </span>
          )}
        </div>
      )}
      {passages.length > 0 && (
        <details open={grounding?.type === 'grounding' && grounding.grounding !== 'sources'}>
          <summary className="cursor-pointer text-sm font-medium">
            Passages used ({passages.length})
          </summary>
          <ol aria-label="Passages" className="mt-2 space-y-2">
            {passages.map((passage) => (
              <li key={passage.key} className="rounded-md border border-border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Badge
                    tone={
                      grounding?.type === 'grounding' && grounding.cited.includes(passage.key)
                        ? 'accent'
                        : 'neutral'
                    }
                  >
                    {passage.key}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {passage.title}
                    {passage.label ? ` · ${passage.label}` : ''}
                  </span>
                  <a
                    href={locatorHref(passage.locator)}
                    className={buttonClasses('ghost', 'sm')}
                    aria-label={`Open ${passage.key}: ${passage.title}`}
                  >
                    <ExternalLink aria-hidden="true" size={14} />
                  </a>
                </div>
                <p className="mt-1 line-clamp-3 text-xs text-muted">{passage.text}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
