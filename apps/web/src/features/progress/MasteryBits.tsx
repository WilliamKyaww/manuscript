import type { MasteryComponents, MasteryStage, RollUpView } from '@skb/core';
import { Badge } from '../../components/Badge';
import { ProgressBar } from '../../components/ProgressBar';
import { cn } from '../../lib/cn';
import {
  decimal,
  explainMastery,
  masteryFormula,
  percent,
  STAGE_LABELS,
  STAGE_TONES,
} from '../practice/format';

/** Small pieces shared by the progress page, concept pages and module pages (tasks 9.13–9.14). */

export function StageBadge({ stage }: { stage: MasteryStage }) {
  return <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>;
}

/** Readiness, mastery of practised material and coverage, side by side. */
export function RollUpFigures({ rollUp, className }: { rollUp: RollUpView; className?: string }) {
  return (
    <dl className={cn('grid gap-4 sm:grid-cols-3', className)}>
      <div>
        <dt className="text-xs text-muted">Readiness</dt>
        <dd className="text-2xl font-semibold tabular-nums">{percent(rollUp.readiness)}</dd>
        <dd className="text-xs text-muted">unstarted concepts count as 0</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Mastery of practised material</dt>
        <dd className="text-2xl font-semibold tabular-nums">{percent(rollUp.mastery)}</dd>
        <dd className="text-xs text-muted">over the concepts with evidence</dd>
      </div>
      <div>
        <dt className="text-xs text-muted">Coverage</dt>
        <dd className="text-2xl font-semibold tabular-nums">
          {rollUp.practised} of {rollUp.total}
        </dd>
        <dd className="text-xs text-muted">concepts practised</dd>
      </div>
    </dl>
  );
}

export function ReadinessBar({ rollUp, label }: { rollUp: RollUpView; label: string }) {
  return (
    <ProgressBar
      value={rollUp.readiness ?? 0}
      label={`${label}: ${rollUp.practised} of ${rollUp.total} concepts practised`}
    />
  );
}

/** "recall 0.82 from 14 card faces · questions 60 % over 9 weighted answers · …" and the sum. */
export function MasteryExplanation({ components }: { components: MasteryComponents }) {
  const formula = masteryFormula(components);
  return (
    <div className="space-y-1 text-sm">
      <p>{explainMastery(components).join(' · ')}</p>
      {formula && <p className="font-mono text-xs text-muted">mastery = {formula}</p>}
      {components.evidence > 0 && (
        <p className="text-xs text-muted">
          Evidence {decimal(components.evidence, 1)} (faces + 1.5 × answer weight): confidence is
          low under 3, high from 8.
        </p>
      )}
    </div>
  );
}
