import type { AppContext } from '../../context';
import type { SettingsService } from '../settings/service';
import { createEntriesService, type EntriesService } from './entries';
import { createNoteIndexer, type NoteIndexer } from './indexer';
import { createNotesRepository, type NotesRepository } from './repository';
import { createNotesService, type NotesService } from './service';
import { createTrash, type Trash } from './trash';
import { type VaultWatcher, watchVault } from './watcher';

/** The notes module: index, watcher, services and their lifecycle. */
export interface NotesModule {
  readonly repo: NotesRepository;
  readonly indexer: NoteIndexer;
  readonly notes: NotesService;
  readonly entries: EntriesService;
  readonly trash: Trash;
  /** Empties the expired trash, starts watching (optionally) and reconciles the index with the files. */
  start(options: { watch: boolean }): Promise<void>;
  /** The watcher, once started with `watch: true`. */
  watcher(): VaultWatcher | null;
  close(): Promise<void>;
}

export function createNotesModule(ctx: AppContext, settings: SettingsService): NotesModule {
  const repo = createNotesRepository(ctx.db);
  const indexer = createNoteIndexer({ ...ctx, repo, settings });
  const trash = createTrash({
    vault: ctx.vault,
    clock: ctx.clock,
    logger: ctx.logger,
    retentionDays: () => settings.notes().trashRetentionDays,
  });
  const notes = createNotesService({ vault: ctx.vault, repo, indexer, settings, clock: ctx.clock });
  const entries = createEntriesService({ vault: ctx.vault, repo, indexer, settings, trash });
  let watcher: VaultWatcher | null = null;

  return {
    repo,
    indexer,
    notes,
    entries,
    trash,
    async start({ watch }) {
      const purged = trash.purgeExpired();
      if (purged > 0) ctx.logger.info('Emptied expired items from the trash', { purged });
      // Watch first so that nothing changed during the scan is missed; events wait for the scan.
      if (watch) watcher = watchVault({ vault: ctx.vault, indexer, logger: ctx.logger });
      await indexer.scan();
    },
    watcher: () => watcher,
    async close() {
      indexer.stop();
      await watcher?.close();
      watcher = null;
      await indexer.whenIdle();
    },
  };
}
