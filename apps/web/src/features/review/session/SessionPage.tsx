import { RATING_LABELS, type ReviewRating } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import {
  Archive,
  ExternalLink,
  Maximize2,
  Minimize2,
  PauseCircle,
  Pencil,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import type { ShortcutDefinition } from '../../../app/shortcuts/registry';
import { useShortcutList } from '../../../app/shortcuts/useShortcuts';
import { Badge } from '../../../components/Badge';
import { Button, buttonClasses } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Kbd } from '../../../components/Kbd';
import { Page } from '../../../components/Page';
import { ProgressBar } from '../../../components/ProgressBar';
import { EmptyState, LoadingState } from '../../../components/States';
import { useApi } from '../../../lib/api/context';
import { cn } from '../../../lib/cn';
import { formatCount } from '../../../lib/format';
import { locatorHref } from '../../library/links';
import { cardQuery } from '../api';
import { CardEditor } from '../CardEditor';
import { CardMarkdown } from '../CardMarkdown';
import { REVIEW_KEYS, type ReviewKey } from './keys';
import { SessionSummaryView } from './SessionSummaryView';
import { useReviewSession } from './useReviewSession';

/**
 * The review session (task 8.09): one face at a time; Space shows the answer, 1–4 rate it (each
 * button says when the face will come back), Ctrl+Z takes the last rating back, E edits, S
 * suspends, B buries until tomorrow, O opens the source, F switches focus mode.
 */

const RATING_TONES: Record<ReviewRating, string> = {
  1: 'border-danger/40 hover:bg-danger-subtle',
  2: 'border-warning/40 hover:bg-warning-subtle',
  3: 'border-success/40 hover:bg-success-subtle',
  4: 'border-info/40 hover:bg-info-subtle',
};

