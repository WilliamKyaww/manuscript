/**
 * Concept priority (learning-system.md §9): how much studying a concept now is worth — the gap in
 * mastery, scaled by how much of the year's mark rides on it and how soon it is assessed.
 */

export const PRIORITY = {
  urgencyDays: 14,
  urgencyMin: 0.25,
  urgencyMax: 3,
  atRiskBoost: 1.25,
} as const;

/** clamp(14 / max(days, 1), 0.25, 3): an assessment a fortnight away counts once. */
export function urgency(daysUntil: number): number {
  return Math.min(
    PRIORITY.urgencyMax,
    Math.max(PRIORITY.urgencyMin, PRIORITY.urgencyDays / Math.max(daysUntil, 1)),
  );
}

export interface PriorityModule {
  id: string;
  code: string;
  credits: number | null;
}

export interface PriorityAssessment {
  id: string;
  moduleId: string;
  title: string;
  /** Fraction of the module mark. */
  weight: number;
  /** YYYY-MM-DD (a time part is ignored). */
  dueAt: string | null;
}

/** What makes a module's concepts matter: its most pressing assessment, or none known. */
export interface Exposure {
  moduleId: string | null;
  moduleCode: string | null;
  assessment: { id: string; title: string; weight: number; daysUntil: number } | null;
  /** Share of the year's mark at stake (weight × credits / Σ credits). */
  stake: number;
  urgency: number;
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) =>
  Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);

/**
 * Each module's exposure on `today` (YYYY-MM-DD): the upcoming assessment with the largest
 * stake × urgency. A module with no dated assessment ahead counts as its whole mark with the lowest
 * urgency; modules without credits share equally (each counts as the mean of the known credits).
 */
export function moduleExposures(
  modules: readonly PriorityModule[],
  assessments: readonly PriorityAssessment[],
  today: string,
): Map<string, Exposure> {
  const known = modules.flatMap((module) => (module.credits ? [module.credits] : []));
  const fallback = known.length === 0 ? 1 : known.reduce((a, b) => a + b, 0) / known.length;
  const credits = (module: PriorityModule) => module.credits || fallback;
  const total = modules.reduce((sum, module) => sum + credits(module), 0);
  const todayNumber = dayNumber(today);
  const result = new Map<string, Exposure>();
  for (const module of modules) {
    const share = total > 0 ? credits(module) / total : 1;
    let best: Exposure = {
      moduleId: module.id,
      moduleCode: module.code,
      assessment: null,
      stake: share,
      urgency: PRIORITY.urgencyMin,
    };
    for (const assessment of assessments) {
      if (assessment.moduleId !== module.id || !assessment.dueAt) continue;
      const daysUntil = dayNumber(assessment.dueAt) - todayNumber;
      if (Number.isNaN(daysUntil) || daysUntil < 0) continue;
      const candidate: Exposure = {
        moduleId: module.id,
        moduleCode: module.code,
        assessment: {
          id: assessment.id,
          title: assessment.title,
          weight: assessment.weight,
          daysUntil,
        },
        stake: assessment.weight * share,
        urgency: urgency(daysUntil),
      };
      if (
        best.assessment === null ||
        candidate.stake * candidate.urgency > best.stake * best.urgency
      )
        best = candidate;
    }
    result.set(module.id, best);
  }
  return result;
}

/** A concept outside every module still gets an equal share at the lowest urgency. */
export function unassignedExposure(moduleCount: number): Exposure {
  return {
    moduleId: null,
    moduleCode: null,
    assessment: null,
    stake: 1 / Math.max(1, moduleCount),
    urgency: PRIORITY.urgencyMin,
  };
}

/** The exposure that matters most among a concept's modules. */
export function strongestExposure(exposures: readonly Exposure[], moduleCount: number): Exposure {
  let best: Exposure | null = null;
  for (const exposure of exposures)
    if (best === null || exposure.stake * exposure.urgency > best.stake * best.urgency)
      best = exposure;
  return best ?? unassignedExposure(moduleCount);
}

export interface PriorityInput {
  mastery: number | null;
  importance: number;
  exposure: Exposure;
  atRisk?: boolean;
}

/** gap × stake × urgency × importance × (at risk ? 1.25 : 1). */
export function conceptPriority(input: PriorityInput): number {
  const gap = 1 - (input.mastery ?? 0);
  return (
    gap *
    input.exposure.stake *
    input.exposure.urgency *
    input.importance *
    (input.atRisk ? PRIORITY.atRiskBoost : 1)
  );
}
