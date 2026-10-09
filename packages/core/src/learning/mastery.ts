import type { ReviewState } from './fsrs';

/**
 * The mastery model (learning-system.md §7, ADR-0021): a transparent heuristic, never set by hand or
 * by AI. Every number it produces can be recomputed from the components it returns. Thresholds are
 * named constants; changing one needs a recorded decision.
 */

export const MASTERY = {
  /** Answers counted: the most recent this many. */
  answerWindow: 20,
  /** An answer's weight halves every this many days. */
  halfLifeDays: 21,
  /** Answers given with help count half. */
  assistedFactor: 0.5,
  /** Below this total answer weight, answers say nothing yet. */
  minAnswerWeight: 0.5,
  /** Questions weigh more than cards: they test understanding, not only recall. */
  questionWeight: 1.5,
  confidence: { medium: 3, high: 8 },
  stage: { practised: 0.6, confident: 0.8, mastered: 0.9 },
  /** Mastered also needs cards that last: median stability of reviewed faces, in days. */
  masteredStabilityDays: 21,
} as const;

export const MASTERY_STAGES = ['new', 'learning', 'practised', 'confident', 'mastered'] as const;
export type MasteryStage = (typeof MASTERY_STAGES)[number];
export type MasteryConfidence = 'none' | 'low' | 'medium' | 'high';

/** A reviewed card face linked to the concept. */
export interface CardEvidence {
  retrievability: number;
  state: ReviewState;
  stability: number;
}

/** An answer to a question linked to the concept. */
export interface AnswerEvidence {
  score: number;
  ageDays: number;
  assisted: boolean;
}

export interface ConceptEvidence {
  cards: readonly CardEvidence[];
  /** Newest first. */
  answers: readonly AnswerEvidence[];
  /** Cards and questions linked to the concept, and how many of them were ever practised. */
  itemsLinked: number;
  itemsPractised: number;
}

export interface ConceptMastery {
  mastery: number | null;
  /** Mean retrievability of the reviewed faces now, and how many there are. */
  recall: number | null;
  recallCount: number;
  /** Recency-weighted accuracy of recent answers, and their total weight. */
  accuracy: number | null;
  answerWeight: number;
  evidence: number;
  confidence: MasteryConfidence;
  stage: MasteryStage;
  /** Items practised over items linked (null when nothing is linked). */
  coverage: number | null;
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number);
};

export function conceptMastery(evidence: ConceptEvidence): ConceptMastery {
  const { cards } = evidence;
  const recallCount = cards.length;
  const recall =
    recallCount === 0
      ? null
      : cards.reduce((sum, card) => sum + card.retrievability, 0) / recallCount;

  const recent = evidence.answers.slice(0, MASTERY.answerWindow);
  const weights = recent.map(
    (answer) =>
      0.5 ** (answer.ageDays / MASTERY.halfLifeDays) *
      (answer.assisted ? MASTERY.assistedFactor : 1),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const counts = totalWeight >= MASTERY.minAnswerWeight;
  const accuracy = counts
    ? recent.reduce((sum, answer, index) => sum + (weights[index] as number) * answer.score, 0) /
      totalWeight
    : null;
  const answerWeight = counts ? totalWeight : 0;

  const q = MASTERY.questionWeight;
  const evidenceWeight = recallCount + q * answerWeight;
  const mastery =
    evidenceWeight === 0
      ? null
      : ((recall ?? 0) * recallCount + q * (accuracy ?? 0) * answerWeight) / evidenceWeight;

  const confidence: MasteryConfidence =
    mastery === null
      ? 'none'
      : evidenceWeight < MASTERY.confidence.medium
        ? 'low'
        : evidenceWeight < MASTERY.confidence.high
          ? 'medium'
          : 'high';

  let stage: MasteryStage;
  const learningCard = cards.some(
    (card) => card.state === 'learning' || card.state === 'relearning',
  );
  if (mastery === null) stage = 'new';
  else if (mastery < MASTERY.stage.practised || learningCard) stage = 'learning';
  else if (mastery < MASTERY.stage.confident) stage = 'practised';
  else if (
    mastery >= MASTERY.stage.mastered &&
    confidence === 'high' &&
    (cards.length === 0 ||
      median(cards.map((card) => card.stability)) >= MASTERY.masteredStabilityDays)
  )
    stage = 'mastered';
  else stage = 'confident';

  return {
    mastery,
    recall,
    recallCount,
    accuracy,
    answerWeight,
    evidence: evidenceWeight,
    confidence,
    stage,
    coverage: evidence.itemsLinked === 0 ? null : evidence.itemsPractised / evidence.itemsLinked,
  };
}

export interface RollUp {
  /** Importance-weighted mean over concepts with evidence ("mastery of practised material"). */
  mastery: number | null;
  /** The same with unstarted concepts counted as 0: the honest exam-readiness number. */
  readiness: number | null;
  /** Share of concepts with evidence. */
  coverage: number | null;
  practised: number;
  total: number;
}

/** Topic, module and course figures from their concepts (learning-system.md §7, roll-up). */
export function rollUp(
  concepts: readonly { importance: number; mastery: number | null }[],
): RollUp {
  const total = concepts.length;
  if (total === 0)
    return { mastery: null, readiness: null, coverage: null, practised: 0, total: 0 };
  const practised = concepts.filter((concept) => concept.mastery !== null);
  const weight = (list: typeof concepts) =>
    list.reduce((sum, concept) => sum + concept.importance, 0);
  const weighted = (list: typeof concepts) =>
    list.reduce((sum, concept) => sum + concept.importance * (concept.mastery ?? 0), 0);
  const allWeight = weight(concepts);
  const practisedWeight = weight(practised);
  return {
    mastery:
      practised.length === 0 || practisedWeight === 0
        ? null
        : weighted(practised) / practisedWeight,
    readiness: allWeight === 0 ? null : weighted(concepts) / allWeight,
    coverage: practised.length / total,
    practised: practised.length,
    total,
  };
}
