import {
  type ConceptMasteryDetail,
  type ConceptProgress,
  type Id,
  MASTERY,
  type MasteryStage,
  NotFoundError,
  type ProgressOverview,
  type WeakAreas,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import type { EventBus } from '../../shared/events';
import type { SettingsService } from '../settings/service';
import { answerWeight, computeSnapshot, type Snapshot } from './compute';
import type { CacheRow, MasteryRepository } from './repository';

/**
 * Mastery, readiness and weak areas (tasks 9.07–9.08). Everything is computed from cards and
 * answers in one pass and kept until something it depends on changes — a review, an answer, a
 * link, the course structure — or until it is a quarter of an hour old, since retrievability keeps
 * falling while nothing happens. Each computation is written to the derived mastery_cache.
 */

export interface MasteryDependencies {
  repo: MasteryRepository;
  settings: SettingsService;
  events: EventBus;
  clock: Clock;
}

export type MasteryService = ReturnType<typeof createMasteryService>;

const MAX_AGE_MS = 15 * 60_000;

export function createMasteryService(deps: MasteryDependencies) {
  const { repo, settings, events, clock } = deps;
  let snapshot: Snapshot | null = null;
  let stale = true;

  const unsubscribe = events.subscribe((event) => {
    if (event.type === 'data.changed' || event.type === 'vault.changed') stale = true;
  });

  const current = (): Snapshot => {
    const now = clock.now();
    if (
      snapshot &&
      !stale &&
      now.getTime() - Date.parse(snapshot.computedAt) < MAX_AGE_MS &&
      now.getTime() >= Date.parse(snapshot.computedAt)
    )
      return snapshot;
    stale = false;
    snapshot = computeSnapshot(repo, settings.review(), now);
    repo.writeCache(cacheRows(snapshot), snapshot.computedAt);
    return snapshot;
  };

  const rows = (s: Snapshot, ids: readonly string[]) =>
    ids.flatMap((id) => {
      const row = s.concepts.get(id);
      return row ? [row] : [];
    });

  const byName = (a: ConceptProgress, b: ConceptProgress) =>
    a.concept.name.localeCompare(b.concept.name);

  return {
    /** Something mastery depends on changed (a review, an answer, a link). */
    invalidate(): void {
      stale = true;
    },

    overview(moduleId?: string): ProgressOverview {
      const s = current();
      const modules = s.modules.filter((module) => !moduleId || module.id === moduleId);
      return {
        computedAt: s.computedAt,
        overall: s.overall,
        modules: modules.map((module) => ({
          module: { id: module.id as Id<'module'>, code: module.code, title: module.title },
          rollUp: s.moduleRollUps.get(module.id) ?? s.overall,
          topics: s.topics
            .filter((topic) => topic.moduleId === module.id)
            .map((topic) => ({
              id: topic.id as Id<'topic'>,
              parentId: topic.parentId as Id<'topic'> | null,
              title: topic.title,
              rollUp: s.topicRollUps.get(topic.id) ?? s.overall,
            })),
          concepts: rows(s, s.conceptsOfModule.get(module.id) ?? []).sort(byName),
        })),
        unassigned: moduleId ? [] : rows(s, s.unassigned).sort(byName),
      };
    },

    concept(id: string): ConceptMasteryDetail {
      const s = current();
      const row = s.concepts.get(id);
      if (!row) throw new NotFoundError('That concept does not exist.');
      const items = s.items.get(id);
      const now = new Date(s.computedAt);
      const answers = (s.answers.get(id) ?? []).slice(0, MASTERY.answerWindow);
      return {
        ...row,
        computedAt: s.computedAt,
        cards: { linked: items?.cards ?? 0, reviewed: items?.cardsPractised ?? 0 },
        questions: { linked: items?.questions ?? 0, answered: items?.questionsPractised ?? 0 },
        answers: answers.map((answer) => ({
          questionId: answer.questionId as Id<'question'>,
          stem: answer.stem,
          score: answer.score,
          assisted: answer.assisted,
          answeredAt: answer.answeredAt,
          weight: answerWeight(answer.answeredAt, answer.assisted, now),
        })),
      };
    },

    weak(moduleId: string | undefined, limit: number): WeakAreas {
      const s = current();
      const ids = moduleId ? (s.conceptsOfModule.get(moduleId) ?? []) : [...s.concepts.keys()];
      const inScope = rows(s, ids);
      return {
        computedAt: s.computedAt,
        items: inScope
          .filter((row) => row.signals.some((signal) => signal.kind !== 'no_material'))
          .sort((a, b) => b.priority - a.priority || byName(a, b))
          .slice(0, limit),
        noMaterial: inScope
          .filter((row) => row.components.itemsLinked === 0)
          .sort(byName)
          .map((row) => ({ id: row.concept.id, name: row.concept.name })),
      };
    },

    /** Every active concept with its mastery, signals and priority, most pressing first. */
    concepts(): ConceptProgress[] {
      return [...current().concepts.values()].sort(
        (a, b) => b.priority - a.priority || byName(a, b),
      );
    },

    /** Priority and stage of every active concept, for a Learn session's start. */
    states(): { id: string; name: string; priority: number; stage: MasteryStage }[] {
      const s = current();
      return [...s.concepts.values()].map((row) => ({
        id: row.concept.id,
        name: row.concept.name,
        priority: row.priority,
        stage: row.components.stage,
      }));
    },

    close: unsubscribe,
  };
}

/** The cache rows for a snapshot: every concept, topic, module and the course. */
export function cacheRows(s: Snapshot): CacheRow[] {
  const result: CacheRow[] = [];
  for (const row of s.concepts.values())
    result.push({
      entityType: 'concept',
      entityId: row.concept.id,
      score: row.components.mastery,
      stage: row.components.stage,
      confidence: row.components.confidence,
      components: { ...row.components, signals: row.signals, priority: row.priority },
    });
  const rollUpRow = (entityType: CacheRow['entityType'], entityId: string, rollUp: unknown) => ({
    entityType,
    entityId,
    score: (rollUp as { mastery: number | null }).mastery,
    stage: null,
    confidence: null,
    components: rollUp,
  });
  for (const [id, rollUp] of s.topicRollUps) result.push(rollUpRow('topic', id, rollUp));
  for (const [id, rollUp] of s.moduleRollUps) result.push(rollUpRow('module', id, rollUp));
  result.push(rollUpRow('course', 'all', s.overall));
  return result;
}
