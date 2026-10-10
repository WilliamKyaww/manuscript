import { type Card, formatInterval } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Download, Pencil, Play, SquarePlus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { downloadText } from '../../lib/download';
import { formatCount } from '../../lib/format';
import { notifyError, notifySuccess } from '../../lib/notify';
import { selectClasses } from '../learning/Field';
import { cardSetQuery, cardSetsQuery, useCardActions } from './api';
import { CardEditor } from './CardEditor';
import { SetDialog } from './SetDialog';

/** One card set (task 8.06): its cards, editing, bulk actions, and Anki import and export. */

const STATUS: Record<Card['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'warning' },
  deleted: { label: 'Deleted', tone: 'danger' },
};

/** A one-line glimpse of a card's front, without Markdown or cloze syntax. */
export const glimpse = (text: string) =>
  text
    .replace(/\{\{c\d+::((?:(?!\}\}).)*?)(?:::(?:(?!\}\}).)*?)?\}\}/g, '[$1]')
    .replace(/[#*_`>$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function nextDue(card: Card, now: number): string {
  const learnt = card.faces.filter((face) => face.state !== 'new');
  if (learnt.length === 0) return 'New';
  const soonest = Math.min(...learnt.map((face) => Date.parse(face.due)));
  return soonest <= now ? 'Due' : `in ${formatInterval(soonest - now)}`;
}

export function SetPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { setId } = useParams({ strict: false }) as { setId: string };
  const set = useQuery(cardSetQuery(api, setId));
  const sets = useQuery(cardSetsQuery(api));
  const actions = useCardActions();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<Card | 'new' | null>(null);
  const [editingSet, setEditingSet] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingCards, setDeletingCards] = useState(false);
  const [moveTo, setMoveTo] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  if (set.isPending)
    return (
      <Page title="Card set" breadcrumbs={[{ label: 'Review', to: '/review' }]}>
        <LoadingState label="Loading the set" />
      </Page>
    );
  if (set.isError)
    return (
      <Page title="Card set" breadcrumbs={[{ label: 'Review', to: '/review' }]}>
        <ErrorState message="This set could not be loaded." onRetry={() => set.refetch()} />
      </Page>
    );

  const data = set.data;
  const now = Date.now();
  const ids = [...selected];
  const DONE = { activate: 'activated', suspend: 'suspended', delete: 'deleted', move: 'moved' };
  const bulk = (action: 'activate' | 'suspend' | 'delete' | 'move') =>
    actions.bulk.mutate(
      { ids, action, ...(action === 'move' ? { setId: moveTo } : {}) },
      {
        onSuccess: ({ changed }) => {
          notifySuccess(`${formatCount(changed, 'card')} ${DONE[action]}`);
          setSelected(new Set());
          setDeletingCards(false);
        },
        onError: notifyError,
      },
    );
  const exportSet = () =>
    actions.exportSet.mutate(data.id, {
      onSuccess: ({ filename, content }) => downloadText(filename, content),
      onError: notifyError,
    });
  const importFile = async (file: File) =>
    actions.importSet.mutate(
      { id: data.id, content: await file.text() },
      {
        onSuccess: ({ imported, skipped }) =>
          notifySuccess(
            `${formatCount(imported, 'card')} imported`,
            skipped > 0
              ? `${formatCount(skipped, 'row')} skipped (no front, or a cloze card without deletions).`
              : undefined,
          ),
        onError: notifyError,
      },
    );
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (!next.delete(id)) next.add(id);
    setSelected(next);
  };

  return (
    <Page
      title={data.title}
      description={
        [
          data.module ? `${data.module.code} ${data.module.title}` : null,
          data.lecture ? `${data.lecture.key} ${data.lecture.title}` : null,
          data.description || null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined
      }
      breadcrumbs={[{ label: 'Review', to: '/review' }, { label: data.title }]}
      actions={
        <>
          <Button onClick={() => setEditing('new')}>
            <SquarePlus aria-hidden="true" size={16} /> New card
          </Button>
          <Link to="/review/session" search={{ set: data.id }} className={buttonClasses('primary')}>
            <Play aria-hidden="true" size={16} /> Review
          </Link>
        </>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setEditingSet(true)}>
          <Pencil aria-hidden="true" size={14} /> Edit set
        </Button>
        <Button size="sm" onClick={exportSet} loading={actions.exportSet.isPending}>
          <Download aria-hidden="true" size={14} /> Export for Anki
        </Button>
        <Button
          size="sm"
          onClick={() => fileInput.current?.click()}
          loading={actions.importSet.isPending}
        >
          <Upload aria-hidden="true" size={14} /> Import from Anki
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.tsv,.csv,text/plain,text/tab-separated-values,text/csv"
          className="hidden"
          aria-label="Anki file to import"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
        <Button size="sm" variant="danger-outline" onClick={() => setDeleting(true)}>
          <Trash2 aria-hidden="true" size={14} /> Delete set
        </Button>
      </div>

      <StickySection
        title="Cards"
        description={`${formatCount(data.counts.cards, 'card')} · ${data.counts.due} due · ${data.counts.new} new`}
        actions={
          selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted">{selected.size} selected</span>
              <Button size="sm" onClick={() => bulk('activate')}>
                Activate
              </Button>
              <Button size="sm" onClick={() => bulk('suspend')}>
                Suspend
              </Button>
              <select
                aria-label="Move to set"
                className={cn(selectClasses, 'h-8 w-40')}
                value={moveTo}
                onChange={(event) => setMoveTo(event.target.value)}
              >
                <option value="">Move to…</option>
                {(sets.data?.sets ?? [])
                  .filter((other) => other.id !== data.id)
                  .map((other) => (
                    <option key={other.id} value={other.id}>
                      {other.title}
                    </option>
                  ))}
              </select>
              <Button size="sm" disabled={!moveTo} onClick={() => bulk('move')}>
                Move
              </Button>
              <Button size="sm" variant="danger-outline" onClick={() => setDeletingCards(true)}>
                Delete
              </Button>
            </div>
          )
        }
      >
        {data.cards.length === 0 ? (
          <EmptyState
            title="No cards in this set"
            description="Add cards one by one, or import an Anki text export."
            action={
              <Button variant="primary" onClick={() => setEditing('new')}>
                <SquarePlus aria-hidden="true" size={16} /> New card
              </Button>
            }
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="w-8 py-1.5">
                  <input
                    type="checkbox"
                    aria-label="Select all cards"
                    checked={selected.size === data.cards.length}
                    onChange={() =>
                      setSelected(
                        selected.size === data.cards.length
                          ? new Set()
                          : new Set(data.cards.map((card) => card.id)),
                      )
                    }
                  />
                </th>
                <th className="py-1.5 pr-3 font-medium">Card</th>
                <th className="py-1.5 pr-3 font-medium">Kind</th>
                <th className="py-1.5 pr-3 font-medium">Status</th>
                <th className="py-1.5 pr-3 font-medium">Next</th>
              </tr>
            </thead>
            <tbody>
              {data.cards.map((card) => (
                <tr key={card.id} className="border-t border-border">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${glimpse(card.front)}`}
                      checked={selected.has(card.id)}
                      onChange={() => toggle(card.id)}
                    />
                  </td>
                  <td className="max-w-0 py-2 pr-3">
                    <button
                      type="button"
                      className="block w-full truncate text-left hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                      onClick={() => setEditing(card)}
                    >
                      {glimpse(card.front)}
                    </button>
                    {card.concepts.length > 0 && (
                      <span className="block truncate text-xs text-muted">
                        {card.concepts.map((concept) => concept.name).join(', ')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">
                    {card.kind}
                    {card.faces.length > 1 && ` · ${card.faces.length} faces`}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={STATUS[card.status].tone}>{STATUS[card.status].label}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted">{nextDue(card, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </StickySection>

      {editing && (
        <CardEditor
          {...(editing === 'new' ? { draft: { setId: data.id } } : { card: editing })}
          onClose={() => setEditing(null)}
        />
      )}
      {editingSet && <SetDialog set={data} onClose={() => setEditingSet(false)} />}
      <ConfirmDialog
        open={deletingCards}
        title={`Delete ${formatCount(ids.length, 'card')}?`}
        confirmLabel="Delete cards"
        busy={actions.bulk.isPending}
        onCancel={() => setDeletingCards(false)}
        onConfirm={() => bulk('delete')}
      >
        <p>They leave your reviews. Their review history is kept.</p>
      </ConfirmDialog>
      <Dialog
        open={deleting}
        onOpenChange={(open) => !open && setDeleting(false)}
        title={`Delete “${data.title}”?`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={actions.deleteSet.isPending}
              onClick={() =>
                actions.deleteSet.mutate(data.id, {
                  onSuccess: () => void navigate({ to: '/review' }),
                  onError: notifyError,
                })
              }
            >
              Delete set
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Its {formatCount(data.counts.cards, 'card')} leave your reviews. Their review history is
          kept.
        </p>
      </Dialog>
    </Page>
  );
}
