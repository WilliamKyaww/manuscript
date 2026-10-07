import type { AppContext } from '../context';
import { createNotesModule, type NotesModule } from './notes/module';
import { createSettingsService, type SettingsService } from './settings/service';

/**
 * Domain modules built from the application context (architecture.md §3). Routes receive these;
 * `start` runs background work (index reconciliation, file watching) after the server is listening.
 */
export interface AppModules {
  readonly settings: SettingsService;
  readonly notes: NotesModule;
  start(options: { watch: boolean }): Promise<void>;
  close(): Promise<void>;
}

export function createModules(ctx: AppContext): AppModules {
  const settings = createSettingsService(ctx);
  const notes = createNotesModule(ctx, settings);
  return {
    settings,
    notes,
    start: (options) => notes.start(options),
    close: () => notes.close(),
  };
}
