import { cardAdvice, type Drafts, duplicateFinder } from '@skb/core';
import type { EventBus } from '../../shared/events';
import type { CardsRepository } from '../cards/repository';
import type { CardsService } from '../cards/service';
import type { QuestionsService } from '../practice/questions';
import type { QuestionsRepository } from '../practice/questions-repository';

/**
 * Drafts (task 11.13): generated cards and questions wait with the status `draft` — never studied,
 * never counted towards mastery — until the student accepts (activates) or rejects (deletes) them.
 * Each is shown with the card or question in use that it most resembles, if any.
 */

export interface DraftsDependencies {
  cards: CardsService;
  cardsRepo: CardsRepository;
  questions: QuestionsService;
  questionsRepo: QuestionsRepository;
  events: EventBus;
}

export function createDraftsService(deps: DraftsDependencies) {
  const { cards, cardsRepo, questions, questionsRepo, events } = deps;
  const changed = () => events.publish({ type: 'data.changed', area: 'inbox' });

  const draftCardIds = (ids: readonly string[]) => {
    const wanted = new Set(ids);
    return cardsRepo
      .drafts()
      .filter((row) => wanted.has(row.id))
      .map((row) => row.id);
  };
  const draftQuestionIds = (ids: readonly string[]) => {
    const wanted = new Set(ids);
    return questionsRepo
      .list({ status: 'draft' })
      .filter((row) => wanted.has(row.id))
      .map((row) => row.id);
  };

  return {
    list(): Drafts {
      const cardFinder = duplicateFinder(cardsRepo.texts());
      const questionFinder = duplicateFinder(questionsRepo.stems());
      return {
        cards: cards.cardsOf(cardsRepo.drafts()).map((card) => {
          const hit = cardFinder(`${card.front} ${card.back}`);
          return {
            ...card,
            duplicateOf: hit ? { id: hit.id, text: hit.text } : null,
            advice: cardAdvice(card.kind === 'reversed' ? { ...card, kind: 'basic' } : card),
          };
        }),
        questions: questions
          .questionsOf(questionsRepo.list({ status: 'draft' }).reverse())
          .map((question) => {
            const hit = questionFinder(question.stem);
            return { ...question, duplicateOf: hit ? { id: hit.id, text: hit.text } : null };
          }),
      };
    },

    count(): number {
      return cardsRepo.drafts().length + questionsRepo.list({ status: 'draft' }).length;
    },

    /** Activates drafts: cards join reviews, questions join quizzes and mastery. */
    accept(input: { cardIds: readonly string[]; questionIds: readonly string[] }) {
      const cardIds = draftCardIds(input.cardIds);
      const questionIds = draftQuestionIds(input.questionIds);
      if (cardIds.length) cards.bulk(cardIds, 'activate');
      for (const id of questionIds) questions.update(id, { status: 'active' });
      changed();
      return { cards: cardIds.length, questions: questionIds.length };
    },

    reject(input: { cardIds: readonly string[]; questionIds: readonly string[] }) {
      const cardIds = draftCardIds(input.cardIds);
      const questionIds = draftQuestionIds(input.questionIds);
      if (cardIds.length) cards.bulk(cardIds, 'delete');
      for (const id of questionIds) questions.remove(id);
      changed();
      return { cards: cardIds.length, questions: questionIds.length };
    },
  };
}

export type DraftsService = ReturnType<typeof createDraftsService>;
