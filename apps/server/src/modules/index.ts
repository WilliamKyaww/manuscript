import type { AppContext } from '../context';
import { createJobQueue, type JobQueue } from '../jobs/queue';
import { createJobsRepository } from '../jobs/repository';
import { notifyingAfter } from '../shared/change-events';
import { type AgentModule, createAgentModule } from './agent/index';
import { createAgentRunner } from './agent/runner';
import { type AskService, createAskService } from './ai/ask';
import { createEmbeddingsRepository } from './ai/embeddings/repository';
import { createEmbeddingService, type EmbeddingService } from './ai/embeddings/service';
import { createAiReader } from './ai/reader';
import { createModelRegistry } from './ai/registry';
import { createRetrievalService } from './ai/retrieval';
import { createRetrievalRepository, type RetrievalRepository } from './ai/retrieval-repository';
import { type AiService, createAiService } from './ai/service';
import { createFileConfigStore, createFileSecretStore } from './ai/store';
import { createUsageRepository } from './ai/usage';
import { createCardsRepository } from './cards/repository';
import { createReviewService, type ReviewService } from './cards/reviews';
import { type CardsService, createCardsService } from './cards/service';
import { createChatRepository } from './chat/repository';
import { type ChatService, createChatService } from './chat/service';
import { createConceptMergeRepository } from './concepts/merge-repository';
import { createConceptsRepository } from './concepts/repository';
import { type ConceptsService, createConceptsService } from './concepts/service';
import { createDraftsService, type DraftsService } from './generation/drafts';
import { createExtractor } from './generation/extract';
import { createGradingService, type GradingService } from './generation/grading';
import { createLinkSuggester, type LinkSuggester } from './generation/links';
import { createMaterialService } from './generation/material';
import { createProposalsService, type ProposalsService } from './generation/proposals';
import { createProposalsRepository } from './generation/proposals-repository';
import { createGenerationService, type GenerationService } from './generation/service';
import { createTaskRunners } from './generation/tasks';
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
import { createParsers } from './sources/parsers/index';

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
  readonly ai: AiService;
  readonly embeddings: EmbeddingService;
  readonly ask: AskService;
  readonly retrievalRepo: RetrievalRepository;
  readonly generation: GenerationService;
  readonly drafts: DraftsService;
  readonly proposals: ProposalsService;
  readonly grading: GradingService;
  readonly links: LinkSuggester;
  readonly agent: AgentModule;
  readonly chat: ChatService;
  start(options: { watch: boolean }): Promise<void>;
  close(): Promise<void>;
}

export function createModules(ctx: AppContext): AppModules {
  const settings = createSettingsService(ctx);
  // AI configuration and keys live in the per-user data directory, never in the vault.
  const aiStore = createFileConfigStore(ctx.config.dataDir, ctx.logger);
  const aiSecrets = createFileSecretStore(ctx.config.dataDir, ctx.logger);
  const aiCore = createAiService({
    store: aiStore,
    secrets: aiSecrets,
    registry: createModelRegistry({
      store: aiStore,
      secrets: aiSecrets,
      mock: ctx.config.aiMock,
    }),
    usage: createUsageRepository(ctx.db),
    mock: ctx.config.aiMock,
    clock: ctx.clock,
    ids: ctx.ids,
    logger: ctx.logger,
  });
  const notes = createNotesModule(ctx, settings);
  const jobs = createJobQueue({
    repo: createJobsRepository(ctx.db),
    clock: ctx.clock,
    ids: ctx.ids,
    logger: ctx.logger,
    events: ctx.events,
  });
  // Recordings, images and scanned pages are read by the AI layer when it is set up.
  const sources = createSourcesModule(ctx, notes, jobs, createParsers(createAiReader(aiCore)));
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
      merges: createConceptMergeRepository(ctx.db),
      notesRepo: notes.repo,
      indexer: notes.indexer,
      search,
      clock: ctx.clock,
      ids: ctx.ids,
    }),
    ['create', 'update', 'remove', 'merge', 'unmerge'],
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
  const embeddings = createEmbeddingService({
    repo: createEmbeddingsRepository(ctx.db),
    ai: aiCore,
    queue: jobs,
    events: ctx.events,
    clock: ctx.clock,
    logger: ctx.logger,
  });
  // A new embedding model or provider means embedding again (the job does nothing otherwise).
  const ai = notifyingAfter(
    aiCore,
    ['updatePreferences', 'createProvider', 'updateProvider', 'deleteProvider'],
    () => embeddings.schedule(0),
  );
  const retrievalRepo = createRetrievalRepository(ctx.db);
  const retrieval = createRetrievalService({
    repo: retrievalRepo,
    learning: learningRepo,
    embeddings,
    notes: notes.notes,
    logger: ctx.logger,
  });
  const ask = createAskService({ ai: aiCore, retrieval, logger: ctx.logger });

  // Generation and the Inbox (Phase 11): drafts and proposals enter only when accepted.
  const proposalsRepo = createProposalsRepository(ctx.db);
  const proposals = createProposalsService({
    repo: proposalsRepo,
    concepts,
    relations,
    notes: notes.notes,
    learning: learningRepo,
    events: ctx.events,
    clock: ctx.clock,
    ids: ctx.ids,
    logger: ctx.logger,
  });
  const runners = createTaskRunners({
    ai: aiCore,
    cards,
    questions,
    concepts,
    proposals,
    learning: learningRepo,
  });
  const generation = createGenerationService({
    ai: aiCore,
    material: createMaterialService({
      learning: learningRepo,
      sources: sources.repo,
      notes: notes.notes,
    }),
    jobs,
    runners,
    extractor: createExtractor({
      ai: aiCore,
      proposals,
      relationsRepo,
      runners,
      logger: ctx.logger,
    }),
    events: ctx.events,
    logger: ctx.logger,
  });
  const drafts = createDraftsService({
    cards,
    cardsRepo,
    questions,
    questionsRepo,
    events: ctx.events,
  });
  const grading = createGradingService({ ai: aiCore, attemptsRepo, questions });
  const links = createLinkSuggester({
    notes: notes.notes,
    notesRepo: notes.repo,
    concepts,
    embeddings,
    proposals,
    proposalsRepo,
  });

  // The agent's tool layer wraps the services above (Phase 12).
  const agent = createAgentModule({
    db: ctx.db,
    vault: ctx.vault,
    services: {
      notes,
      search,
      sources,
      learning,
      lectures,
      concepts,
      relations,
      graph,
      cards,
      reviews,
      questions,
      quizzes,
      mastery,
      proposals,
      generation,
      jobs,
      clock: ctx.clock,
      vault: ctx.vault,
    },
    ai: aiCore,
    clock: ctx.clock,
    ids: ctx.ids,
    logger: ctx.logger,
  });

  // Chat (Phase 13) drives the agent runner over persistent threads.
  const chat = createChatService({
    repo: createChatRepository(ctx.db),
    runner: createAgentRunner({ ai: aiCore, registry: agent.registry, logger: ctx.logger }),
    ai: aiCore,
    retrieval,
    clock: ctx.clock,
    ids: ctx.ids,
    logger: ctx.logger,
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
    ai,
    embeddings,
    ask,
    retrievalRepo,
    generation,
    drafts,
    proposals,
    grading,
    links,
    agent,
    chat,
    async start(options) {
      await notes.start(options);
      jobs.start();
      await sources.start();
      // Catch up with anything imported or edited while the app was closed.
      embeddings.schedule(10_000);
    },
    async close() {
      graph.close();
      embeddings.close();
      mastery.close();
      await sources.close();
      await jobs.close();
      await notes.close();
    },
  };
}
