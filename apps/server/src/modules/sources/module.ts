import type { SourceParser } from '@skb/core';
import type { AppContext } from '../../context';
import type { JobQueue } from '../../jobs/queue';
import type { NotesModule } from '../notes/module';
import { createIngestHandler } from './ingest';
import { createSourceReconciler, type SourceReconciler } from './reconcile';
import { createSourcesRepository, type SourcesRepository } from './repository';
import { createSourcesService, type SourcesService } from './service';

/** The source library: service, ingestion job and file reconciliation, with their lifecycle. */
export interface SourcesModule {
  readonly repo: SourcesRepository;
  readonly service: SourcesService;
  readonly reconciler: SourceReconciler;
  /** Matches the library with `Sources/` (after the notes index is up to date). */
  start(): Promise<void>;
  close(): Promise<void>;
}

export function createSourcesModule(
  ctx: AppContext,
  notes: NotesModule,
  queue: JobQueue,
  parsers?: readonly SourceParser[],
): SourcesModule {
  const repo = createSourcesRepository(ctx.db);
  const notify = (ids: string[]) => ctx.events.publish({ type: 'sources.changed', ids });
  queue.register(
    createIngestHandler({
      repo,
      vault: ctx.vault,
      clock: ctx.clock,
      ...(parsers ? { parsers } : {}),
      notify,
    }),
  );
  const reconciler = createSourceReconciler({
    repo,
    notesRepo: notes.repo,
    queue,
    vault: ctx.vault,
    clock: ctx.clock,
    ids: ctx.ids,
    logger: ctx.logger,
    notify,
  });
  const unsubscribe = notes.indexer.onAttachmentsChanged((change) => reconciler.handle(change));
  const service = createSourcesService({
    repo,
    queue,
    vault: ctx.vault,
    indexer: notes.indexer,
    entries: notes.entries,
    clock: ctx.clock,
    ids: ctx.ids,
    notify,
  });
  return {
    repo,
    service,
    reconciler,
    start: () => reconciler.reconcileAll(),
    async close() {
      unsubscribe();
      reconciler.close();
      await reconciler.whenIdle();
    },
  };
}
