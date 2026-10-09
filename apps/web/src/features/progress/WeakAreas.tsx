import type { ConceptProgress, WeakSignalView } from '@skb/core';
import { Link, useNavigate } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';
import { Button } from '../../components/Button';
import { notifyError } from '../../lib/notify';
import { usePracticeActions } from '../practice/api';
import { decimal } from '../practice/format';

/** Weak areas with their reasons and one-click practice (learning-system.md §8, task 9.13). */

const SIGNAL_LABELS: Record<WeakSignalView['kind'], string> = {
  weak: 'Weak',
  slipping: 'Slipping',
  lapsing: 'Lapsing',
  forgotten: 'Forgotten',
  no_material: 'No material',
};

/** Why a concept matters now: "exam in 9 days, 70 % of COC251". */
export function exposureText(row: ConceptProgress): string | null {
  const { exposure } = row;
  if (!exposure.assessment) return null;
  const days = exposure.assessment.daysUntil;
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  return `${exposure.assessment.title} ${when}, ${Math.round(exposure.assessment.weight * 100)} % of ${exposure.moduleCode}`;
}

export function usePractiseConcept() {
  const actions = usePracticeActions();
  const navigate = useNavigate();
  return {
    pending: actions.startLearn.isPending,
    start: async (conceptId: string) => {
      try {
        const session = await actions.startLearn.mutateAsync({
          scope: { conceptIds: [conceptId] },
          timeLimitMinutes: 10,
        });
        await navigate({
          to: '/practice/learn/$attemptId',
          params: { attemptId: session.attemptId },
        });
      } catch (reason) {
        notifyError(reason);
      }
    },
  };
}

export function WeakAreaList({ items }: { items: readonly ConceptProgress[] }) {
  const practise = usePractiseConcept();
  return (
    <ul aria-label="Weak areas" className="divide-y divide-border">
      {items.map((row) => {
        const why = exposureText(row);
        const signals = row.signals.filter((signal) => signal.kind !== 'no_material');
        return (
          <li key={row.concept.id} className="flex flex-wrap items-start gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <Link
                to="/concepts/$conceptId"
                params={{ conceptId: row.concept.id }}
                className="font-medium hover:underline"
              >
                {row.concept.name}
              </Link>
              <span className="ml-2 text-xs text-muted">
                mastery {decimal(row.components.mastery)}
              </span>
              <ul className="mt-0.5 space-y-0.5 text-xs text-muted">
                {signals.map((signal) => (
                  <li key={signal.kind}>
                    <strong className="font-medium text-text">{SIGNAL_LABELS[signal.kind]}:</strong>{' '}
                    {signal.reason}
                  </li>
                ))}
                {why && <li>{why}</li>}
              </ul>
            </div>
            <Button
              size="sm"
              disabled={practise.pending}
              onClick={() => void practise.start(row.concept.id)}
              aria-label={`Practise ${row.concept.name}`}
            >
              <Sparkles aria-hidden="true" size={14} /> Practise
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
