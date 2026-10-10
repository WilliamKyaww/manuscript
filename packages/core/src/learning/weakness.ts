import { type ConceptMastery, MASTERY } from './mastery';

/**
 * Weak-area signals (learning-system.md §8). Each one is a plain rule over evidence the student can
 * see, and carries a sentence saying why it fired.
 */

export const WEAKNESS = {
  windowDays: 14,
  /** Slipping: accuracy in the last window this far below the window before. */
  slippingDrop: 0.2,
  /** …and each window needs this many scored answers before a drop means anything. */
  slippingMinAnswers: 2,
  lapses: 2,
  forgottenBefore: 0.85,
  forgottenNow: 0.7,
} as const;

export const WEAK_SIGNALS = [
  'weak',
  'slipping',
  'lapsing',
  'forgotten',
  'at_risk',
  'no_material',
] as const;
export type WeakSignalKind = (typeof WEAK_SIGNALS)[number];

export interface WeakSignal {
  kind: WeakSignalKind;
  reason: string;
}

export interface WeaknessEvidence {
  mastery: ConceptMastery;
  /** Scored answers to linked questions (any age; only the last two windows are read). */
  answers: readonly { score: number; ageDays: number }[];
  /** Card faces rated Again while in review during the last window. */
  lapses: number;
  /** Mean retrievability of the linked faces one window ago, from their schedules then. */
  recallBefore: number | null;
  /** Cards and questions linked to the concept. */
  itemsLinked: number;
  /** Prerequisites answered wrongly lately (names), if any (learning-system.md §10). */
  atRiskFrom?: readonly string[];
}

const percent = (value: number) => `${Math.round(value * 100)} %`;

/** The mean score of answers aged [from, to) days, and how many there were. */
export function windowAccuracy(
  answers: WeaknessEvidence['answers'],
  from: number,
  to: number,
): { mean: number | null; count: number } {
  const inside = answers.filter((answer) => answer.ageDays >= from && answer.ageDays < to);
  if (inside.length === 0) return { mean: null, count: 0 };
  return {
    mean: inside.reduce((sum, answer) => sum + answer.score, 0) / inside.length,
    count: inside.length,
  };
}

export function weakSignals(evidence: WeaknessEvidence): WeakSignal[] {
  const signals: WeakSignal[] = [];
  const { mastery } = evidence;
  if (evidence.itemsLinked === 0)
    signals.push({ kind: 'no_material', reason: 'No cards or questions are linked yet.' });

  if (
    mastery.mastery !== null &&
    mastery.mastery < MASTERY.stage.practised &&
    (mastery.confidence === 'medium' || mastery.confidence === 'high')
  )
    signals.push({
      kind: 'weak',
      reason: `Mastery ${mastery.mastery.toFixed(2)} with ${mastery.confidence} confidence.`,
    });

  const days = WEAKNESS.windowDays;
  const recent = windowAccuracy(evidence.answers, 0, days);
  const previous = windowAccuracy(evidence.answers, days, 2 * days);
  if (
    recent.mean !== null &&
    previous.mean !== null &&
    recent.count >= WEAKNESS.slippingMinAnswers &&
    previous.count >= WEAKNESS.slippingMinAnswers &&
    previous.mean - recent.mean >= WEAKNESS.slippingDrop - 1e-9
  )
    signals.push({
      kind: 'slipping',
      reason: `Accuracy fell from ${percent(previous.mean)} to ${percent(recent.mean)} over the last ${days} days.`,
    });

  if (evidence.lapses >= WEAKNESS.lapses)
    signals.push({
      kind: 'lapsing',
      reason: `${evidence.lapses} cards forgotten in review over the last ${days} days.`,
    });

  if (
    evidence.recallBefore !== null &&
    mastery.recall !== null &&
    evidence.recallBefore >= WEAKNESS.forgottenBefore &&
    mastery.recall < WEAKNESS.forgottenNow
  )
    signals.push({
      kind: 'forgotten',
      reason: `Recall fell from ${evidence.recallBefore.toFixed(2)} to ${mastery.recall.toFixed(2)} since ${days} days ago.`,
    });

  if (evidence.atRiskFrom && evidence.atRiskFrom.length > 0)
    signals.push({
      kind: 'at_risk',
      reason: `You answered ${evidence.atRiskFrom.map((name) => `“${name}”`).join(' and ')}, which this builds on, wrongly lately.`,
    });

  return signals;
}
