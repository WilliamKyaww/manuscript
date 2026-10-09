import type { LearnScope, QuizConfig } from '@skb/core';
import type { QuestionRow } from './questions-repository';

/**
 * Which questions a quiz's scope takes in, and which concepts a Learn session covers. Each part of a
 * scope narrows the selection (module and lectures and topics …); within a part, any match counts.
 */

export interface PoolEntry {
  row: QuestionRow;
  conceptIds: string[];
}

export interface ScopeContext {
  memberships: Map<string, { modules: string[]; topics: string[] }>;
  topics: readonly { id: string; parentId: string | null }[];
}

/** The topics and every topic below them. */
export function withSubtopics(
  topicIds: readonly string[],
  topics: ScopeContext['topics'],
): Set<string> {
  const result = new Set(topicIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const topic of topics)
      if (topic.parentId && result.has(topic.parentId) && !result.has(topic.id)) {
        result.add(topic.id);
        grew = true;
      }
  }
  return result;
}

export function questionsInScope(
  pool: readonly PoolEntry[],
  config: Pick<QuizConfig, 'scope' | 'kinds' | 'difficulty'>,
  context: ScopeContext,
): PoolEntry[] {
  const { scope, kinds, difficulty } = config;
  const lectures = scope.lectureIds?.length ? new Set<string>(scope.lectureIds) : null;
  const topics = scope.topicIds?.length ? withSubtopics(scope.topicIds, context.topics) : null;
  const concepts = scope.conceptIds?.length ? new Set<string>(scope.conceptIds) : null;
  const tags = scope.tags?.length ? new Set(scope.tags) : null;
  const member = (conceptId: string) => context.memberships.get(conceptId);

  return pool.filter(({ row, conceptIds }) => {
    if (kinds && !kinds.includes(row.kind)) return false;
    if (difficulty && (row.difficulty < difficulty.min || row.difficulty > difficulty.max))
      return false;
    if (
      scope.moduleId &&
      row.moduleId !== scope.moduleId &&
      !conceptIds.some((id) => member(id)?.modules.includes(scope.moduleId as string))
    )
      return false;
    if (lectures && !(row.lectureId && lectures.has(row.lectureId))) return false;
    if (topics && !conceptIds.some((id) => member(id)?.topics.some((topic) => topics.has(topic))))
      return false;
    if (concepts && !conceptIds.some((id) => concepts.has(id))) return false;
    if (tags && !row.tags.some((tag) => tags.has(tag))) return false;
    return true;
  });
}

/**
 * The concepts a Learn session covers: the named concepts, else those in the topics (and their
 * subtopics), else those in the module, else every concept.
 */
export function conceptsInScope(
  scope: LearnScope,
  allConceptIds: readonly string[],
  context: ScopeContext,
): string[] {
  if (scope.conceptIds?.length) {
    const wanted = new Set<string>(scope.conceptIds);
    return allConceptIds.filter((id) => wanted.has(id));
  }
  if (scope.topicIds?.length) {
    const topics = withSubtopics(scope.topicIds, context.topics);
    return allConceptIds.filter((id) =>
      context.memberships.get(id)?.topics.some((topic) => topics.has(topic)),
    );
  }
  if (scope.moduleId) {
    const moduleId = scope.moduleId;
    return allConceptIds.filter((id) => context.memberships.get(id)?.modules.includes(moduleId));
  }
  return [...allConceptIds];
}
