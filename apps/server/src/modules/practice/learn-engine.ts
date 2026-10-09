import { practiceSession, QUESTION_LEVEL, seedOf } from '@skb/core';
import type { AnswerRow, QuizRow } from './attempts-repository';
import type { QuestionsRepository } from './questions-repository';

/**
 * Rebuilds a Learn session from what is stored: the concepts as they stood when it began (in the
 * quiz's config), the questions it may ask (its items) and the answers given so far.
 */
export function learnSession(
  quiz: QuizRow,
  itemIds: readonly string[],
  questionsRepo: QuestionsRepository,
  answers: readonly AnswerRow[],
) {
  const concepts = quiz.config.learn?.concepts ?? [];
  const inSession = new Set(concepts.map((concept) => concept.id as string));
  const rows = questionsRepo.byIds(itemIds);
  const links = questionsRepo.conceptsOf(itemIds);
  const items = itemIds.flatMap((id) => {
    const row = rows.get(id);
    if (row?.status !== 'active') return [];
    const conceptIds = (links.get(id) ?? [])
      .map((concept) => concept.id)
      .filter((conceptId) => inSession.has(conceptId));
    return conceptIds.length ? [{ id, conceptIds, level: QUESTION_LEVEL[row.kind] }] : [];
  });
  const steps = answers.flatMap((answer) =>
    answer.score === null || !answer.conceptId
      ? []
      : [{ itemId: answer.questionId, conceptId: answer.conceptId, score: answer.score }],
  );
  return practiceSession(concepts, items, steps, seedOf(quiz.id));
}
