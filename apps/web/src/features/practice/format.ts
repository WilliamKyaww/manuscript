import type { MasteryComponents, MasteryStage, QuestionKind } from '@skb/core';

/** Labels and wording shared by the practice and progress pages. */

export const KIND_LABELS: Record<QuestionKind, string> = {
  mcq: 'Multiple choice',
  multi: 'Multi-select',
  true_false: 'True or false',
  numeric: 'Numeric',
  short: 'Short answer',
  explain: 'Explain',
  derivation: 'Derivation',
  code: 'Code',
};

export const STAGE_LABELS: Record<MasteryStage, string> = {
  new: 'New',
  learning: 'Learning',
  practised: 'Practised',
  confident: 'Confident',
  mastered: 'Mastered',
};

export const STAGE_TONES = {
  new: 'neutral',
  learning: 'warning',
  practised: 'info',
  confident: 'accent',
  mastered: 'success',
} as const;

export const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${Math.round(value * 100)} %`;

export const decimal = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? '—' : value.toFixed(digits);

/** "Got it", "Partly", "Missed" — the three grades you can give yourself. */
export const SELF_GRADES = [
  { score: 1, label: 'Got it' },
  { score: 0.5, label: 'Partly' },
  { score: 0, label: 'Missed it' },
] as const;

export function scoreLabel(score: number | null): string {
  if (score === null) return 'Waiting for your grade';
  if (score >= 1) return 'Right';
  if (score <= 0) return 'Wrong';
  return `Partly right (${percent(score)})`;
}

/** The parts of a mastery figure, as a sentence (learning-system.md §7). */
export function explainMastery(components: MasteryComponents): string[] {
  const parts: string[] = [];
  if (components.recallCount > 0)
    parts.push(
      `recall ${decimal(components.recall)} from ${components.recallCount} card face${components.recallCount === 1 ? '' : 's'}`,
    );
  if (components.accuracy !== null)
    parts.push(
      `questions ${percent(components.accuracy)} over ${decimal(components.answerWeight, 1)} weighted answers${
        components.implicitWeight > 0
          ? ` (${decimal(components.implicitWeight, 1)} of it implicit credit)`
          : ''
      }`,
    );
  if (components.itemsLinked > 0)
    parts.push(
      `${components.itemsLinked - components.itemsPractised} of ${components.itemsLinked} items never practised`,
    );
  parts.push(
    `confidence: ${components.confidence === 'none' ? 'no evidence' : components.confidence}`,
  );
  return parts;
}

/** The formula with this concept's numbers in it, so it can be checked by hand. */
export function masteryFormula(components: MasteryComponents): string | null {
  if (components.mastery === null) return null;
  const n = components.recallCount;
  const w = components.answerWeight;
  const r = decimal(components.recall ?? 0);
  const a = decimal(components.accuracy ?? 0);
  return `(${r} × ${n} + 1.5 × ${a} × ${decimal(w, 2)}) / (${n} + 1.5 × ${decimal(w, 2)}) = ${decimal(components.mastery)}`;
}
