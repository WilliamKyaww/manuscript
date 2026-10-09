import { formatInterval, type SessionSummary } from '@skb/core';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, Undo2 } from 'lucide-react';
import { Button, buttonClasses } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { formatCount } from '../../../lib/format';

/** The end of a session (task 8.10): what was reviewed, how it went, what comes back when. */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-surface-sunken px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const minutes = (ms: number) => {
  const total = Math.round(ms / 60_000);
  return total < 1 ? 'under a minute' : formatCount(total, 'minute');
};

export function SessionSummaryView({
  summary,
  nextDue,
  onUndo,
}: {
  summary: SessionSummary;
  nextDue: string | null;
  onUndo(): void;
}) {
  const nothing = summary.reviews === 0;
  return (
    <Card className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <CheckCircle2 aria-hidden="true" size={28} className="text-success" />
        <div>
          <h2 className="text-lg font-semibold">
            {nothing ? 'Nothing is due' : 'Session complete'}
          </h2>
          <p className="text-sm text-muted">
            {nothing
              ? 'There are no cards to review here right now.'
              : `${formatCount(summary.reviews, 'review')} in ${minutes(summary.durationMs)}.`}
            {nextDue &&
              ` The next card comes back in ${formatInterval(Math.max(0, Date.parse(nextDue) - Date.now()))}.`}
          </p>
        </div>
      </div>
      {!nothing && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Reviews" value={String(summary.reviews)} />
            <Stat label="New" value={String(summary.newFaces)} hint="seen for the first time" />
            <Stat label="Again" value={String(summary.again)} hint="forgotten" />
            <Stat
              label="True retention"
              value={
                summary.trueRetention === null
                  ? '—'
                  : `${Math.round(summary.trueRetention * 100)} %`
              }
              hint="cards in review remembered"
            />
          </div>
          {summary.concepts.length > 0 && (
            <p className="mt-4 text-sm">
              <span className="text-muted">Concepts practised: </span>
              {summary.concepts.map((concept) => concept.name).join(', ')}
            </p>
          )}
        </>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to="/review" className={buttonClasses('primary')}>
          Back to Review
        </Link>
        {!nothing && (
          <Button onClick={onUndo}>
            <Undo2 aria-hidden="true" size={14} /> Undo the last rating
          </Button>
        )}
      </div>
    </Card>
  );
}
