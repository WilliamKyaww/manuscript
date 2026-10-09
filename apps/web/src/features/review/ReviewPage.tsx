import type { CardSet } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FolderPlus, Layers, Play, SquarePlus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { formatCount } from '../../lib/format';
import { cardSetsQuery, reviewSettingsQuery, reviewStatsQuery } from './api';
import { Bars } from './Bars';
import { useQuickAdd } from './quick-add';
import { SetDialog } from './SetDialog';

/**
 * Review (tasks 8.06, 8.10): what is due, the card sets, and how reviewing is going. Flashcards are
 * scheduled with FSRS-6 (ADR-0011); the session itself is at /review/session.
 */

function SetRow({ set }: { set: CardSet }) {
  const { counts } = set;
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <Link
          to="/review/sets/$setId"
          params={{ setId: set.id }}
          className="font-medium hover:underline"
        >
          {set.title}
        </Link>
        <p className="text-xs text-muted">
          {[set.module?.code, set.lecture ? `${set.lecture.key} ${set.lecture.title}` : null]
            .filter(Boolean)
            .join(' · ') || 'No module'}
          {' · '}
          {formatCount(counts.cards, 'card')}
          {counts.suspended > 0 && ` · ${counts.suspended} suspended`}
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs">
        {counts.due > 0 && <Badge tone="warning">{counts.due} due</Badge>}
        {counts.new > 0 && <Badge tone="info">{counts.new} new</Badge>}
      </div>
      <Link
        to="/review/session"
        search={{ set: set.id }}
        className={buttonClasses('secondary', 'sm')}
        aria-label={`Review ${set.title}`}
      >
        <Play aria-hidden="true" size={14} /> Review
      </Link>
    </li>
  );
}

export function ReviewPage() {
  const api = useApi();
  const sets = useQuery(cardSetsQuery(api));
  const stats = useQuery(reviewStatsQuery(api));
  const settings = useQuery(reviewSettingsQuery(api));
  const openQuickAdd = useQuickAdd((state) => state.open);
  const [creatingSet, setCreatingSet] = useState(false);

  const allSets = sets.data?.sets ?? [];
  const waitingNew = allSets.reduce((sum, set) => sum + set.counts.new, 0);
  const dueToday = stats.data?.dueToday ?? 0;
  const newToday = Math.min(waitingNew, settings.data?.newPerDay ?? waitingNew);

  return (
    <Page
      title="Review"
      description="Flashcards, scheduled so that each comes back just before you would forget it."
      actions={
        <>
          <Button onClick={() => setCreatingSet(true)}>
            <FolderPlus aria-hidden="true" size={16} /> New set
          </Button>
          <Button onClick={() => openQuickAdd()}>
            <SquarePlus aria-hidden="true" size={16} /> New card
          </Button>
          <Link to="/review/session" className={buttonClasses('primary')}>
            <Play aria-hidden="true" size={16} /> Review now
          </Link>
        </>
      }
    >
      {(sets.isPending || stats.isPending) && <LoadingState label="Loading your cards" />}
      {sets.isError && (
        <ErrorState message="Card sets could not be loaded." onRetry={() => sets.refetch()} />
      )}
      {sets.data && allSets.length === 0 && (
        <EmptyState
          icon={<Layers size={28} />}
          title="No flashcards yet"
          description="Make a set for a module or lecture, then add cards: questions with one answer, or cloze deletions ({{c1::…}}). Ctrl+Shift+A adds a card from anywhere."
          action={
            <Button variant="primary" onClick={() => openQuickAdd()}>
              <SquarePlus aria-hidden="true" size={16} /> New card
            </Button>
          }
        />
      )}
      {allSets.length > 0 && stats.data && (
        <>
          <Card className="mb-8 grid gap-4 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Due today</p>
              <p className="text-2xl font-semibold tabular-nums">{dueToday}</p>
            </div>
            <div>
              <p className="text-xs text-muted">New cards today</p>
              <p className="text-2xl font-semibold tabular-nums">{newToday}</p>
              <p className="text-xs text-muted">{waitingNew} waiting in all</p>
            </div>
            <div>
              <p className="text-xs text-muted">True retention (30 days)</p>
              <p className="text-2xl font-semibold tabular-nums">
                {stats.data.trueRetention === null
                  ? '—'
                  : `${Math.round(stats.data.trueRetention * 100)} %`}
              </p>
              <p className="text-xs text-muted">
                target {Math.round((settings.data?.desiredRetention ?? 0.9) * 100)} %
              </p>
            </div>
          </Card>

          <StickySection title="Card sets" description={formatCount(allSets.length, 'set')}>
            <ul
              aria-label="Card sets"
              className="divide-y divide-border rounded-lg border border-border bg-surface"
            >
              {allSets.map((set) => (
                <SetRow key={set.id} set={set} />
              ))}
            </ul>
          </StickySection>

          <StickySection
            title="Statistics"
            description={`${formatCount(stats.data.cards, 'card')} · ${formatCount(stats.data.faces, 'face')} to review`}
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium">Due in the next 30 days</h3>
                <Bars
                  label="Due in the next 30 days"
                  days={stats.data.forecast.map((day) => ({ date: day.date, value: day.count }))}
                  describe={(day) => formatCount(day.value, 'face')}
                />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Reviews in the last 30 days</h3>
                <Bars
                  label="Reviews in the last 30 days"
                  tone="info"
                  days={stats.data.history.map((day) => ({
                    date: day.date,
                    value: day.reviews,
                    secondary: day.again,
                  }))}
                  describe={(day) =>
                    `${formatCount(day.value, 'review')}${day.secondary ? `, ${day.secondary} forgotten` : ''}`
                  }
                />
              </div>
            </div>
          </StickySection>
        </>
      )}
      {creatingSet && <SetDialog onClose={() => setCreatingSet(false)} />}
    </Page>
  );
}
