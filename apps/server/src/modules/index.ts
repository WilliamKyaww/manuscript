import type { AppContext } from '../context';
import { createJobQueue, type JobQueue } from '../jobs/queue';
import { createJobsRepository } from '../jobs/repository';
import { createNotesModule, type NotesModule } from './notes/module';
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
  return {
    settings,
    notes,
    jobs,
    sources,
    search,
    async start(options) {
      await notes.start(options);
      jobs.start();
      await sources.start();
    },
    async close() {
      await sources.close();
      await jobs.close();
      await notes.close();
    },
  };
}
