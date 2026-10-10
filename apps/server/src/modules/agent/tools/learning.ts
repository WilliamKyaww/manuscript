import {
  cardProblem,
  type Id,
  idSchema,
  LocatorSchema,
  NotFoundError,
  QuizConfigSchema,
  ValidationError,
} from '@skb/core';
import { z } from 'zod';
import { defineTool, type Json } from '../types';
import { count } from './shared';

/**
 * Learning tools (task 12.08): read the course, mastery and what is due; make flashcards and
 * quizzes. There is deliberately no tool that sets mastery — it is worked out from evidence only —
 * and none that records an answer on the student's behalf (see ADR-0035).
 */

const ModuleId = idSchema('module');
const LectureId = idSchema('lecture');
const ConceptId = idSchema('concept');
const CardId = idSchema('card');
const CardSetId = idSchema('cardSet');

const pct = (value: number | null) => (value === null ? null : Math.round(value * 100));

export const listModules = defineTool({
  name: 'list_modules',
  category: 'learning',
  description: 'List the student’s modules with their codes, sizes and next deadline.',
  input: z.object({}),
  output: z.object({
    modules: z.array(
      z.object({
        id: z.string(),
        code: z.string(),
        title: z.string(),
        lectures: z.number().int(),
        concepts: z.number().int(),
        nextDeadline: z.object({ title: z.string(), dueAt: z.string() }).nullable(),
      }),
    ),
  }),
  risk: 'read',
  execute(context) {
    return {
      output: {
        modules: context.services.learning.listModules().map((module) => ({
          id: module.id,
          code: module.code,
          title: module.title,
          lectures: module.counts.lectures,
          concepts: module.counts.concepts,
          nextDeadline: module.nextDeadline
            ? { title: module.nextDeadline.title, dueAt: module.nextDeadline.dueAt }
            : null,
        })),
      },
    };
  },
  describe: (_input, output) =>
    output ? `Listed ${count(output.modules.length, 'module')}` : 'Listing modules',
});

