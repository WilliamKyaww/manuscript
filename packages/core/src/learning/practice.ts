import type { MasteryStage } from './mastery';

/**
 * The adaptive practice engine, "Learn" (learning-system.md §6). Pure: a session's state is
 * rebuilt from its answers, so the server keeps nothing but the answers themselves.
 *
 * - Concepts are taken by priority, which halves each time a concept is shown in the session, so
 *   the session moves around rather than drilling one concept; never more than two items in a row
 *   for one concept unless it is the only one left.
 * - Each concept climbs a ladder — recognition → recall → production — after a correct answer and
 *   steps down after a wrong one.
 * - A concept is secure for the session after two correct answers at recall or above (or at the
 *   highest level it has material for, if that is lower). The session ends when all are secure.
 */

export const LADDER = ['recognition', 'recall', 'production'] as const;
export type PracticeLevel = (typeof LADDER)[number];

export const PRACTICE = {
  /** At or above: correct (climb). Below `wrongBelow`: wrong (step down). Between: stay. */
  correctAt: 0.75,
  wrongBelow: 0.5,
  secureAfter: 2,
  maxRun: 2,
  showDecay: 0.5,
} as const;

export interface PracticeItem {
  id: string;
  conceptIds: readonly string[];
  level: PracticeLevel;
}

export interface PracticeConcept {
  id: string;
  priority: number;
  stage: MasteryStage;
}

export interface PracticeStep {
  itemId: string;
  conceptId: string;
  score: number;
}

export interface LearnProgress {
  level: number;
  shown: number;
  correct: number;
  /** Correct answers that count towards being secure. */
  secureCorrect: number;
  secure: boolean;
  /** Item ids shown, oldest first. */
  seen: string[];
}

/** Where a concept starts on the ladder: what it already knows decides the first rung. */
export function startLevel(stage: MasteryStage): number {
  if (stage === 'practised') return 1;
  if (stage === 'confident' || stage === 'mastered') return 2;
  return 0;
}

const levelIndex = (level: PracticeLevel) => LADDER.indexOf(level);

export interface PracticeSession {
  progress: Map<string, LearnProgress>;
  steps: readonly PracticeStep[];
  next: { itemId: string; conceptId: string; level: PracticeLevel } | null;
}

/**
 * Replays a session's answers and chooses what comes next. `seed` makes ties and item order vary
 * between sessions but stay the same when the same session is rebuilt.
 */
export function practiceSession(
  concepts: readonly PracticeConcept[],
  items: readonly PracticeItem[],
  steps: readonly PracticeStep[],
  seed = 1,
): PracticeSession {
  const itemsByConcept = new Map<string, PracticeItem[]>();
  for (const concept of concepts) itemsByConcept.set(concept.id, []);
  for (const item of items)
    for (const conceptId of item.conceptIds) itemsByConcept.get(conceptId)?.push(item);
  const levelOf = new Map(items.map((item) => [item.id, levelIndex(item.level)]));

  const progress = new Map<string, LearnProgress>();
  for (const concept of concepts) {
    const own = itemsByConcept.get(concept.id) ?? [];
    if (own.length === 0) continue;
    const top = Math.max(...own.map((item) => levelIndex(item.level)));
    progress.set(concept.id, {
      level: Math.min(startLevel(concept.stage), top),
      shown: 0,
      correct: 0,
      secureCorrect: 0,
      secure: false,
      seen: [],
    });
  }
  const secureLevel = (conceptId: string) =>
    Math.min(1, Math.max(...(itemsByConcept.get(conceptId) ?? []).map((i) => levelIndex(i.level))));

  for (const step of steps) {
    const state = progress.get(step.conceptId);
    if (!state) continue;
    const level = levelOf.get(step.itemId) ?? state.level;
    state.shown += 1;
    state.seen.push(step.itemId);
    if (step.score >= PRACTICE.correctAt) {
      state.correct += 1;
      if (level >= secureLevel(step.conceptId)) state.secureCorrect += 1;
      state.level = Math.min(LADDER.length - 1, Math.max(state.level, level) + 1);
    } else if (step.score < PRACTICE.wrongBelow) {
      state.level = Math.max(0, Math.min(state.level, level) - 1);
    }
    if (state.secureCorrect >= PRACTICE.secureAfter) state.secure = true;
  }

  return { progress, steps, next: chooseNext(concepts, itemsByConcept, progress, steps, seed) };
}

/** A small deterministic generator (mulberry32), so a rebuilt session chooses the same way. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function chooseNext(
  concepts: readonly PracticeConcept[],
  itemsByConcept: Map<string, PracticeItem[]>,
  progress: Map<string, LearnProgress>,
  steps: readonly PracticeStep[],
  seed: number,
): PracticeSession['next'] {
  const open = concepts.filter((concept) => {
    const state = progress.get(concept.id);
    return state !== undefined && !state.secure;
  });
  if (open.length === 0) return null;

  const last = steps.at(-1)?.conceptId;
  const run = last === undefined ? 0 : countRun(steps, last);
  const allowed =
    open.length > 1 && run >= PRACTICE.maxRun
      ? open.filter((concept) => concept.id !== last)
      : open;
  // A tiny floor keeps rotation going when every priority is zero (nothing at stake).
  const score = (concept: PracticeConcept) =>
    (Math.max(0, concept.priority) + 1e-9) *
    PRACTICE.showDecay ** (progress.get(concept.id)?.shown ?? 0);
  let chosen = allowed[0] as PracticeConcept;
  for (const concept of allowed) if (score(concept) > score(chosen)) chosen = concept;

  const state = progress.get(chosen.id) as LearnProgress;
  const own = itemsByConcept.get(chosen.id) ?? [];
  // The nearest rung that has material, preferring the lower one on a tie.
  const distance = (item: PracticeItem) => Math.abs(levelIndex(item.level) - state.level);
  const nearest = Math.min(...own.map(distance));
  const rung = own.filter((item) => distance(item) === nearest);
  const lower = Math.min(...rung.map((item) => levelIndex(item.level)));
  const candidates = rung.filter((item) => levelIndex(item.level) === lower);

  // Unseen first, then the least recently seen; never the item just shown if there is another.
  const lastSeen = (item: PracticeItem) => state.seen.lastIndexOf(item.id);
  const previousItem = steps.at(-1)?.itemId;
  const pool =
    candidates.length > 1 ? candidates.filter((item) => item.id !== previousItem) : candidates;
  const oldest = Math.min(...pool.map(lastSeen));
  const fresh = pool.filter((item) => lastSeen(item) === oldest);
  const pick = random(seed + steps.length * 7919)();
  const item = fresh[Math.floor(pick * fresh.length)] as PracticeItem;
  return { itemId: item.id, conceptId: chosen.id, level: item.level };
}

function countRun(steps: readonly PracticeStep[], conceptId: string): number {
  let run = 0;
  for (
    let index = steps.length - 1;
    index >= 0 && steps[index]?.conceptId === conceptId;
    index -= 1
  )
    run += 1;
  return run;
}
