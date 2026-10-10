/**
 * Graph-aware credit (learning-system.md §10, task 15.03), inspired by FIRe: what a student shows on a
 * concept says something about the concepts it builds on.
 *
 * Along **accepted** `prerequisite_for` edges A → B:
 * - a correct answer on B counts a little towards A, as if A had been asked about too — with the edge's
 *   weight (0.2 by default, at most 0.3) per step, and at most two steps;
 * - a wrong answer on A flags the concepts that depend on it as *at risk*, which raises their priority
 *   but never changes a score;
 * - if the student's own recent accuracy on A is below 0.6, credit coming to A is ignored: a shaky
 *   prerequisite needs practice of its own, not credit from above.
 *
 * Pure, so the figures can be checked by hand and the mastery explanation can show where credit came from.
 */

export const CREDIT = {
  defaultWeight: 0.2,
  maxWeight: 0.3,
  maxDepth: 2,
  /** Own accuracy below this stops credit coming in. */
  accuracyFloor: 0.6,
  /** An answer at or above this is correct enough to give credit. */
  correctAt: 0.75,
  /** An answer below this is a failure that puts dependents at risk… */
  failedBelow: 0.5,
  /** …if it was given this recently (days). */
  recentDays: 14,
} as const;

export interface PrerequisiteEdge {
  /** The prerequisite (A). */
  from: string;
  /** The concept that needs it (B). */
  to: string;
  /** The edge's own weight, if set. */
  weight: number | null;
}

export interface CreditAnswer {
  score: number;
  ageDays: number;
  assisted: boolean;
}

export interface ImplicitAnswer extends CreditAnswer {
  /** The weight this answer carries as credit: the product of the edge weights on the way. */
  factor: number;
  /** The concept the answer was actually given on. */
  fromId: string;
  /** Steps along prerequisite edges (1 or 2). */
  hops: number;
}

const clampWeight = (weight: number | null) =>
  Math.min(CREDIT.maxWeight, Math.max(0, weight ?? CREDIT.defaultWeight));

export interface CreditInput {
  edges: readonly PrerequisiteEdge[];
  /** Each concept's own answers. */
  answers: ReadonlyMap<string, readonly CreditAnswer[]>;
  /** Each concept's own recency-weighted accuracy now (null: not enough answers to say). */
  accuracy: ReadonlyMap<string, number | null>;
}

export interface CreditResult {
  /** Credit that reaches each concept, from the answers given on what depends on it. */
  implicit: Map<string, ImplicitAnswer[]>;
  /** Concepts that depend on a prerequisite answered wrongly lately, with which one. */
  atRisk: Map<string, { id: string; failures: number }[]>;
}

export function propagateCredit(input: CreditInput): CreditResult {
  const dependents = new Map<string, PrerequisiteEdge[]>();
  const prerequisites = new Map<string, PrerequisiteEdge[]>();
  for (const edge of input.edges) {
    dependents.set(edge.from, [...(dependents.get(edge.from) ?? []), edge]);
    prerequisites.set(edge.to, [...(prerequisites.get(edge.to) ?? []), edge]);
  }

  const implicit = new Map<string, ImplicitAnswer[]>();
  for (const [concept, answers] of [...input.answers].sort(([a], [b]) => a.localeCompare(b))) {
    const correct = answers.filter((answer) => answer.score >= CREDIT.correctAt);
    if (correct.length === 0) continue;
    // Walk the prerequisites breadth first; a concept reached twice keeps the stronger path.
    const best = new Map<string, { factor: number; hops: number }>([
      [concept, { factor: 1, hops: 0 }],
    ]);
    let frontier = [concept];
    for (let hops = 1; hops <= CREDIT.maxDepth; hops += 1) {
      const next: string[] = [];
      for (const at of frontier) {
        for (const edge of prerequisites.get(at) ?? []) {
          const factor = (best.get(at)?.factor ?? 1) * clampWeight(edge.weight);
          const known = best.get(edge.from);
          if (known && known.factor >= factor) continue;
          best.set(edge.from, { factor, hops });
          next.push(edge.from);
        }
      }
      frontier = next;
    }
    for (const [target, { factor, hops }] of best) {
      if (target === concept) continue;
      // A prerequisite the student is shaky on needs practice of its own.
      const own = input.accuracy.get(target);
      if (own !== null && own !== undefined && own < CREDIT.accuracyFloor) continue;
      const list = implicit.get(target) ?? [];
      for (const answer of correct) list.push({ ...answer, factor, fromId: concept, hops });
      implicit.set(target, list);
    }
  }

  const atRisk = new Map<string, { id: string; failures: number }[]>();
  for (const [concept, answers] of [...input.answers].sort(([a], [b]) => a.localeCompare(b))) {
    const failures = answers.filter(
      (answer) => answer.score < CREDIT.failedBelow && answer.ageDays < CREDIT.recentDays,
    ).length;
    if (failures === 0) continue;
    for (const edge of dependents.get(concept) ?? [])
      atRisk.set(edge.to, [...(atRisk.get(edge.to) ?? []), { id: concept, failures }]);
  }
  return { implicit, atRisk };
}
