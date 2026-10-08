/**
 * Mark calculator (learning-system.md §1, task 6.06). A module mark is the weighted mean of its
 * assessment marks; a year average is the credit-weighted mean of module marks. Both are the same
 * calculation — a weighted mean in which some marks are not known yet — so one function serves both:
 * for a year, each assessment's weight is its module's credits × its weight in the module.
 *
 * Marks are percentages (0–100). Weight not yet assigned to any assessment (a module whose entered
 * assessments add up to less than 100 %) counts as still to come, and is reported so the UI can say so.
 */

export interface WeightedMark {
  /** Share of the total (any unit: fractions of a module, or credits × fractions). */
  weight: number;
  /** 0–100, or null while not marked. */
  mark: number | null;
}

export interface MarkSummary {
  totalWeight: number;
  markedWeight: number;
  /** Weight of entered assessments that have no mark yet. */
  pendingWeight: number;
  /** Weight not assigned to any entered assessment. */
  unassignedWeight: number;
  /** Mark points already secured out of 100 (marked work only; the rest counted as zero). */
  secured: number;
  /** Mean mark of the marked work, or null if nothing is marked. */
  averageSoFar: number | null;
  /** The final mark when everything is marked and assigned, otherwise null. */
  final: number | null;
  /** The highest final mark still possible (100 % on everything to come). */
  best: number;
}

export type Requirement =
  /** Already reached, whatever happens next. */
  | { kind: 'secured' }
  /** This average is needed on everything still to come. */
  | { kind: 'needed'; average: number }
  /** Out of reach: even 100 % on the rest gives `best`. */
  | { kind: 'impossible'; best: number }
  /** Nothing is left to come and the target was missed. */
  | { kind: 'missed'; final: number };

const EPSILON = 1e-9;
const clampMark = (mark: number) => Math.min(100, Math.max(0, mark));

export function summariseMarks(items: readonly WeightedMark[], totalWeight: number): MarkSummary {
  let markedWeight = 0;
  let points = 0;
  let pendingWeight = 0;
  for (const item of items) {
    if (!(item.weight > 0)) continue;
    if (item.mark === null) pendingWeight += item.weight;
    else {
      markedWeight += item.weight;
      points += item.weight * clampMark(item.mark);
    }
  }
  const assigned = markedWeight + pendingWeight;
  const total = Math.max(totalWeight, assigned);
  const unassignedWeight = Math.max(0, total - assigned);
  const remaining = pendingWeight + unassignedWeight;
  const secured = total > 0 ? points / total : 0;
  return {
    totalWeight: total,
    markedWeight,
    pendingWeight,
    unassignedWeight,
    secured,
    averageSoFar: markedWeight > 0 ? points / markedWeight : null,
    final: total > 0 && remaining <= EPSILON ? secured : null,
    best: total > 0 ? secured + (remaining / total) * 100 : 0,
  };
}

/** What is needed on everything still to come to reach `target` (a percentage). */
export function requirementFor(target: number, summary: MarkSummary): Requirement {
  const remaining = summary.pendingWeight + summary.unassignedWeight;
  if (summary.secured >= target - EPSILON) return { kind: 'secured' };
  if (remaining <= EPSILON) return { kind: 'missed', final: summary.secured };
  const average = ((target - summary.secured) * summary.totalWeight) / remaining;
  if (average > 100 + EPSILON) return { kind: 'impossible', best: summary.best };
  return { kind: 'needed', average };
}

export interface AssessmentForMarks {
  /** Fraction of the module mark (0–1). */
  weight: number;
  markAchieved: number | null;
}

export function moduleSummary(assessments: readonly AssessmentForMarks[]): MarkSummary {
  return summariseMarks(
    assessments.map((assessment) => ({ weight: assessment.weight, mark: assessment.markAchieved })),
    1,
  );
}

export interface ModuleForMarks {
  credits: number;
  assessments: readonly AssessmentForMarks[];
}

/** The credit-weighted year (course) picture; modules without credits are left out. */
export function courseSummary(modules: readonly ModuleForMarks[]): MarkSummary {
  const items: WeightedMark[] = [];
  let totalWeight = 0;
  for (const module of modules) {
    if (!(module.credits > 0)) continue;
    totalWeight += module.credits;
    for (const assessment of module.assessments)
      items.push({ weight: module.credits * assessment.weight, mark: assessment.markAchieved });
  }
  return summariseMarks(items, totalWeight);
}

/** Sum of assessment weights must not exceed 100 % of a module (with rounding tolerance). */
export function weightsFit(weights: readonly number[]): boolean {
  return weights.reduce((sum, weight) => sum + weight, 0) <= 1 + 1e-6;
}
