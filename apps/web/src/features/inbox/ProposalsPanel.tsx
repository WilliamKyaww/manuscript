import { type Proposal, type ProposalKind, RELATIONS } from '@skb/core';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Check, GitMerge, Pencil, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Input, Textarea } from '../../components/Input';
import { EmptyState } from '../../components/States';
import { cn } from '../../lib/cn';
import { describeError, notifyError, notifySuccess } from '../../lib/notify';
import { chipClasses } from '../learning/Field';
import { locatorHref } from '../library/links';
import { MarkdownPreview } from '../notes/preview/MarkdownPreview';
import { useLinkResolve } from '../notes/preview/useLinkResolve';
import { useInboxActions } from './api';

/**
 * Proposals (task 11.14): concepts, relations between them, merges, links and notes suggested by
 * the AI, each with the quote and place it came from. Accepting a relation also accepts the new
 * concepts at its ends; rejecting a concept withdraws the relations that needed it.
 */

const KIND_FILTERS: { value: ProposalKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'concept', label: 'Concepts' },
  { value: 'relation', label: 'Relations' },
  { value: 'alias', label: 'Merges' },
  { value: 'link', label: 'Links' },
  { value: 'note', label: 'Notes' },
];

const percent = (value: number) => `${Math.round(value * 100)} %`;

