import type { MarkSummarySchema, RequirementSchema } from '@skb/core';
import type { z } from 'zod';
import { cn } from '../../lib/cn';
import { formatPercent, formatWeight, headlineMark, requirementText } from './format';

type MarkSummary = z.infer<typeof MarkSummarySchema>;
type Requirement = z.infer<typeof RequirementSchema>;

/**
 * Marks so far and what a target needs (task 6.06 in the UI). Every number is explained in words
 * next to it, so the calculation can be checked by hand.
 */
export function MarksSummary({
  marks,
  requirement,
  target,
  compact = false,
}: {
  marks: MarkSummary;
  requirement: Requirement | null;
  target: number | null;
  compact?: boolean;
}) {
  const headline = headlineMark(marks);
  const markedShare = marks.totalWeight > 0 ? marks.markedWeight / marks.totalWeight : 0;
  const unassignedShare = marks.totalWeight > 0 ? marks.unassignedWeight / marks.totalWeight : 0;
  const advice = requirementText(requirement, target, marks);
  const tone =
    requirement?.kind === 'impossible' || requirement?.kind === 'missed'
      ? 'text-danger'
      : requirement?.kind === 'secured'
        ? 'text-success'
        : 'text-text';
  if (compact) {
    return (
      <p className="text-sm text-muted">
        {headline ? (
          <>
            <span className="font-medium text-text">{headline.value}</span>{' '}
            {headline.label.toLowerCase()}
            {marks.final === null && ` · ${formatWeight(markedShare)} marked`}
          </>
        ) : (
          'Nothing marked yet'
        )}
        {advice && <span className={cn('block', tone)}>{advice}</span>}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={headline ? `Mark (${headline.label.toLowerCase()})` : 'Mark'}
          value={headline?.value ?? '—'}
        />
        <Stat label="Marked" value={formatWeight(markedShare)} />
        <Stat label="Secured" value={formatPercent(marks.secured)} hint="Points already earned" />
        <Stat
          label="Best possible"
          value={formatPercent(marks.best)}
          hint="With full marks on the rest"
        />
      </dl>
      {advice && <p className={cn('text-sm font-medium', tone)}>{advice}</p>}
      {unassignedShare > 0.0001 && (
        <p className="text-xs text-muted">
          {formatWeight(unassignedShare)} of the mark is not assigned to an assessment yet; it
          counts as still to come.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md bg-surface-sunken px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-subtle">{hint}</dd>}
    </div>
  );
}
