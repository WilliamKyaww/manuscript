import type { ToolPart, ToolState } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Ban, Check, CircleAlert, Hourglass, ShieldAlert, Undo2, X } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { useApi } from '../../lib/api/context';
import { notifyError } from '../../lib/notify';
import { agentActionsQuery, useAgentActions } from '../agent/api';
import type { ApprovalChoice } from './chat-store';

/**
 * What the assistant did, as the person sees it (tasks 13.05–13.07, agent-system.md §§5–7): one
 * activity row per tool call, an approval card for a call that is waiting on them, and — for a
 * call that made something — a result card that opens it and undoes it.
 */

const STATE_LABEL: Record<ToolState, string> = {
  running: 'Working',
  ok: 'Done',
  error: 'Failed',
  denied: 'Not allowed',
  declined: 'Declined',
  awaiting_approval: 'Waiting for you',
};

function StateIcon({ state }: { state: ToolState }) {
  const props = { 'aria-hidden': true, size: 14 } as const;
  switch (state) {
    case 'running':
      return <Spinner size="sm" label="" />;
    case 'ok':
      return <Check {...props} className="text-success" />;
    case 'error':
      return <CircleAlert {...props} className="text-danger" />;
    case 'denied':
      return <ShieldAlert {...props} className="text-warning" />;
    case 'declined':
      return <Ban {...props} className="text-muted" />;
    case 'awaiting_approval':
      return <Hourglass {...props} className="text-warning" />;
  }
}

const pretty = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 2_000 ? `${text.slice(0, 2_000)}\n…` : text;
  } catch {
    return String(value);
  }
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

/** Where a finished call's result can be opened, by what the tool made. */
function resultLinks(
  part: ToolPart,
): { label: string; to: string; params?: Record<string, string> }[] {
  const output = asRecord(part.output);
  const id = typeof output.id === 'string' ? output.id : null;
  switch (part.tool) {
    case 'create_note':
    case 'update_note':
    case 'move_note':
      return id ? [{ label: 'Open note', to: '/notes/$noteId', params: { noteId: id } }] : [];
    case 'create_flashcards': {
      const setId = typeof output.setId === 'string' ? output.setId : null;
      return [
        { label: 'Review in the Inbox', to: '/inbox' },
        ...(setId && output.status !== 'draft'
          ? [{ label: 'Open card set', to: '/review/sets/$setId', params: { setId } }]
          : []),
      ];
    }
    case 'create_quiz':
      return [{ label: 'Open Practice', to: '/practice' }];
    case 'create_concept':
      return id
        ? [{ label: 'Open concept', to: '/concepts/$conceptId', params: { conceptId: id } }]
        : [];
    default:
      return [];
  }
}

function ResultCard({ part }: { part: ToolPart }) {
  const api = useApi();
  const { undo } = useAgentActions();
  const actions = useQuery({ ...agentActionsQuery(api), enabled: Boolean(part.actionId) });
  const action = actions.data?.actions.find((entry) => entry.id === part.actionId);
  const links = resultLinks(part);
  if (links.length === 0 && !action) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {action?.status !== 'undone' &&
        links.map((link) => (
          <Link
            key={link.label}
            // The route is chosen by tool above; its params are the ids the tool returned.
            to={link.to as never}
            params={link.params as never}
            className={buttonClasses('secondary', 'sm')}
          >
            {link.label}
          </Link>
        ))}
      {action?.status === 'undone' && <Badge>Undone</Badge>}
      {action?.undoable && (
        <Button
          size="sm"
          variant="ghost"
          loading={undo.isPending}
          onClick={() => undo.mutate(action.id, { onError: notifyError })}
        >
          <Undo2 aria-hidden="true" size={14} /> Undo
        </Button>
      )}
    </div>
  );
}

function Details({ part }: { part: ToolPart }) {
  const input = pretty(part.input);
  const output = part.state === 'ok' ? pretty(part.output) : '';
  if (!input && !output && !part.reason) return null;
  return (
    <details className="mt-1 text-xs text-muted">
      <summary className="cursor-pointer select-none">Details</summary>
      <div className="mt-1 space-y-2">
        {part.reason && <p>{part.reason}</p>}
        {input && (
          <div>
            <p className="font-medium">Arguments</p>
            <pre className="max-h-48 overflow-auto rounded bg-surface-sunken p-2 font-mono">
              {input}
            </pre>
          </div>
        )}
        {output && (
          <div>
            <p className="font-medium">Result</p>
            <pre className="max-h-48 overflow-auto rounded bg-surface-sunken p-2 font-mono">
              {output}
            </pre>
          </div>
        )}
      </div>
    </details>
  );
}

export function ActivityRow({ part }: { part: ToolPart }) {
  return (
    <li className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
          <StateIcon state={part.state} />
        </span>
        <span className="min-w-0 flex-1 break-words">{part.summary}</span>
        {part.risk === 'write' && <Badge tone="info">Changes</Badge>}
        {part.risk === 'destructive' && <Badge tone="warning">Deletes</Badge>}
        <span className="sr-only">{STATE_LABEL[part.state]}</span>
        {part.state !== 'ok' && part.state !== 'running' && (
          <span aria-hidden="true" className="text-xs text-muted">
            {STATE_LABEL[part.state]}
          </span>
        )}
      </div>
      <Details part={part} />
      {part.state === 'ok' && part.risk !== 'read' && <ResultCard part={part} />}
    </li>
  );
}

export function ApprovalCard({
  part,
  choice,
  disabled,
  onChoose,
}: {
  part: ToolPart;
  choice: ApprovalChoice | undefined;
  disabled: boolean;
  onChoose(choice: ApprovalChoice): void;
}) {
  const destructive = part.risk === 'destructive';
  return (
    <li
      aria-label={`Approval needed: ${part.summary}`}
      className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm"
    >
      <div className="flex items-start gap-2">
        <Hourglass aria-hidden="true" size={14} className="mt-1 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{part.summary}</p>
          <p className="text-xs text-muted">
            {part.reason ??
              (destructive
                ? 'This deletes or merges things, so it always asks.'
                : 'This needs your approval.')}
          </p>
        </div>
        {destructive && <Badge tone="warning">Deletes</Badge>}
      </div>
      <Details part={{ ...part, reason: null }} />
      {choice ? (
        <p className="mt-2 text-xs text-muted" role="status">
          {choice === 'decline' ? 'Declined' : 'Approved'}. Waiting for your other answers…
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={destructive ? 'danger' : 'primary'}
            disabled={disabled}
            onClick={() => onChoose('once')}
          >
            <Check aria-hidden="true" size={14} /> Approve
          </Button>
          {part.canAllowForChat && (
            <Button size="sm" disabled={disabled} onClick={() => onChoose('chat')}>
              Approve for this chat
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChoose('decline')}>
            <X aria-hidden="true" size={14} /> Decline
          </Button>
        </div>
      )}
    </li>
  );
}