function Evidence({ proposal }: { proposal: Proposal }) {
  if (proposal.evidence.length === 0) return null;
  return (
    <ul className="space-y-1">
      {proposal.evidence.slice(0, 3).map((item, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: evidence has no id and never reorders.
          key={index}
          className="border-l-2 border-border-strong pl-2 text-xs text-muted"
        >
          “{item.quote.length > 280 ? `${item.quote.slice(0, 277)}…` : item.quote}”{' '}
          {item.locator ? (
            <a
              href={locatorHref(item.locator)}
              target="_blank"
              rel="noopener"
              className="underline"
            >
              {item.title} · {item.label}
            </a>
          ) : (
            <span>
              {item.title} · {item.label}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const End = ({ end }: { end: { conceptId: string | null; name: string } }) =>
  end.conceptId ? (
    <Link
      to="/concepts/$conceptId"
      params={{ conceptId: end.conceptId }}
      className="font-medium underline"
    >
      {end.name}
    </Link>
  ) : (
    <span className="font-medium">
      {end.name} <Badge tone="accent">new</Badge>
    </span>
  );

function Summary({ proposal, editing }: { proposal: Proposal; editing: ReactNode }) {
  const resolve = useLinkResolve();
  const payload = proposal.payload;
  switch (payload.kind) {
    case 'concept':
      return (
        editing ?? (
          <div className="space-y-1">
            <p className="font-medium">
              {payload.name}
              {payload.aliases.length > 0 && (
                <span className="font-normal text-muted"> · also {payload.aliases.join(', ')}</span>
              )}
            </p>
            {payload.summary && <p className="text-sm text-muted">{payload.summary}</p>}
          </div>
        )
      );
    case 'relation':
      return (
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <End end={payload.from} />
          <span className="text-muted">{RELATIONS[payload.relation].label}</span>
          <End end={payload.to} />
          <Badge tone={payload.confidence === 'EXTRACTED' ? 'success' : 'warning'}>
            {payload.confidence === 'EXTRACTED'
              ? 'Stated'
              : payload.confidence === 'INFERRED'
                ? `Inferred${payload.score !== null ? ` · ${percent(payload.score)}` : ''}`
                : 'Unsure'}
          </Badge>
        </p>
      );
    case 'alias':
      return (
        <p className="text-sm">
          Add “{payload.alias}” as another name for{' '}
          <Link
            to="/concepts/$conceptId"
            params={{ conceptId: payload.conceptId }}
            className="font-medium underline"
          >
            {payload.conceptName}
          </Link>{' '}
          <span className="text-muted">
            ({percent(payload.similarity)} alike
            {payload.judged ? ', judged the same by the model' : ''})
          </span>
        </p>
      );
    case 'link':
      return payload.variant === 'mention' ? (
        <p className="text-sm">
          In{' '}
          <Link
            to="/notes/$noteId"
            params={{ noteId: payload.noteId }}
            className="font-medium underline"
          >
            {payload.noteTitle}
          </Link>
          , link “{payload.text}” <ArrowRight aria-hidden="true" size={12} className="inline" />{' '}
          <span className="font-medium">{payload.target.title}</span>{' '}
          <span className="text-muted">({payload.target.kind})</span>
        </p>
      ) : (
        <p className="text-sm">
          <Link
            to="/notes/$noteId"
            params={{ noteId: payload.noteId }}
            className="font-medium underline"
          >
            {payload.noteTitle}
          </Link>{' '}
          is close in meaning to{' '}
          <Link
            to="/notes/$noteId"
            params={{ noteId: payload.target.id }}
            className="font-medium underline"
          >
            {payload.target.title}
          </Link>
          {payload.similarity !== null && (
            <span className="text-muted"> ({percent(payload.similarity)})</span>
          )}
          : list it under “Related”.
        </p>
      );
    default:
      return (
        editing ?? (
          <div className="space-y-2">
            <p className="font-medium">
              {payload.title}
              <span className="font-normal text-muted"> · {payload.folder || 'vault root'}</span>
            </p>
            <details className="rounded-md border border-border bg-surface-sunken">
              <summary className="cursor-pointer px-3 py-1.5 text-sm">Preview</summary>
              <MarkdownPreview
                content={payload.content}
                resolve={resolve}
                noteId={proposal.id}
                className="max-h-96 overflow-y-auto px-3 py-2"
              />
            </details>
          </div>
        )
      );
  }
}

function ProposalItem({
  proposal,
  selected,
  onSelect,
}: {
  proposal: Proposal;
  selected: boolean;
  onSelect(on: boolean): void;
}) {
  const actions = useInboxActions();
  const [editing, setEditing] = useState(false);
  const payload = proposal.payload;
  const [name, setName] = useState(payload.kind === 'concept' ? payload.name : '');
  const [summary, setSummary] = useState(payload.kind === 'concept' ? payload.summary : '');
  const [title, setTitle] = useState(payload.kind === 'note' ? payload.title : '');
  const busy = actions.accept.isPending || actions.reject.isPending;

  const accept = (edit: Parameters<typeof actions.accept.mutate>[0]['edit'] = {}) =>
    actions.accept.mutate(
      { id: proposal.id, edit },
      {
        onSuccess: (result) => {
          if (result.status === 'superseded')
            notifySuccess('Already there', 'Nothing new was added.');
          else if (payload.kind === 'note' && result.result)
            notifySuccess(`Note “${title || 'note'}” saved`);
        },
        onError: (error) => notifyError(new Error(describeError(error).description)),
      },
    );
  const editable = payload.kind === 'concept' || payload.kind === 'note';
  const editor = editing ? (
    payload.kind === 'concept' ? (
      <div className="space-y-2">
        <Input
          aria-label="Concept name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Textarea
          aria-label="Summary"
          rows={2}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </div>
    ) : (
      <Input
        aria-label="Note title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
    )
  ) : null;
  const edits =
    payload.kind === 'concept'
      ? { name: name.trim() || payload.name, summary }
      : payload.kind === 'note'
        ? { title: title.trim() || payload.title }
        : {};

  return (
    <li className="flex gap-3 px-4 py-3" data-proposal={proposal.kind}>
      <input
        type="checkbox"
        className="mt-1"
        aria-label="Select this proposal"
        checked={selected}
        onChange={(event) => onSelect(event.target.checked)}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <Summary proposal={proposal} editing={editor} />
        {payload.kind === 'concept' && payload.similarTo && (
          <p className="flex flex-wrap items-center gap-2 rounded-md bg-warning-subtle px-2 py-1 text-xs">
            Perhaps the same as “{payload.similarTo.name}” ({percent(payload.similarTo.score)}{' '}
            alike).
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => accept({ mergeInto: payload.similarTo?.id })}
            >
              <GitMerge aria-hidden="true" size={14} />
              Merge into it
            </Button>
          </p>
        )}
        <Evidence proposal={proposal} />
        <p className="text-xs text-subtle">{proposal.origin}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => accept(edits)}>
          <Check aria-hidden="true" size={14} />
          Accept
        </Button>
        {editable && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(!editing)}
            aria-pressed={editing}
          >
            <Pencil aria-hidden="true" size={14} />
            Edit
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => actions.reject.mutate(proposal.id, { onError: notifyError })}
        >
          <X aria-hidden="true" size={14} />
          Reject
        </Button>
      </div>
    </li>
  );
}

export function ProposalsPanel({ proposals }: { proposals: readonly Proposal[] }) {
  const actions = useInboxActions();
  const [filter, setFilter] = useState<ProposalKind | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const shown = proposals.filter((proposal) => filter === 'all' || proposal.kind === filter);

  if (proposals.length === 0)
    return (
      <EmptyState
        icon={<Check size={22} />}
        title="No suggestions waiting"
        description="Find concepts in a lecture or source, or suggest links for a note: what the AI proposes waits here for your decision."
      />
    );

  const bulk = (action: 'accept' | 'reject') =>
    actions.bulk.mutate(
      { ids: [...selected], action },
      {
        onSuccess: (result) => {
          setSelected(new Set());
          notifySuccess(
            `${result.done} ${action === 'accept' ? 'accepted' : 'rejected'}`,
            result.failed.length
              ? `${result.failed.length} could not be ${action}ed: open them to see why.`
              : undefined,
          );
        },
        onError: notifyError,
      },
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Suggestions">
        <fieldset className="flex flex-wrap gap-1">
          <legend className="sr-only">Show</legend>
          {KIND_FILTERS.map((option) => {
            const count =
              option.value === 'all'
                ? proposals.length
                : proposals.filter((proposal) => proposal.kind === option.value).length;
            if (option.value !== 'all' && count === 0) return null;
            return (
              <label
                key={option.value}
                className={cn(chipClasses(filter === option.value), 'text-sm')}
              >
                <input
                  type="radio"
                  name="proposal-kind"
                  className="sr-only"
                  checked={filter === option.value}
                  onChange={() => setFilter(option.value)}
                />
                {option.label} ({count})
              </label>
            );
          })}
        </fieldset>
        <label className="ml-2 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={shown.length > 0 && shown.every((proposal) => selected.has(proposal.id))}
            onChange={(event) =>
              setSelected(
                event.target.checked ? new Set(shown.map((proposal) => proposal.id)) : new Set(),
              )
            }
          />
          Select all
        </label>
        <div className="ml-auto flex gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={selected.size === 0}
            loading={actions.bulk.isPending && actions.bulk.variables?.action === 'accept'}
            onClick={() => bulk('accept')}
          >
            Accept selected
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0}
            loading={actions.bulk.isPending && actions.bulk.variables?.action === 'reject'}
            onClick={() => bulk('reject')}
          >
            Reject selected
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {shown.map((proposal) => (
          <ProposalItem
            key={proposal.id}
            proposal={proposal}
            selected={selected.has(proposal.id)}
            onSelect={(on) => {
              const next = new Set(selected);
              if (on) next.add(proposal.id);
              else next.delete(proposal.id);
              setSelected(next);
            }}
          />
        ))}
      </ul>
    </div>
  );
}
