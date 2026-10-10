import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  detectSourceKind,
  EXTENSION_MEDIA_TYPES,
  extensionOf,
  type IdFactory,
  MAX_SOURCE_BYTES,
  SOURCE_EXTENSIONS,
  SOURCE_MEDIA_TYPES,
} from '@skb/core';
import type { JobQueue } from '../../jobs/queue';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import type { Vault } from '../../vault/vault';
import type { AttachmentChange } from '../notes/indexer';
import type { NotesRepository } from '../notes/repository';
import { isSourcePath, moduleCodeOf, readHead, sha256File, titleOf } from './files';
import { enqueueIngest } from './ingest';
import { parserFor } from './parsers/index';
import type { SourcesRepository } from './repository';

/**
 * Keeps the library in step with the files in `Sources/` (task 5.14), whoever changes them:
 *
 * - a file edited in place is re-ingested;
 * - a file that disappears is flagged missing (its sections stay until it is deleted);
 * - a file that appears with the content of a missing source is that source, moved — same id;
 * - a file with the content of a deleted source (restored from the trash) brings it back;
 * - any other supported file dropped into `Sources/` is registered and ingested, so deleting
 *   `.skb/` loses no originals: the library is rebuilt from the folder.
 *
 * Work is serialised; files are hashed by streaming, off the database transaction.
 */

export interface SourceReconciler {
  /** Compares every file under `Sources/` with the library and queues any outstanding ingestion. */
  reconcileAll(): Promise<void>;
  /** Handles one batch of attachment changes from the notes indexer. */
  handle(change: AttachmentChange): void;
  whenIdle(): Promise<void>;
  close(): void;
}

export interface ReconcilerDependencies {
  repo: SourcesRepository;
  notesRepo: NotesRepository;
  queue: JobQueue;
  vault: Vault;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
  notify(ids: string[]): void;
}

type FileState = AttachmentChange['changed'][number];

