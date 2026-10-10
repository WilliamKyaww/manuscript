import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  ConflictError,
  type DataOverview,
  type ExportFile,
  type JobSummary,
  type MaterialiseConceptsResult,
  NotFoundError,
  type RecentVault,
  type RestoreBody,
  RestoreBodySchema,
  VAULT_META_DIR,
  ValidationError,
  type VaultInspection,
  type VaultKind,
} from '@skb/core';
import { z } from 'zod';
import type { RestartControl } from '../../context';
import type { SqlDatabase } from '../../db/sqlite';
import type { JobQueue } from '../../jobs/queue';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import { isProcessAlive, type Vault } from '../../vault/vault';
import type { ConceptsService } from '../concepts/service';
import type { GraphService } from '../graph/service';
import type { NotesModule } from '../notes/module';
import type { SourcesModule } from '../sources/module';
import { conceptFiles } from './concept-files';
import type { Exporter } from './exporter';
import { forget, readRegistry, recordOpened, setActive, vaultKey } from './registry';
import { restoreArchive } from './restorer';

/**
 * Settings → Data (Phase 16): export and restore as background jobs, what the vault holds, the list of
 * vaults on this machine, opening another one, and reading the files again.
 */

export const EXPORT_JOB = 'data.export';
export const RESTORE_JOB = 'data.restore';
export const RESCAN_JOB = 'data.rescan';
/** One of these at a time: they all read or write the whole vault. */
const SUBJECT = 'data';

/** Folders other tools keep inside a vault; they are neither notes nor the student's files. */
const SKIPPED_FOLDERS = new Set(['.obsidian', '.git', '.trash', '.stfolder', VAULT_META_DIR]);
const SCAN_LIMIT = 200_000;

export interface PortabilityDependencies {
  db: SqlDatabase;
  vault: Vault;
  dataDir: string;
  notes: NotesModule;
  concepts: ConceptsService;
  graph: GraphService;
  sources: SourcesModule;
  exporter: Exporter;
  jobs: JobQueue;
  clock: Clock;
  logger: Logger;
  restart: RestartControl | undefined;
  migrationsDir?: string;
}

export type PortabilityService = ReturnType<typeof createPortabilityService>;

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

function countFiles(root: string): { notes: number; files: number } {
  let notes = 0;
  let files = 0;
  const stack = [root];
  while (stack.length > 0 && notes + files < SCAN_LIMIT) {
    const directory = stack.pop() as string;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIPPED_FOLDERS.has(entry.name)) stack.push(path.join(directory, entry.name));
      } else if (entry.isFile()) {
        if (entry.name.toLowerCase().endsWith('.md')) notes += 1;
        else files += 1;
      }
    }
  }
  return { notes, files };
}

function lockedByAnother(folder: string, ownRoot: string): boolean {
  if (vaultKey(folder) === vaultKey(ownRoot)) return false;
  try {
    const holder = JSON.parse(readFileSync(path.join(folder, VAULT_META_DIR, 'lock'), 'utf8')) as {
      pid?: number;
    };
    return typeof holder.pid === 'number' && isProcessAlive(holder.pid);
  } catch {
    return false;
  }
}

