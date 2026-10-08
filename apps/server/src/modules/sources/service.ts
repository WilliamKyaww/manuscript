import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  ConflictError,
  DETECT_HEAD_BYTES,
  detectSourceKind,
  type IdFactory,
  type ImportResult,
  type JobSummary,
  MAX_SOURCE_BYTES,
  NotFoundError,
  type SourceSection,
  type SourceSummary,
  SourceWarningSchema,
  VAULT_META_DIR,
  ValidationError,
} from '@skb/core';
import { z } from 'zod';
import type { JobQueue } from '../../jobs/queue';
import type { Clock } from '../../shared/clock';
import { writeFileAtomic } from '../../vault/atomic';
import { isWithin } from '../../vault/paths';
import type { Vault } from '../../vault/vault';
import type { EntriesService } from '../notes/entries';
import type { NoteIndexer } from '../notes/indexer';
import { isSourcePath, safeSourceName, sha256Bytes, sourceFolder, titleOf } from './files';
import { enqueueIngest } from './ingest';
import type { SourceListRow, SourceRow, SourcesRepository } from './repository';

/**
 * The source library (tasks 5.04 and 5.15): imports copy the original byte for byte into
 * `Sources/<module | Inbox>/`, de-duplicated by SHA-256, and queue ingestion; deleting moves the
 * original to the trash (restoring it brings the source back with the same id, see reconcile.ts).
 */

export interface ImportFileInput {
  fileName: string;
  bytes: Uint8Array;
  moduleCode?: string | null;
}

export interface SourcesService {
  list(): SourceSummary[];
  get(id: string): SourceSummary & { metadata: Record<string, string | number | boolean | null> };
  sections(id: string): SourceSection[];
  importFile(input: ImportFileInput): ImportResult;
  /** Imports a file the server can read (an absolute path, e.g. from the desktop file picker). */
  importPath(absolutePath: string, moduleCode?: string | null): ImportResult;
  retry(id: string): SourceSummary;
  remove(id: string): { trashId: string | null };
}

export interface SourcesServiceDependencies {
  repo: SourcesRepository;
  queue: JobQueue;
  vault: Vault;
  indexer: NoteIndexer;
  entries: EntriesService;
  clock: Clock;
  ids: IdFactory;
  notify(ids: string[]): void;
}

const WarningsSchema = z.array(SourceWarningSchema);
const MetadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

function parseJson<T>(schema: z.ZodType<T>, json: string, fallback: T): T {
  try {
    const result = schema.safeParse(JSON.parse(json));
    return result.success ? result.data : fallback;
  } catch {
    return fallback;
  }
}

const MB = 1024 * 1024;

