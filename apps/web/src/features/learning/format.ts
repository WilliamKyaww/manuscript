import type { MarkSummarySchema, RequirementSchema } from '@skb/core';
import type { z } from 'zod';

/** Wording for marks and targets, shared by module, course and Today views. */

type Requirement = z.infer<typeof RequirementSchema>;
type MarkSummary = z.infer<typeof MarkSummarySchema>;

/** `70 %`, `72.5 %` (one decimal only when needed). */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} %`;
}

/** A weight given as a fraction, e.g. 0.4 → `40 %`. */
export function formatWeight(fraction: number): string {
  return formatPercent(fraction * 100);
}

/** One sentence about reaching `target`, e.g. "Needs 70 % on the remaining 60 % for 70 %." */
export function requirementText(
  requirement: Requirement | null,
  target: number | null,
  marks: MarkSummary,
): string | null {
  if (!requirement || target === null) return null;
  const goal = formatPercent(target);
  const remaining =
    marks.totalWeight > 0 ? (marks.pendingWeight + marks.unassignedWeight) / marks.totalWeight : 0;
  switch (requirement.kind) {
    case 'secured':
      return `${goal} is already secured.`;
    case 'needed':
      return `Needs an average of ${formatPercent(requirement.average)} on the remaining ${formatWeight(remaining)} for ${goal}.`;
    case 'impossible':
      return `${goal} is out of reach: the best still possible is ${formatPercent(requirement.best)}.`;
    case 'missed':
      return `Finished at ${formatPercent(requirement.final)}, below the target of ${goal}.`;
  }
}

/** The headline mark: the final mark, or the average of what has been marked so far. */
export function headlineMark(marks: MarkSummary): { label: string; value: string } | null {
  if (marks.final !== null) return { label: 'Final', value: formatPercent(marks.final) };
  if (marks.averageSoFar !== null)
    return { label: 'So far', value: formatPercent(marks.averageSoFar) };
  return null;
}

const DUE_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const DUE_TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/** `Wed 14 Oct` or `Wed 14 Oct, 09:30` for a `YYYY-MM-DD[THH:MM]` deadline (local time). */
export function formatDue(dueAt: string): string {
  const hasTime = dueAt.length > 10;
  const date = new Date(hasTime ? dueAt : `${dueAt}T00:00`);
  if (Number.isNaN(date.getTime())) return dueAt;
  return hasTime ? `${DUE_DATE.format(date)}, ${DUE_TIME.format(date)}` : DUE_DATE.format(date);
}

/** Whole days from `today` (YYYY-MM-DD) to a deadline's date: 0 today, 1 tomorrow. */
export function daysUntil(dueAt: string, today: string): number {
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${dueAt.slice(0, 10)}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

export function dueLabel(dueAt: string, today: string): string {
  const days = daysUntil(dueAt, today);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Local `YYYY-MM-DD` for a date. */
export function isoDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