export function createPortabilityService(deps: PortabilityDependencies) {
  const { db, vault, dataDir, notes, concepts, graph, sources, exporter, jobs, clock, logger } =
    deps;
  const { restart } = deps;

  const active = () => jobs.activeFor([SUBJECT]).get(SUBJECT) ?? null;
  const requireIdle = () => {
    if (active())
      throw new ConflictError('Something is already being exported, restored or rescanned.');
  };

  const count = (table: string, where = '') =>
    db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table} ${where}`)?.n ?? 0;

  jobs.register({
    kind: EXPORT_JOB,
    payload: z.object({}),
    maxAttempts: 1,
    timeoutMs: 60 * 60_000,
    async run(context) {
      const { name, manifest } = await exporter.run(
        (fraction, message) => context.progress(fraction, message),
        context.signal,
      );
      context.result(
        `${manifest.counts.notes} notes, ${manifest.counts.files - manifest.counts.notes} other files and ` +
          `${manifest.tables.length} tables, in ${name}`,
      );
    },
  });

  jobs.register({
    kind: RESTORE_JOB,
    payload: RestoreBodySchema,
    maxAttempts: 1,
    timeoutMs: 60 * 60_000,
    async run(context) {
      const body = context.payload;
      const archive = /^manuscript-export-[\d-]+\.zip$/u.test(body.archive)
        ? exporter.pathOf(body.archive)
        : path.resolve(body.archive);
      const result = await restoreArchive({
        archive,
        target: body.target,
        currentVault: vault.root,
        knownMigrations: count('_migrations'),
        ...(deps.migrationsDir ? { migrationsDir: deps.migrationsDir } : {}),
        clock,
        progress: (fraction, message) => context.progress(fraction, message),
        signal: context.signal,
      });
      recordOpened(dataDir, result.vaultPath, clock.now());
      logger.info('Restored an export into a new vault', {
        target: result.vaultPath,
        files: result.files,
        rows: result.rows,
        skipped: result.skipped.length,
      });
      context.result(
        `${result.files} files and ${result.rows} rows restored to ${result.vaultPath}` +
          (result.skipped.length > 0 ? `; ${result.skipped.length} left out` : ''),
      );
    },
  });

  jobs.register({
    kind: RESCAN_JOB,
    payload: z.object({}),
    maxAttempts: 1,
    async run(context) {
      context.progress(0.05, 'Reading the notes');
      await notes.indexer.scan();
      context.progress(0.6, 'Reading the originals in Sources');
      await sources.reconciler.reconcileAll();
      context.result('The index matches the files');
    },
  });

  const exportsFolder = () => path.join(dataDir, 'exports');

  function inspect(folder: string): VaultInspection {
    const resolved = path.resolve(folder);
    const current = vaultKey(resolved) === vaultKey(vault.root);
    const locked = lockedByAnother(resolved, vault.root);
    const base = { path: resolved, current, locked };
    if (!existsSync(resolved))
      return {
        ...base,
        kind: 'missing',
        notes: 0,
        files: 0,
        obsidian: false,
        summary: 'This folder does not exist yet. A new, empty vault will be created in it.',
      };
    if (!statSync(resolved).isDirectory())
      throw new ValidationError('That is a file, not a folder.');
    const obsidian = existsSync(path.join(resolved, '.obsidian'));
    // A restored vault has its database before it has ever been opened (which writes vault.json).
    const isManuscript =
      existsSync(path.join(resolved, VAULT_META_DIR, 'vault.json')) ||
      existsSync(path.join(resolved, VAULT_META_DIR, 'skb.db'));
    const { notes: noteCount, files } = countFiles(resolved);
    const empty = readdirSync(resolved).length === 0;
    const kind: VaultKind = isManuscript
      ? 'manuscript'
      : empty
        ? 'empty'
        : obsidian
          ? 'obsidian'
          : 'folder';
    const summaries: Record<VaultKind, string> = {
      manuscript: `A Manuscript vault with ${plural(noteCount, 'note')}. It opens as it is.`,
      obsidian:
        `An Obsidian vault with ${plural(noteCount, 'note')}. Manuscript reads the notes where they are. It adds ` +
        'an id line to the front matter of a note only when it needs to refer to it, and changes nothing ' +
        'else in your notes or in the .obsidian folder. Its own data goes in a hidden .skb folder.',
      folder:
        `A folder with ${plural(noteCount, 'Markdown note')} and ${plural(files, 'other file')}. It is opened in place as a ` +
        'vault; notes are read where they are and only an id line is ever added to them.',
      empty: 'An empty folder. A new vault will be created in it.',
      missing: '',
    };
    return {
      ...base,
      kind,
      notes: noteCount,
      files,
      obsidian,
      summary: locked
        ? `${summaries[kind]} It is open in another copy of Manuscript — close that first.`
        : summaries[kind],
    };
  }

  return {
    overview(): DataOverview {
      const registry = readRegistry(dataDir);
      const recentVaults: RecentVault[] = registry.recent.map((entry) => ({
        path: entry.path,
        name: path.basename(entry.path),
        lastOpenedAt: entry.lastOpenedAt,
        current: vaultKey(entry.path) === vaultKey(vault.root),
        exists: existsSync(entry.path),
      }));
      return {
        vault: { id: vault.id, name: vault.name, path: vault.root },
        counts: {
          notes: count('notes'),
          sources: count('sources', 'WHERE deleted_at IS NULL'),
          concepts: count('concepts'),
          cards: count('cards'),
          questions: count('questions'),
          answers: count('answers'),
        },
        exports: exporter.list() satisfies ExportFile[],
        exportsFolder: exportsFolder(),
        recentVaults,
        job: active(),
        canRestart: restart?.available ?? false,
      };
    },

    startExport(): JobSummary {
      requireIdle();
      return jobs.enqueue(EXPORT_JOB, {}, { subject: SUBJECT, maxAttempts: 1 });
    },

    startRestore(body: RestoreBody): JobSummary {
      requireIdle();
      return jobs.enqueue(RESTORE_JOB, body, { subject: SUBJECT, maxAttempts: 1 });
    },

    startRescan(): JobSummary {
      requireIdle();
      return jobs.enqueue(RESCAN_JOB, {}, { subject: SUBJECT, maxAttempts: 1 });
    },

    /**
     * Writes a note for every concept that has none and makes it the concept's backing note. Concepts
     * that already have one are left as they are, and nothing is ever overwritten.
     */
    materialiseConcepts(folder: string): MaterialiseConceptsResult {
      const wanted = folder.trim().replace(/^\/+|\/+$/gu, '') || 'Concepts';
      const all = new Map(concepts.list().map((concept) => [concept.id as string, concept]));
      const created: MaterialiseConceptsResult['created'] = [];
      let skipped = 0;
      for (const file of conceptFiles(db, concepts, graph, wanted)) {
        const concept = all.get(file.conceptId);
        if (!concept) continue;
        if (concept.noteId !== null) {
          skipped += 1;
          continue;
        }
        const note = notes.notes.create({
          folder: wanted,
          title: concept.name,
          content: file.content,
        });
        concepts.update(concept.id, { noteId: note.id });
        created.push({ conceptId: concept.id, name: concept.name, path: note.path });
      }
      return { folder: wanted, created, skipped };
    },

    deleteExport: (name: string) => exporter.remove(name),
    exportPath: (name: string) => exporter.pathOf(name),

    inspect,

    /** Chooses the vault to open next and restarts into it when something will relaunch the process. */
    switchTo(folder: string): { restarting: boolean; path: string } {
      const inspection = inspect(folder);
      if (inspection.current) throw new ValidationError('That is the vault you are using now.');
      if (inspection.locked)
        throw new ConflictError(
          'That vault is open in another copy of Manuscript. Close it first.',
        );
      const target = inspection.path;
      const data = path.resolve(dataDir);
      if (
        vaultKey(target).startsWith(`${vaultKey(data)}${path.sep}`) ||
        vaultKey(target) === vaultKey(data)
      )
        throw new ValidationError('A vault cannot be inside the application’s data folder.');
      const own = vaultKey(vault.root);
      const other = vaultKey(target);
      if (other.startsWith(`${own}${path.sep}`) || own.startsWith(`${other}${path.sep}`))
        throw new ValidationError('A vault cannot be inside another vault, or contain it.');
      setActive(dataDir, target);
      if (!restart?.available) return { restarting: false, path: target };
      restart.request();
      return { restarting: true, path: target };
    },

    forgetVault(folder: string): void {
      if (vaultKey(folder) === vaultKey(vault.root))
        throw new ValidationError('That is the vault you are using now.');
      if (!readRegistry(dataDir).recent.some((entry) => vaultKey(entry.path) === vaultKey(folder)))
        throw new NotFoundError('That vault is not in the list.');
      forget(dataDir, folder);
    },
  };
}