export function createSourcesService(deps: SourcesServiceDependencies): SourcesService {
  const { repo, queue, vault, indexer, entries, clock, ids, notify } = deps;

  const summary = (
    row: SourceRow,
    counts: { sectionCount: number; chunkCount: number },
    job: JobSummary | null,
  ): SourceSummary => ({
    id: row.id as SourceSummary['id'],
    kind: row.kind,
    title: row.title,
    path: row.path,
    originalName: row.originalName,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    pageCount: row.pageCount,
    status: row.status,
    error: row.error,
    moduleCode: row.moduleCode,
    sectionCount: counts.sectionCount,
    chunkCount: counts.chunkCount,
    warnings: parseJson(WarningsSchema, row.warningsJson, []),
    missing: row.missingAt !== null,
    createdAt: row.createdAt,
    ingestedAt: row.ingestedAt,
    job,
  });

  const summaryOf = (row: SourceRow) =>
    summary(row, repo.counts(row.id), queue.activeFor([row.id]).get(row.id) ?? null);

  const live = (id: string): SourceRow => {
    const row = repo.byId(id);
    if (!row || row.deletedAt) throw new NotFoundError('That source is not in the library.');
    return row;
  };

  const uniquePath = (folder: string, base: string, extension: string) => {
    for (let attempt = 0; ; attempt += 1) {
      const candidate = `${folder}/${attempt === 0 ? base : `${base} ${attempt}`}.${extension}`;
      if (!existsSync(vault.resolve(candidate)) && !repo.byPath(candidate)) return candidate;
    }
  };

  const importFile = ({ fileName, bytes, moduleCode = null }: ImportFileInput): ImportResult => {
    if (bytes.length > MAX_SOURCE_BYTES) {
      throw new ValidationError(`Files can be at most ${MAX_SOURCE_BYTES / MB} MB.`);
    }
    const detected = detectSourceKind(
      fileName,
      bytes.subarray(0, DETECT_HEAD_BYTES),
      bytes.length <= DETECT_HEAD_BYTES,
    );
    if (!detected.ok) throw new ValidationError(detected.reason);

    const sha256 = sha256Bytes(bytes);
    const known = repo.bySha(sha256).filter((row) => !row.deletedAt);
    const existing = known.find((row) => !row.missingAt);
    if (existing) return { source: summaryOf(existing), duplicate: true };

    const { base, extension } = safeSourceName(fileName);
    const folder = sourceFolder(moduleCode);
    const relative = uniquePath(folder, base, extension);
    const absolute = vault.resolve(relative);
    writeFileAtomic(absolute, bytes);
    const mtimeMs = Math.trunc(statSync(absolute).mtimeMs);

    // The same file as a source whose original went missing: it comes back, with its id.
    const missing = known[0];
    if (missing) {
      repo.update(missing.id, {
        path: relative,
        title: titleOf(relative),
        moduleCode,
        mtimeMs,
        missingAt: null,
      });
      enqueueIngest(queue, missing.id);
      indexer.apply({ changed: [relative], addedFolders: [folder] }, 'app');
      notify([missing.id]);
      return { source: summaryOf(live(missing.id)), duplicate: false };
    }

    const id = ids('source');
    try {
      repo.insert({
        id,
        kind: detected.kind,
        title: titleOf(relative),
        path: relative,
        originalName: path.posix.basename(fileName.replace(/\\/g, '/')),
        mediaType: detected.mediaType,
        sha256,
        sizeBytes: bytes.length,
        mtimeMs,
        pageCount: null,
        status: 'pending',
        error: null,
        moduleCode,
        metadataJson: '{}',
        warningsJson: '[]',
        parserVersion: null,
        ingestedSha256: null,
        createdAt: clock.now().toISOString(),
        ingestedAt: null,
      });
    } catch (error) {
      rmSync(absolute, { force: true });
      throw error;
    }
    enqueueIngest(queue, id);
    // Registers the file as an attachment now rather than when the watcher notices it.
    indexer.apply({ changed: [relative], addedFolders: [folder] }, 'app');
    notify([id]);
    return { source: summaryOf(live(id)), duplicate: false };
  };

  return {
    list() {
      const rows: SourceListRow[] = repo.list();
      const jobs = queue.activeFor(rows.map((row) => row.id));
      return rows.map((row) => summary(row, row, jobs.get(row.id) ?? null));
    },

    get(id) {
      const row = live(id);
      return { ...summaryOf(row), metadata: parseJson(MetadataSchema, row.metadataJson, {}) };
    },

    sections(id) {
      live(id);
      return repo.sections(id);
    },

    importFile,

    importPath(absolutePath, moduleCode = null) {
      if (!path.isAbsolute(absolutePath))
        throw new ValidationError('Give the full path of the file.');
      const resolved = path.resolve(absolutePath);
      if (isWithin(vault.paths.meta, resolved)) {
        throw new ValidationError(`Files inside ${VAULT_META_DIR}/ cannot be imported.`);
      }
      let size: number;
      try {
        const stats = statSync(resolved);
        if (!stats.isFile()) throw new ValidationError('That path is not a file.');
        size = stats.size;
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new NotFoundError('That file does not exist or cannot be read.');
      }
      if (size > MAX_SOURCE_BYTES) {
        throw new ValidationError(`Files can be at most ${MAX_SOURCE_BYTES / MB} MB.`);
      }
      if (isWithin(vault.root, resolved) && isSourcePath(vault.relative(resolved))) {
        // Already in the library folder: it is registered where it is (see reconcile.ts).
        const row = repo.byPath(vault.relative(resolved));
        if (row) return { source: summaryOf(row), duplicate: true };
      }
      return importFile({
        fileName: path.basename(resolved),
        bytes: readFileSync(resolved),
        moduleCode,
      });
    },

    retry(id) {
      const row = live(id);
      if (row.missingAt) {
        throw new ConflictError(
          `The original file is missing from "${row.path}". Put it back first.`,
        );
      }
      repo.update(id, { status: 'pending', error: null });
      enqueueIngest(queue, id);
      notify([id]);
      return summaryOf(live(id));
    },

    remove(id) {
      const row = live(id);
      // Marked deleted first, so the file disappearing is not mistaken for a move and a cancelled
      // ingestion does not mark it failed.
      repo.update(id, { deletedAt: clock.now().toISOString() });
      let trashId: string | null = null;
      if (!row.missingAt && existsSync(vault.resolve(row.path))) {
        try {
          trashId = entries.trash(row.path).id;
        } catch (error) {
          repo.update(id, { deletedAt: null });
          throw error;
        }
      }
      const active = queue.activeFor([id]).get(id);
      if (active) queue.cancel(active.id);
      repo.clearContent(id);
      notify([id]);
      return { trashId };
    },
  };
}