export function createSourceReconciler(deps: ReconcilerDependencies): SourceReconciler {
  const { repo, notesRepo, queue, vault, clock, ids, logger, notify } = deps;
  let work: Promise<void> = Promise.resolve();
  let closed = false;

  const now = () => clock.now().toISOString();
  const exists = (relative: string) => {
    try {
      return existsSync(vault.resolve(relative));
    } catch {
      return false;
    }
  };

  /** Why a file in Sources cannot be read at all, said so that the library can show it. */
  const unreadable = (size: number): string | null => {
    if (size === 0) return 'This file is empty.';
    if (size > MAX_SOURCE_BYTES)
      return `This file is larger than ${MAX_SOURCE_BYTES / 1024 / 1024} MB, the most that can be read. Split it into parts or export fewer pages.`;
    return null;
  };

  const reconcileFile = async (file: FileState, touched: Set<string>) => {
    const absolute = vault.resolve(file.path);
    let size: number;
    let mtimeMs: number;
    try {
      const stats = statSync(absolute);
      if (!stats.isFile()) return;
      size = stats.size;
      mtimeMs = Math.trunc(stats.mtimeMs);
    } catch {
      return;
    }

    const row = repo.byPath(file.path);
    if (row) {
      const rejected = unreadable(size);
      if (rejected) {
        if (row.status !== 'failed' || row.error !== rejected || row.sizeBytes !== size) {
          repo.update(row.id, { sizeBytes: size, mtimeMs, status: 'failed', error: rejected });
          touched.add(row.id);
        }
        return;
      }
      if (row.sizeBytes === size && row.mtimeMs === mtimeMs) {
        if (row.missingAt) {
          repo.update(row.id, { missingAt: null });
          touched.add(row.id);
        }
        return;
      }
      const sha256 = await sha256File(absolute);
      if (repo.byPath(file.path)?.id !== row.id) return;
      if (sha256 === row.sha256) {
        repo.update(row.id, { sizeBytes: size, mtimeMs, missingAt: null });
      } else {
        repo.update(row.id, {
          sha256,
          sizeBytes: size,
          mtimeMs,
          missingAt: null,
          status: 'pending',
          error: null,
        });
        enqueueIngest(queue, row.id);
      }
      touched.add(row.id);
      return;
    }

    const detectedKind = detectSourceKind(file.path, readHead(absolute), size <= 4096);
    // Files of a kind this application does not read are simply files; they are not part of the
    // library. A file of a supported kind that cannot be read (empty, not what its name says, too
    // large) is listed as failed with the reason, so that it is not quietly missing.
    const extension = extensionOf(file.path);
    const claimed = SOURCE_EXTENSIONS[extension];
    if (!detectedKind.ok && !claimed) return;
    const detected = detectedKind.ok
      ? detectedKind
      : {
          ok: true as const,
          kind: claimed as NonNullable<typeof claimed>,
          mediaType:
            EXTENSION_MEDIA_TYPES[extension] ??
            SOURCE_MEDIA_TYPES[claimed as NonNullable<typeof claimed>] ??
            'application/octet-stream',
        };
    const rejected = unreadable(size) ?? (detectedKind.ok ? null : detectedKind.reason);
    // A file that is the right kind but cannot be read is listed as failed, with the reason, rather than
    // being quietly left out of the library.
    const sha256 = rejected
      ? createHash('sha256').update(`${file.path}:${size}:${mtimeMs}`).digest('hex')
      : await sha256File(absolute);
    if (repo.byPath(file.path)) return;
    const candidates = repo.bySha(sha256);
    const place = {
      path: file.path,
      title: titleOf(file.path),
      moduleCode: moduleCodeOf(file.path),
      sizeBytes: size,
      mtimeMs,
      missingAt: null,
    };

    const moved = candidates.find(
      (candidate) => !candidate.deletedAt && (candidate.missingAt || !exists(candidate.path)),
    );
    if (moved) {
      repo.update(moved.id, place);
      if (moved.status !== 'ready') enqueueIngest(queue, moved.id);
      touched.add(moved.id);
      return;
    }
    // A copy of a source that is still in place is left alone (one source per content).
    if (candidates.some((candidate) => !candidate.deletedAt)) return;
    const deleted = candidates.find((candidate) => candidate.deletedAt);
    if (deleted) {
      repo.update(deleted.id, { ...place, deletedAt: null, status: 'pending', error: null });
      enqueueIngest(queue, deleted.id);
      touched.add(deleted.id);
      return;
    }

    const id = ids('source');
    repo.insert({
      id,
      kind: detected.kind,
      title: place.title,
      path: file.path,
      originalName: path.posix.basename(file.path),
      mediaType: detected.mediaType,
      sha256,
      sizeBytes: size,
      mtimeMs,
      pageCount: null,
      status: rejected ? 'failed' : 'pending',
      error: rejected,
      moduleCode: place.moduleCode,
      metadataJson: '{}',
      warningsJson: '[]',
      parserVersion: null,
      ingestedSha256: null,
      createdAt: now(),
      ingestedAt: null,
    });
    if (!rejected) enqueueIngest(queue, id);
    touched.add(id);
    logger.info('Added a file found in the Sources folder to the library', { path: file.path });
  };

  const process = async (changed: readonly FileState[], removed: readonly string[]) => {
    const touched = new Set<string>();
    for (const removedPath of removed) {
      if (!isSourcePath(removedPath)) continue;
      const row = repo.byPath(removedPath);
      if (row && !row.missingAt && !exists(removedPath)) {
        repo.update(row.id, { missingAt: now() });
        touched.add(row.id);
      }
    }
    for (const file of changed) {
      if (closed) break;
      if (!isSourcePath(file.path)) continue;
      try {
        await reconcileFile(file, touched);
      } catch (error) {
        logger.warn('Could not match a file in the Sources folder with the library', {
          path: file.path,
          error,
        });
      }
    }
    if (touched.size > 0) notify([...touched]);
  };

  const enqueue = (task: () => Promise<void>) => {
    work = work
      .then(task)
      .catch((error) => logger.error('Source reconciliation failed', { error }));
    return work;
  };

  return {
    reconcileAll() {
      return enqueue(async () => {
        const files = notesRepo
          .allAttachments()
          .filter((attachment) => isSourcePath(attachment.path))
          .map(({ path: filePath, sizeBytes, mtimeMs }) => ({
            path: filePath,
            sizeBytes,
            mtimeMs,
          }));
        const gone = repo
          .live()
          .filter((row) => !exists(row.path))
          .map((row) => row.path);
        await process(files, gone);
        // Ingestion that never finished, and sources parsed by an older parser version.
        const queued: string[] = [];
        for (const row of repo.live()) {
          if (row.missingAt) continue;
          const parser = parserFor(row.kind);
          const outdated =
            row.status === 'ready' && parser !== null && row.parserVersion !== parser.version;
          const unfinished = row.status === 'pending' || row.status === 'processing';
          if ((outdated || unfinished) && !queue.activeFor([row.id]).has(row.id)) {
            enqueueIngest(queue, row.id);
            queued.push(row.id);
          }
        }
        if (queued.length > 0)
          logger.info('Queued sources for (re-)ingestion', { sources: queued.length });
      });
    },

    handle(change) {
      if (closed) return;
      const relevant =
        change.changed.some((file) => isSourcePath(file.path)) ||
        change.removed.some((removedPath) => isSourcePath(removedPath));
      if (relevant) void enqueue(() => process(change.changed, change.removed));
    },

    async whenIdle() {
      let current: Promise<void>;
      do {
        current = work;
        await current;
      } while (current !== work);
    },

    close() {
      closed = true;
    },
  };
}