export const getModule = defineTool({
  name: 'get_module',
  category: 'learning',
  description: 'One module: its lectures, assessments (weights and deadlines) and concepts.',
  input: z.object({ id: ModuleId }),
  output: z.object({
    id: z.string(),
    code: z.string(),
    title: z.string(),
    lectures: z.array(z.object({ id: z.string(), key: z.string(), title: z.string() })),
    assessments: z.array(
      z.object({
        title: z.string(),
        weight: z.number(),
        dueAt: z.string().nullable(),
        status: z.string(),
      }),
    ),
    concepts: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  risk: 'read',
  execute(context, input) {
    const module = context.services.learning.getModule(input.id);
    return {
      output: {
        id: module.id,
        code: module.code,
        title: module.title,
        lectures: module.lectures.map((lecture) => ({
          id: lecture.id,
          key: lecture.key,
          title: lecture.title,
        })),
        assessments: module.assessments.map((assessment) => ({
          title: assessment.title,
          weight: assessment.weight,
          dueAt: assessment.dueAt,
          status: assessment.status,
        })),
        concepts: module.concepts
          .slice(0, 60)
          .map((concept) => ({ id: concept.id, name: concept.name })),
      },
    };
  },
  describe: (_input, output) =>
    output ? `Looked at the module ${output.code}` : 'Looking at a module',
});

export const getLecture = defineTool({
  name: 'get_lecture',
  category: 'learning',
  description: 'One lecture: its attached sources and notes, and the concepts its notes link to.',
  input: z.object({ id: LectureId }),
  output: z.object({
    id: z.string(),
    key: z.string(),
    title: z.string(),
    module: z.string(),
    sources: z.array(z.object({ id: z.string(), title: z.string(), kind: z.string() })),
    notes: z.array(z.object({ id: z.string(), title: z.string() })),
    concepts: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  risk: 'read',
  execute(context, input) {
    const lecture = context.services.lectures.get(input.id);
    return {
      output: {
        id: lecture.id,
        key: lecture.key,
        title: lecture.title,
        module: lecture.module.code,
        sources: lecture.sources.map((source) => ({
          id: source.id,
          title: source.title,
          kind: source.kind,
        })),
        notes: lecture.notes.map((note) => ({ id: note.id, title: note.title })),
        concepts: lecture.concepts.map((concept) => ({ id: concept.id, name: concept.name })),
      },
    };
  },
  describe: (_input, output) =>
    output ? `Looked at the lecture ${output.key} — ${output.title}` : 'Looking at a lecture',
});

export const getMastery = defineTool({
  name: 'get_mastery',
  category: 'learning',
  description:
    'How well the student knows a concept, or a whole module (or everything) when no concept is given. Mastery is worked out from their card reviews and answers; you cannot change it.',
  input: z.object({ conceptId: ConceptId.optional(), moduleId: ModuleId.optional() }),
  output: z.object({
    scope: z.string(),
    masteryPercent: z.number().nullable(),
    readinessPercent: z.number().nullable(),
    coveragePercent: z.number().nullable(),
    stage: z.string().nullable(),
    evidence: z.string(),
  }),
  risk: 'read',
  execute(context, input) {
    if (input.conceptId) {
      const detail = context.services.mastery.concept(input.conceptId);
      const c = detail.components;
      return {
        output: {
          scope: detail.concept.name,
          masteryPercent: pct(c.mastery),
          readinessPercent: null,
          coveragePercent: pct(c.coverage),
          stage: c.stage,
          evidence: `${c.recallCount} reviewed card faces, ${c.itemsPractised} of ${c.itemsLinked} items practised`,
        },
      };
    }
    const overview = context.services.mastery.overview(input.moduleId);
    const module = input.moduleId
      ? overview.modules.find((entry) => entry.module.id === input.moduleId)
      : undefined;
    const rollUp = module?.rollUp ?? overview.overall;
    return {
      output: {
        scope: module?.module.code ?? 'everything',
        masteryPercent: pct(rollUp.mastery),
        readinessPercent: pct(rollUp.readiness),
        coveragePercent: pct(rollUp.coverage),
        stage: null,
        evidence: `${rollUp.practised} of ${rollUp.total} concepts practised`,
      },
    };
  },
  describe: (_input, output) =>
    output ? `Checked mastery for ${output.scope}` : 'Checking mastery',
});

export const getWeakAreas = defineTool({
  name: 'get_weak_areas',
  category: 'learning',
  description:
    'The concepts the student should work on first, with why (weak, slipping, lapsing, forgotten) and how pressing, given their deadlines.',
  input: z.object({
    moduleId: ModuleId.optional(),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  output: z.object({
    areas: z.array(
      z.object({
        conceptId: z.string(),
        name: z.string(),
        masteryPercent: z.number().nullable(),
        reasons: z.array(z.string()),
      }),
    ),
    withoutMaterial: z.array(z.string()),
  }),
  risk: 'read',
  execute(context, input) {
    const weak = context.services.mastery.weak(input.moduleId, input.limit);
    return {
      output: {
        areas: weak.items.map((item) => ({
          conceptId: item.concept.id,
          name: item.concept.name,
          masteryPercent: pct(item.components.mastery),
          reasons: item.signals.map((signal) => signal.reason),
        })),
        withoutMaterial: weak.noMaterial.slice(0, 20).map((concept) => concept.name),
      },
    };
  },
  describe: (_input, output) =>
    output ? `Found ${count(output.areas.length, 'weak area')}` : 'Finding weak areas',
});

export const getDueReviews = defineTool({
  name: 'get_due_reviews',
  category: 'learning',
  description:
    'How many flashcards are due now (new, learning, to review), with the first few questions.',
  input: z.object({
    moduleId: ModuleId.optional(),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  output: z.object({
    counts: z.object({
      new: z.number().int(),
      learning: z.number().int(),
      review: z.number().int(),
    }),
    next: z.array(z.object({ cardId: z.string(), set: z.string(), front: z.string() })),
  }),
  risk: 'read',
  execute(context, input) {
    const queue = context.services.reviews.queue(
      input.moduleId ? { moduleId: input.moduleId } : {},
      input.limit,
    );
    return {
      output: {
        counts: queue.counts,
        next: queue.items.map((item) => ({
          cardId: item.cardId,
          set: item.setTitle,
          front: item.front,
        })),
      },
    };
  },
  describe: (_input, output) =>
    output
      ? `${count(output.counts.new + output.counts.learning + output.counts.review, 'card')} due`
      : 'Checking due cards',
});

export const getDeadlines = defineTool({
  name: 'get_deadlines',
  category: 'learning',
  description: 'Upcoming assessment deadlines with their weight, soonest first.',
  input: z.object({ days: z.number().int().min(1).max(365).default(30) }),
  output: z.object({
    deadlines: z.array(
      z.object({
        module: z.string(),
        title: z.string(),
        dueAt: z.string(),
        weightPercent: z.number(),
      }),
    ),
  }),
  risk: 'read',
  execute(context, input) {
    return {
      output: {
        deadlines: context.services.learning.deadlines(input.days).map((deadline) => ({
          module: deadline.module.code,
          title: deadline.title,
          dueAt: deadline.dueAt,
          weightPercent: Math.round(deadline.weight * 100),
        })),
      },
    };
  },
  describe: (_input, output) =>
    output ? `Found ${count(output.deadlines.length, 'upcoming deadline')}` : 'Checking deadlines',
});

export const createFlashcards = defineTool({
  name: 'create_flashcards',
  category: 'learning',
  description:
    'Create flashcards in a set (an existing setId, or a new set by title). By default they are drafts that wait in the Inbox for the student to accept; use status "active" only when asked. Write one fact per card with a short answer. A cloze card’s front holds {{c1::gaps}} and its back is empty. Give each card the locator of its source when you know it. More than 20 cards at once needs approval.',
  input: z
    .object({
      setId: CardSetId.optional(),
      setTitle: z.string().trim().min(1).max(200).optional(),
      moduleId: ModuleId.optional(),
      lectureId: LectureId.optional(),
      status: z.enum(['draft', 'active']).default('draft'),
      cards: z
        .array(
          z.object({
            kind: z.enum(['basic', 'cloze']).default('basic'),
            front: z.string().trim().min(1).max(5_000),
            back: z.string().max(5_000).default(''),
            extra: z.string().max(5_000).default(''),
            locator: LocatorSchema.optional(),
            conceptIds: z.array(ConceptId).max(10).default([]),
          }),
        )
        .min(1)
        .max(100),
    })
    .refine((value) => Boolean(value.setId) !== Boolean(value.setTitle), {
      message: 'Give either a setId or a setTitle.',
    }),
  output: z.object({ setId: z.string(), cardIds: z.array(z.string()), status: z.string() }),
  risk: 'write',
  items: (input) => input.cards.length,
  execute(context, input) {
    for (const [index, card] of input.cards.entries()) {
      const problem = cardProblem(card);
      if (problem) throw new ValidationError(`Card ${index + 1}: ${problem}`);
    }
    const { cards } = context.services;
    const created = input.setId
      ? null
      : cards.createSet(
          {
            title: input.setTitle as string,
            ...(input.moduleId ? { moduleId: input.moduleId } : {}),
            ...(input.lectureId ? { lectureId: input.lectureId } : {}),
          },
          'ai',
        );
    const setId = (input.setId ?? created?.id) as Id<'cardSet'>;
    const cardIds: string[] = [];
    try {
      for (const card of input.cards)
        cardIds.push(
          cards.createCard(
            {
              setId,
              kind: card.kind,
              front: card.front,
              back: card.kind === 'cloze' ? '' : card.back,
              extra: card.extra,
              status: input.status,
              ...(card.locator ? { locator: card.locator } : {}),
              conceptIds: card.conceptIds,
            },
            'ai',
          ).id,
        );
    } catch (error) {
      // All or nothing: take back what was made before the failure.
      if (cardIds.length) cards.bulk(cardIds, 'delete');
      if (created) cards.deleteSet(created.id);
      throw error;
    }
    return {
      output: { setId, cardIds, status: input.status },
      undo: { cardIds, createdSetId: created?.id ?? null } as Json,
    };
  },
  describe: (input, output) =>
    output
      ? `Created ${output.cardIds.length} flashcard${output.cardIds.length === 1 ? '' : 's'} ${output.status === 'draft' ? '(drafts, waiting in the Inbox)' : ''}`.trim()
      : `Creating ${count(input.cards.length, 'flashcard')}`,
  undo(context, record) {
    const { cardIds, createdSetId } = record.undo as {
      cardIds: string[];
      createdSetId: string | null;
    };
    context.services.cards.bulk(cardIds, 'delete');
    if (createdSetId) context.services.cards.deleteSet(createdSetId);
  },
});

export const createQuiz = defineTool({
  name: 'create_quiz',
  category: 'learning',
  description:
    'Create a practice quiz from the question bank by scope (module, lectures, topics, concepts, tags), count, kinds and difficulty. It does not start it. Undo deletes it if it has not been attempted.',
  input: z.object({ title: z.string().trim().max(200).optional(), config: QuizConfigSchema }),
  output: z.object({ id: z.string(), title: z.string(), questionCount: z.number().int() }),
  risk: 'write',
  execute(context, input) {
    const quiz = context.services.quizzes.create({
      kind: 'practice',
      config: input.config,
      ...(input.title ? { title: input.title } : {}),
    });
    return {
      output: { id: quiz.id, title: quiz.title, questionCount: quiz.questionCount },
      undo: { quizId: quiz.id } as Json,
    };
  },
  describe: (_input, output) =>
    output
      ? `Created the quiz “${output.title}” (${count(output.questionCount, 'question')})`
      : 'Creating a quiz',
  canUndo(context, record) {
    const quiz = context.services.quizzes
      .list()
      .find((candidate) => candidate.id === (record.undo as { quizId: string }).quizId);
    if (!quiz) return 'The quiz no longer exists.';
    return quiz.attempts === 0 ? null : 'The quiz has been attempted since.';
  },
  undo(context, record) {
    context.services.quizzes.remove((record.undo as { quizId: string }).quizId);
  },
});

export const deleteCards = defineTool({
  name: 'delete_cards',
  category: 'learning',
  description:
    'Delete flashcards by id. Their review history is kept, and undo brings them back with their schedule. Always needs the student’s approval.',
  input: z.object({ cardIds: z.array(CardId).min(1).max(200) }),
  output: z.object({ deleted: z.number().int() }),
  risk: 'destructive',
  items: (input) => input.cardIds.length,
  execute(context, input) {
    const { cards } = context.services;
    const before = input.cardIds.map((id) => {
      const card = cards.getCard(id);
      if (card.status === 'deleted') throw new NotFoundError('That card does not exist.');
      return { id, status: card.status };
    });
    cards.bulk(input.cardIds, 'delete');
    return { output: { deleted: before.length }, undo: { before } as Json };
  },
  describe: (input, output) =>
    output
      ? `Deleted ${count(output.deleted, 'flashcard')}`
      : `Deleting ${count(input.cardIds.length, 'flashcard')}`,
  ask: (_services, input) => `Delete ${count(input.cardIds.length, 'flashcard')}`,
  undo(context, record) {
    const { before } = record.undo as {
      before: { id: string; status: 'draft' | 'active' | 'suspended' }[];
    };
    for (const status of ['draft', 'active', 'suspended'] as const) {
      const ids = before.filter((card) => card.status === status).map((card) => card.id);
      if (ids.length > 0) context.services.cards.restore(ids, status);
    }
  },
});

export const learningTools = [
  listModules,
  getModule,
  getLecture,
  getMastery,
  getWeakAreas,
  getDueReviews,
  getDeadlines,
  createFlashcards,
  createQuiz,
  deleteCards,
];
