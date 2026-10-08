import type { AppContext } from '../context';
import { createNotesModule, type NotesModule } from './notes/module';
import { createSearchRepository } from './search/repository';
import { createSearchService, type SearchService } from './search/service';
import { createSettingsService, type SettingsService } from './settings/service';

/**
 * Domain modules built from the application context (architecture.md §3). Routes receive these;
 * `start` runs background work (index reconciliation, file watching) after the server is listening.
 */
export interface AppModules {
  readonly settings: SettingsService;
  readonly notes: NotesModule;
  readonly search: SearchService;
  start(options: { watch: boolean }): Promise<void>;
  close(): Promise<void>;
}

export function createModules(ctx: AppContext): AppModules {
  const settings = createSettingsService(ctx);
  const notes = createNotesModule(ctx, settings);
  const search = createSearchService({
    repo: createSearchRepository(ctx.db),
    indexer: notes.indexer,
    clock: ctx.clock,
    logger: ctx.logger,
  });
  return {
    settings,
    notes,
    search,
    start: (options) => notes.start(options),
    close: () => notes.close(),
  };
}
