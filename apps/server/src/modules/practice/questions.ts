import {
  answerProblem,
  type Id,
  type IdFactory,
  LocatorSchema,
  NotFoundError,
  type Question,
  type QuestionInputSchema,
  type QuestionPrompt,
  ValidationError,
} from '@skb/core';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { LearningRepository } from '../learning/repository';
import type { QuestionFilter, QuestionRow, QuestionsRepository } from './questions-repository';

/**
 * The question bank (task 9.02). A question's kind is its answer key's kind, so the key is always
 * valid for it; deleting is soft, because answers keep pointing at what they answered.
 */

type QuestionInput = z.output<typeof QuestionInputSchema>;

export interface QuestionsDependencies {
  repo: QuestionsRepository;
  learning: LearningRepository;
  clock: Clock;
  ids: IdFactory;
}

export type QuestionsService = ReturnType<typeof createQuestionsService>;

export function createQuestionsService(deps: QuestionsDependencies) {
  const { repo, learning, clock, ids } = deps;
  const now = () => clock.now().toISOString();

  const requireRow = (id: string): QuestionRow => {
    const row = repo.get(id);
    if (!row) throw new NotFoundError('That question does not exist.');
    return row;
  };

  const checkPlace = (moduleId: string | null, lectureId: string | null) => {
    if (moduleId && !learning.module(moduleId))
      throw new ValidationError('That module does not exist.');
    if (lectureId) {
      const lecture = learning.lecture(lectureId);
      if (!lecture) throw new ValidationError('That lecture does not exist.');
      if (moduleId && lecture.moduleId !== moduleId)
        throw new ValidationError('The lecture belongs to another module.');
    }
  };

  const checkConcepts = (conceptIds: readonly string[]) => {
    const found = repo.existingConcepts(conceptIds);
    if (conceptIds.some((id) => !found.has(id)))
      throw new ValidationError('One of the concepts does not exist.');
  };

  const checkAnswer = (row: QuestionRow) => {
    const problem = answerProblem(row.answer);
    if (problem) throw new ValidationError(problem);
  };

  /** Full questions, with concepts, places and answer statistics. */
  const questionsOf = (rows: readonly QuestionRow[]): Question[] => {
    const questionIds = rows.map((row) => row.id);
    const concepts = repo.conceptsOf(questionIds);
    const stats = repo.stats(questionIds);
    const modules = new Map<string, Question['module']>();
    const moduleRef = (id: string | null): Question['module'] => {
      if (!id) return null;
      if (!modules.has(id)) {
        const module = learning.module(id);
        modules.set(
          id,
          module ? { id: module.id as Id<'module'>, code: module.code, title: module.title } : null,
        );
      }
      return modules.get(id) ?? null;
    };
    return rows.map((row) => {
      const lecture = row.lectureId ? learning.lecture(row.lectureId) : null;
      return {
        id: row.id as Question['id'],
        kind: row.kind,
        stem: row.stem,
        answer: row.answer,
        rubric: row.rubric,
        explanation: row.explanation,
        hint: row.hint,
        difficulty: row.difficulty,
        status: row.status,
        module: moduleRef(row.moduleId),
        lecture: lecture
          ? { id: lecture.id as Id<'lecture'>, key: lecture.key, title: lecture.title }
          : null,
        tags: row.tags,
        locator: row.locatorJson ? LocatorSchema.parse(JSON.parse(row.locatorJson)) : null,
        concepts: (concepts.get(row.id) ?? []) as Question['concepts'],
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        stats: stats.get(row.id) ?? { answers: 0, lastScore: null, lastAnsweredAt: null },
      };
    });
  };

  const one = (row: QuestionRow): Question => questionsOf([row])[0] as Question;

  return {
    questionsOf,

    list(filter: QuestionFilter & { q?: string }): Question[] {
      const needle = filter.q?.trim().toLowerCase();
      const rows = repo
        .list(filter)
        .filter((row) => !needle || row.stem.toLowerCase().includes(needle));
      return questionsOf(rows);
    },

    get: (id: string): Question => one(requireRow(id)),

    create(input: QuestionInput, createdBy: QuestionRow['createdBy'] = 'user'): Question {
      const at = now();
      const row: QuestionRow = {
        id: ids('question'),
        kind: input.answer.kind,
        stem: input.stem,
        answer: input.answer,
        rubric: input.rubric ?? '',
        explanation: input.explanation ?? '',
        hint: input.hint ?? '',
        difficulty: input.difficulty ?? 3,
        status: input.status ?? 'active',
        moduleId: input.moduleId ?? null,
        lectureId: input.lectureId ?? null,
        tags: [...new Set(input.tags ?? [])],
        locatorJson: input.locator ? JSON.stringify(input.locator) : null,
        createdBy,
        createdAt: at,
        updatedAt: at,
      };
      checkAnswer(row);
      checkPlace(row.moduleId, row.lectureId);
      const conceptIds = [...new Set(input.conceptIds ?? [])];
      checkConcepts(conceptIds);
      repo.transaction(() => {
        repo.insert(row);
        repo.setConcepts(row.id, conceptIds);
      });
      return one(row);
    },

    update(id: string, input: Partial<QuestionInput>): Question {
      const current = requireRow(id);
      const row: QuestionRow = {
        ...current,
        kind: input.answer?.kind ?? current.kind,
        stem: input.stem ?? current.stem,
        answer: input.answer ?? current.answer,
        rubric: input.rubric ?? current.rubric,
        explanation: input.explanation ?? current.explanation,
        hint: input.hint ?? current.hint,
        difficulty: input.difficulty ?? current.difficulty,
        status: input.status ?? current.status,
        moduleId: input.moduleId === undefined ? current.moduleId : input.moduleId,
        lectureId: input.lectureId === undefined ? current.lectureId : input.lectureId,
        tags: input.tags ? [...new Set(input.tags)] : current.tags,
        locatorJson:
          input.locator === undefined
            ? current.locatorJson
            : input.locator
              ? JSON.stringify(input.locator)
              : null,
        updatedAt: now(),
      };
      checkAnswer(row);
      checkPlace(row.moduleId, row.lectureId);
      const conceptIds = input.conceptIds ? [...new Set(input.conceptIds)] : null;
      if (conceptIds) checkConcepts(conceptIds);
      repo.transaction(() => {
        repo.update(row);
        if (conceptIds) repo.setConcepts(row.id, conceptIds);
      });
      return one(row);
    },

    remove(id: string): void {
      const row = requireRow(id);
      repo.update({ ...row, status: 'deleted', updatedAt: now() });
    },
  };
}

/** A question as it is asked: everything but its answer key. */
export function promptOf(question: Question): QuestionPrompt {
  const { answer } = question;
  return {
    id: question.id,
    kind: question.kind,
    stem: question.stem,
    options:
      answer.kind === 'mcq' || answer.kind === 'multi'
        ? answer.options.map((option) => ({ id: option.id, text: option.text }))
        : null,
    unit: answer.kind === 'numeric' ? answer.unit : null,
    language: answer.kind === 'code' ? answer.language : null,
    hint: question.hint,
    difficulty: question.difficulty,
    concepts: question.concepts,
    locator: question.locator,
  };
}
