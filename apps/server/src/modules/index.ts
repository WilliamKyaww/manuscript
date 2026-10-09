import type { AppContext } from '../context';
import { createJobQueue, type JobQueue } from '../jobs/queue';
import { createJobsRepository } from '../jobs/repository';
import { notifyingAfter } from '../shared/change-events';
import { createCardsRepository } from './cards/repository';
import { createReviewService, type ReviewService } from './cards/reviews';
import { type CardsService, createCardsService } from './cards/service';
import { createConceptsRepository } from './concepts/repository';
import { type ConceptsService, createConceptsService } from './concepts/service';
import { createGraphRepository } from './graph/graph-repository';
import { createRelationsService, type RelationsService } from './graph/relations';
import { createRelationsRepository } from './graph/relations-repository';
import { createGraphService, type GraphService } from './graph/service';
import { createLecturesService, type LecturesService } from './learning/lectures';
import { createLearningRepository } from './learning/repository';
import { createLearningService, type LearningService } from './learning/service';
import { createMasteryRepository } from './mastery/repository';
import { createMasteryService, type MasteryService } from './mastery/service';
import { createNotesModule, type NotesModule } from './notes/module';
import { type AttemptsService, createAttemptsService } from './practice/attempts';
import { createAttemptsRepository } from './practice/attempts-repository';
import { createLearnService, type LearnService } from './practice/learn';
import { createQuestionsService, type QuestionsService } from './practice/questions';
import { createQuestionsRepository } from './practice/questions-repository';
import { createQuizzesService, type QuizzesService } from './practice/quizzes';
import { createSearchRepository } from './search/repository';
import { createSearchService, type SearchService } from './search/service';
import { createSettingsService, type SettingsService } from './settings/service';
import { createSourcesModule, type SourcesModule } from './sources/module';

/**
 * Domain modules built from the application context (architecture.md §3). Routes receive these;
 * `start` runs background work (index reconciliation, file watching, jobs) after the server is
 * listening.
 */
export interface AppModules {
  readonly settings: SettingsService;
  readonly notes: NotesModule;
  readonly jobs: JobQueue;
  readonly sources: SourcesModule;
  readonly search: SearchService;
  readonly learning: LearningService;
  readonly lectures: LecturesService;
  readonly concepts: ConceptsService;
  readonly relations: RelationsService;
  readonly graph: GraphService;
  readonly cards: CardsService;
  readonly reviews: ReviewService;
  readonly questions: QuestionsService;
  readonly quizzes: QuizzesService;
  readonly attempts: AttemptsService;
  readonly learn: LearnService;
  readonly mastery: MasteryService;
  start(options: { watch: boolean }): Promise<void>;
  close(): Promise<void>;
}

export function createModules(ctx: AppContext): AppModules {
  const settings = createSettingsService(ctx);
  const notes = createNotesModule(ctx, settings);
  const jobs = createJobQueue({
    repo: createJobsRepository(ctx.db),
    clock: ctx.clock,
    ids: ctx.ids,
    logger: ctx.logger,
    events: ctx.events,
  });
  const sources = createSourcesModule(ctx, notes, jobs);
  const search = createSearchService({
    repo: createSearchRepository(ctx.db),
    indexer: notes.indexer,
    clock: ctx.clock,
    logger: ctx.logger,
  });
  // Data held only in the database announces its changes, so the graph and other tabs can follow.
  const changed = (area: 'course' | 'concepts') => () =>
    ctx.events.publish({ type: 'data.changed', area });
  const learningRepo = createLearningRepository(ctx.db);
  const learning = notifyingAfter(
    createLearningService({ repo: learningRepo, clock: ctx.clock, ids: ctx.ids }),
    [
      'createCourse',
      'updateCourse',
      'deleteCourse',
      'createModule',
      'updateModule',
      'deleteModule',
      'createTopic',
      'updateTopic',
      'deleteTopic',
      'createAssessment',
      'updateAssessment',
      'deleteAssessment',
    ],
    changed('course'),
  );
  const lectures = notifyingAfter(
    createLecturesService({
      repo: learningRepo,
      learning,
      notes: notes.notes,
      sources: sources.repo,
      clock: ctx.clock,
      ids: ctx.ids,
    }),
    ['create', 'update', 'delete', 'attachSource', 'detachSource', 'attachNote', 'detachNote'],
    changed('course'),
  );
  const concepts = notifyingAfter(
    createConceptsService({
      repo: createConceptsRepository(ctx.db),
      notesRepo: notes.repo,
      indexer: notes.indexer,
      search,
      clock: ctx.clock,
      ids: ctx.ids,
    }),
    ['create', 'update', 'remove'],
    changed('concepts'),
  );
  const relationsRepo = createRelationsRepository(ctx.db);
  const relations = createRelationsService({
    repo: relationsRepo,
    indexer: notes.indexer,
    events: ctx.events,
    clock: ctx.clock,
    ids: ctx.ids,
  });
  const graph = createGraphService({
    repo: createGraphRepository(ctx.db, relationsRepo),
    events: ctx.events,
  });
  // Before the first scan, so links to concepts resolve as notes are indexed.
  concepts.sync();
  // Mastery is computed from cards, answers and links: writes to them make it stale.
  const mastery = createMasteryService({
    repo: createMasteryRepository(ctx.db),
    settings,
    events: ctx.events,
    clock: ctx.clock,
  });
  const stale = () => mastery.invalidate();
  const cardsRepo = createCardsRepository(ctx.db);
  const cards = notifyingAfter(
    createCardsService({
      repo: cardsRepo,
      learning: learningRepo,
      settings,
      clock: ctx.clock,
      ids: ctx.ids,
    }),
    ['createCard', 'updateCard', 'deleteCard', 'bulk', 'deleteSet', 'importSet'],
    stale,
  );
  const reviews = notifyingAfter(
    createReviewService({
      repo: cardsRepo,
      cards,
      settings,
      clock: ctx.clock,
      ids: ctx.ids,
    }),
    ['rate', 'undo'],
    stale,
  );
  const questionsRepo = createQuestionsRepository(ctx.db);
  const attemptsRepo = createAttemptsRepository(ctx.db);
  const questions = notifyingAfter(
    createQuestionsService({
      repo: questionsRepo,
      learning: learningRepo,
      clock: ctx.clock,
      ids: ctx.ids,
    }),
    ['create', 'update', 'remove'],
    stale,
  );
  const quizzes = createQuizzesService({
    questionsRepo,
    repo: attemptsRepo,
    questions,
    learning: learningRepo,
    clock: ctx.clock,
    ids: ctx.ids,
  });
  const attempts = notifyingAfter(
    createAttemptsService({
      repo: attemptsRepo,
      questionsRepo,
      questions,
      quizzes,
      clock: ctx.clock,
      ids: ctx.ids,
    }),
    ['answer', 'submit', 'grade'],
    stale,
  );
  const learn = createLearnService({
    repo: attemptsRepo,
    questionsRepo,
    questions,
    attempts,
    mastery,
    learning: learningRepo,
    clock: ctx.clock,
    ids: ctx.ids,
  });
  return {
    settings,
    notes,
    jobs,
    sources,
    search,
    learning,
    lectures,
    concepts,
    relations,
    graph,
    cards,
    reviews,
    questions,
    quizzes,
    attempts,
    learn,
    mastery,
    async start(options) {
      await notes.start(options);
      jobs.start();
      await sources.start();
    },
    async close() {
      graph.close();
      mastery.close();
      await sources.close();
      await jobs.close();
      await notes.close();
    },
  };
}
