import {
  type AnswerEvidence,
  type CardEvidence,
  type ConceptProgress,
  conceptMastery,
  conceptPriority,
  createScheduler,
  type Exposure,
  MASTERY,
  moduleExposures,
  type ReviewSettings,
  type RollUp,
  rollUp,
  strongestExposure,
  WEAKNESS,
  weakSignals,
} from '@skb/core';
import { reviewDay } from '../cards/days';
import type { AnswerEvidenceRow, ConceptInfo, ItemCounts, MasteryRepository } from './repository';

/**
 * One pass over all the evidence: every active concept's mastery, signals and priority, and the
 * roll-ups of topics, modules and the course. Cheap enough to run whenever something changed.
 */

const DAY_MS = 86_400_000;

export interface Snapshot {
  computedAt: string;
  concepts: Map<string, ConceptProgress>;
  info: Map<string, ConceptInfo>;
  answers: Map<string, AnswerEvidenceRow[]>;
  items: Map<string, ItemCounts>;
  modules: { id: string; code: string; title: string }[];
  topics: { id: string; moduleId: string; parentId: string | null; title: string }[];
  conceptsOfModule: Map<string, string[]>;
  conceptsOfTopic: Map<string, string[]>;
  /** Concepts in no module at all. */
  unassigned: string[];
  moduleRollUps: Map<string, RollUp>;
  topicRollUps: Map<string, RollUp>;
  overall: RollUp;
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

const mean = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

export function computeSnapshot(
  repo: MasteryRepository,
  settings: ReviewSettings,
  now: Date,
): Snapshot {
  const scheduler = createScheduler(settings);
  const at = now.getTime();
  const concepts = repo.concepts();
  const info = new Map(concepts.map((concept) => [concept.id, concept]));

  const cards = new Map<string, CardEvidence[]>();
  for (const face of repo.faces()) {
    const retrievability = scheduler.retrievability(face.schedule, now);
    if (retrievability === null) continue;
    push(cards, face.conceptId, {
      retrievability,
      state: face.schedule.state,
      stability: face.schedule.stability,
    });
  }
  const answers = new Map<string, AnswerEvidenceRow[]>();
  for (const answer of repo.answers()) push(answers, answer.conceptId, answer);
  const evidenceOf = (rows: readonly AnswerEvidenceRow[]): AnswerEvidence[] =>
    rows.map((row) => ({
      score: row.score,
      ageDays: ageInDays(row.answeredAt, now),
      assisted: row.assisted,
    }));

  const items = repo.items();
  const windowStart = new Date(at - WEAKNESS.windowDays * DAY_MS);
  const lapses = repo.lapses(windowStart.toISOString());
  const before = new Map<string, number[]>();
  for (const face of repo.schedulesAt(windowStart.toISOString())) {
    const retrievability = scheduler.retrievability(face.schedule, windowStart);
    if (retrievability !== null) push(before, face.conceptId, retrievability);
  }

  const modules = repo.modules();
  const shown = new Set(modules.map((module) => module.id));
  const exposures = moduleExposures(modules, repo.assessments(), reviewDay(now).key);
  const conceptsOfModule = new Map<string, string[]>();
  const modulesOfConcept = new Map<string, string[]>();
  // Concepts only in archived modules are neither shown nor unassigned.
  const inSomeModule = new Set<string>();
  for (const link of repo.conceptModules()) {
    inSomeModule.add(link.conceptId);
    if (shown.has(link.moduleId) && info.has(link.conceptId)) {
      push(conceptsOfModule, link.moduleId, link.conceptId);
      push(modulesOfConcept, link.conceptId, link.moduleId);
    }
  }
  const conceptsOfTopic = new Map<string, string[]>();
  for (const link of repo.conceptTopics())
    if (info.has(link.conceptId)) push(conceptsOfTopic, link.topicId, link.conceptId);

  const progress = new Map<string, ConceptProgress>();
  for (const concept of concepts) {
    const counts = items.get(concept.id) ?? {
      cards: 0,
      cardsPractised: 0,
      questions: 0,
      questionsPractised: 0,
    };
    const own = answers.get(concept.id) ?? [];
    const evidence = evidenceOf(own);
    const itemsLinked = counts.cards + counts.questions;
    const itemsPractised = counts.cardsPractised + counts.questionsPractised;
    const mastery = conceptMastery({
      cards: cards.get(concept.id) ?? [],
      answers: evidence,
      itemsLinked,
      itemsPractised,
    });
    const signals = weakSignals({
      mastery,
      answers: evidence,
      lapses: lapses.get(concept.id) ?? 0,
      recallBefore: mean(before.get(concept.id) ?? []),
      itemsLinked,
    });
    const exposure: Exposure = strongestExposure(
      (modulesOfConcept.get(concept.id) ?? []).flatMap((id) => {
        const value = exposures.get(id);
        return value ? [value] : [];
      }),
      modules.length,
    );
    progress.set(concept.id, {
      concept: {
        id: concept.id as ConceptProgress['concept']['id'],
        name: concept.name,
        importance: concept.importance,
      },
      components: { ...mastery, itemsLinked, itemsPractised },
      signals,
      priority: conceptPriority({
        mastery: mastery.mastery,
        importance: concept.importance,
        exposure,
      }),
      exposure: exposure as ConceptProgress['exposure'],
    });
  }

  const rollUpOf = (ids: readonly string[]) =>
    rollUp(
      [...new Set(ids)].flatMap((id) => {
        const row = progress.get(id);
        return row ? [{ importance: row.concept.importance, mastery: row.components.mastery }] : [];
      }),
    );
  const topics = repo.topics().filter((topic) => shown.has(topic.moduleId));
  const below = (topicId: string): string[] => [
    ...(conceptsOfTopic.get(topicId) ?? []),
    ...topics.filter((topic) => topic.parentId === topicId).flatMap((topic) => below(topic.id)),
  ];
  const unassigned = concepts
    .filter((concept) => !inSomeModule.has(concept.id))
    .map((concept) => concept.id);
  return {
    computedAt: now.toISOString(),
    concepts: progress,
    info,
    answers,
    items,
    modules: modules.map(({ id, code, title }) => ({ id, code, title })),
    topics,
    conceptsOfModule,
    conceptsOfTopic,
    unassigned,
    moduleRollUps: new Map(
      modules.map((module) => [module.id, rollUpOf(conceptsOfModule.get(module.id) ?? [])]),
    ),
    topicRollUps: new Map(topics.map((topic) => [topic.id, rollUpOf(below(topic.id))])),
    overall: rollUpOf([...[...conceptsOfModule.values()].flat(), ...unassigned]),
  };
}

/**
 * An answer's age in whole days (days run from 04:00, as for reviews): 0 today, 1 yesterday. Whole
 * days keep the weights checkable by hand — an answer today weighs 1, one three weeks old ½.
 */
export function ageInDays(answeredAt: string, now: Date): number {
  const days =
    (reviewDay(now).start.getTime() - reviewDay(new Date(answeredAt)).start.getTime()) / DAY_MS;
  return Math.max(0, Math.round(days));
}

/** The weight an answer carries today (shown beside it in the explanation). */
export function answerWeight(answeredAt: string, assisted: boolean, now: Date): number {
  const ageDays = ageInDays(answeredAt, now);
  return 0.5 ** (ageDays / MASTERY.halfLifeDays) * (assisted ? MASTERY.assistedFactor : 1);
}