export function SessionPage() {
  const search = useSearch({ from: '/review/session' });
  const session = useReviewSession({ set: search.set, module: search.module });
  const { state } = session;
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [focus, setFocus] = useState(false);
  const current = state.current;
  const editingCard = useQuery({
    ...cardQuery(api, current?.cardId ?? ''),
    enabled: editing && current !== null,
  });
  const active = state.phase === 'reviewing' && !editing;

  /** A session key: it acts (and keeps the key from the page) only when its handler says it did. */
  const key = (id: ReviewKey, handler: () => boolean): ShortcutDefinition => ({
    id: `review.${id}`,
    ...REVIEW_KEYS[id],
    group: 'Review',
    handler: (event) => {
      if (handler()) event.preventDefault();
    },
  });
  const act = (condition: boolean, action: () => unknown) => {
    if (condition) void action();
    return condition;
  };
  const reveal = () => act(active && !state.revealed, session.reveal);
  useShortcutList([
    key('reveal', reveal),
    key('reveal-enter', reveal),
    ...([1, 2, 3, 4] as const).map((rating) =>
      key(`rate-${rating}`, () =>
        act(active && state.revealed && !state.busy, () => session.rate(rating)),
      ),
    ),
    key('undo', () => act(!editing, session.undo)),
    key('edit', () => act(active, () => setEditing(true))),
    key('suspend', () => act(active, session.suspend)),
    key('bury', () => act(active, session.bury)),
    key('source', () =>
      act(
        active && Boolean(current?.locator),
        () => current?.locator && window.open(locatorHref(current.locator), '_blank', 'noopener'),
      ),
    ),
    key('focus', () => act(!editing, () => setFocus((value) => !value))),
  ]);

  const total = state.done + state.left;
  return (
    <Page
      title="Review"
      breadcrumbs={focus ? undefined : [{ label: 'Review', to: '/review' }, { label: 'Session' }]}
      description={
        focus
          ? undefined
          : current
            ? `${current.setTitle} · ${formatCount(state.left, 'face')} left`
            : undefined
      }
      actions={
        state.phase === 'reviewing' && (
          <>
            <Button size="sm" onClick={() => setFocus(!focus)} aria-pressed={focus}>
              {focus ? (
                <Minimize2 aria-hidden="true" size={14} />
              ) : (
                <Maximize2 aria-hidden="true" size={14} />
              )}
              {focus ? 'Leave focus mode' : 'Focus mode'}
            </Button>
            {!focus && (
              <Button size="sm" onClick={() => void session.end()}>
                End session
              </Button>
            )}
          </>
        )
      }
      width={focus ? 'wide' : 'default'}
    >
      {state.phase === 'starting' && <LoadingState label="Preparing the session" />}
      {state.phase === 'failed' && (
        <EmptyState
          title="The session could not start"
          description="Go back and try again."
          action={
            <Link to="/review" className={buttonClasses()}>
              Back to Review
            </Link>
          }
        />
      )}
      {state.phase === 'finished' && state.summary && (
        <SessionSummaryView
          summary={state.summary}
          nextDue={state.nextDue}
          onUndo={() => void session.undo()}
        />
      )}
      {state.phase === 'reviewing' && current && (
        <div className="mx-auto max-w-3xl space-y-4">
          <ProgressBar
            value={total === 0 ? 0 : state.done / total}
            label={`${state.done} of ${total} reviewed`}
          />
          <Card className={cn('p-6', focus && 'p-10 text-lg')}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Badge
                tone={
                  current.state === 'new'
                    ? 'info'
                    : current.state === 'review'
                      ? 'neutral'
                      : 'warning'
                }
              >
                {current.state === 'new'
                  ? 'New'
                  : current.state === 'review'
                    ? 'Review'
                    : 'Learning'}
              </Badge>
              {current.concepts.map((concept) => (
                <span key={concept.id}>{concept.name}</span>
              ))}
            </div>
            <section aria-label="Question">
              <CardMarkdown content={current.front} cardId={current.cardId} />
            </section>
            {state.revealed && (
              <section aria-label="Answer" className="mt-4 border-t border-border pt-4">
                <CardMarkdown content={current.back} cardId={current.cardId} />
              </section>
            )}
          </Card>

          {state.revealed ? (
            <fieldset className="grid grid-cols-4 gap-2">
              <legend className="sr-only">How well did you remember?</legend>
              {current.intervals.map(({ rating, label }) => (
                <button
                  key={rating}
                  type="button"
                  disabled={state.busy}
                  aria-keyshortcuts={String(rating)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg border bg-surface px-3 py-2.5 text-sm font-medium disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-focus',
                    RATING_TONES[rating],
                  )}
                  onClick={() => void session.rate(rating)}
                >
                  <span>
                    {RATING_LABELS[rating]} <Kbd>{String(rating)}</Kbd>
                  </span>
                  <span className="text-xs font-normal text-muted">{label}</span>
                </button>
              ))}
            </fieldset>
          ) : (
            <Button
              variant="primary"
              className="w-full justify-center py-3"
              onClick={session.reveal}
              aria-keyshortcuts="Space"
            >
              Show answer <Kbd>Space</Kbd>
            </Button>
          )}

          {!focus && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                onClick={() => void session.undo()}
                disabled={state.busy || state.done === 0}
              >
                <Undo2 aria-hidden="true" size={14} /> Undo <Kbd>Ctrl+Z</Kbd>
              </Button>
              <Button size="sm" onClick={() => setEditing(true)}>
                <Pencil aria-hidden="true" size={14} /> Edit <Kbd>E</Kbd>
              </Button>
              <Button size="sm" onClick={() => void session.bury()} disabled={state.busy}>
                <Archive aria-hidden="true" size={14} /> Bury <Kbd>B</Kbd>
              </Button>
              <Button size="sm" onClick={() => void session.suspend()} disabled={state.busy}>
                <PauseCircle aria-hidden="true" size={14} /> Suspend <Kbd>S</Kbd>
              </Button>
              {current.locator && (
                <a
                  href={locatorHref(current.locator)}
                  target="_blank"
                  rel="noopener"
                  className={buttonClasses('secondary', 'sm')}
                >
                  <ExternalLink aria-hidden="true" size={14} /> Source <Kbd>O</Kbd>
                </a>
              )}
            </div>
          )}
        </div>
      )}
      {editing && editingCard.data && (
        <CardEditor
          card={editingCard.data}
          onClose={() => setEditing(false)}
          onSaved={() => void session.reload()}
        />
      )}
    </Page>
  );
}
