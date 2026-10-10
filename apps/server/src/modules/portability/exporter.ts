import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  EXPORT_FORMAT,
  type ExportManifest,
  graphEndpoint,
  NotFoundError,
  toGraphMl,
  toNodeLinkJson,
  VAULT_META_DIR,
  ValidationError,
} from '@skb/core';
import { analyseNote } from '@skb/core/markdown';
import type { SqlDatabase } from '../../db/sqlite';
import type { Clock } from '../../shared/clock';
import type { Vault } from '../../vault/vault';
import type { CardsService } from '../cards/service';
import type { ConceptsService } from '../concepts/service';
import type { GraphService } from '../graph/service';
import { withPersistedId } from '../notes/identity';
import { decodeNote } from '../notes/indexer';
import type { NotesRepository } from '../notes/repository';
import type { QuestionsService } from '../practice/questions';
import type { QuizzesService } from '../practice/quizzes';
import { conceptFiles } from './concept-files';
import { createSchemaDocument, readmeText } from './documents';
import { CANONICAL_TABLES, readTable } from './tables';
import { createZipWriter } from './zip';

/**
 * The full export (tasks 16.01, 16.04, 16.05): one zip with the vault's files exactly as they are (notes
 * gain an `id` line only in the copy, where it was not written yet, so links by id survive a restore),
 * a JSON file for every table that is the student's own, a document describing them, flashcards as Anki
 * text, the graph as JSON and GraphML, and the question bank and quizzes in readable formats. The
 * archive is ordered so that what a restore needs first (the manifest, the data) comes before the files.
 */

export interface ExporterDependencies {
  db: SqlDatabase;
  vault: Vault;
  notesRepo: NotesRepository;
  graph: GraphService;
  cards: CardsService;
  concepts: ConceptsService;
  questions: QuestionsService;
  quizzes: QuizzesService;
  clock: Clock;
  version: string;
  /** Where finished archives are kept (the per-user data directory, never the vault). */
  exportsDir: string;
}

export type Exporter = ReturnType<typeof createExporter>;

const safeName = (text: string, fallback: string) =>
  text
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .trim()
    .slice(0, 80) || fallback;

/** Every file under `root`, vault-relative, without the app's own folder. */
function walk(root: string, relative = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (relative === '' && entry.name === VAULT_META_DIR) continue;
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(root, next));
    else if (entry.isFile()) files.push(next);
  }
  return files.sort();
}

export function createExporter(deps: ExporterDependencies) {
  const {
    db,
    vault,
    notesRepo,
    graph,
    cards,
    concepts,
    questions,
    quizzes,
    clock,
    version,
    exportsDir,
  } = deps;

  async function run(
    progress: (fraction: number, message: string) => void,
    signal: AbortSignal,
  ): Promise<{ name: string; manifest: ExportManifest }> {
    const at = clock.now();
    const stamp = at.toISOString().replace(/[:T]/gu, '-').slice(0, 19);
    const name = `manuscript-export-${stamp}.zip`;
    const temporary = path.join(exportsDir, `${name}.partial`);
    mkdirSync(exportsDir, { recursive: true });
    const writer = createZipWriter(temporary);
    const root = `manuscript-export-${stamp}`;
    const inside = (entry: string) => `${root}/${entry}`;

    let manifest: ExportManifest;
    try {
      progress(0.02, 'Counting what there is');
      const files = walk(vault.root);
      const tables = CANONICAL_TABLES.map((table) => ({
        name: table.name,
        rows: readTable(db, table.name),
      }));
      const notes = notesRepo.all();
      manifest = {
        format: EXPORT_FORMAT,
        app: 'manuscript',
        appVersion: version,
        exportedAt: at.toISOString(),
        vault: { id: vault.id, name: vault.name },
        migrations: db.get<{ n: number }>('SELECT count(*) AS n FROM _migrations')?.n ?? 0,
        counts: {
          files: files.length,
          notes: notes.length,
          tables: Object.fromEntries(tables.map((table) => [table.name, table.rows.length])),
        },
        tables: tables.map((table) => table.name),
      };

      await writer.addData(inside('manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      await writer.addData(inside('README.md'), readmeText(manifest));
      await writer.addData(inside('docs/schema.md'), createSchemaDocument(db));

      progress(0.08, 'Writing your data');
      for (const table of tables)
        await writer.addData(
          inside(`data/${table.name}.json`),
          `${JSON.stringify(table.rows, null, 1)}\n`,
        );
      await writer.addData(
        inside('data/note-ids.json'),
        `${JSON.stringify(
          notes
            .map((note) => ({ id: note.id, path: note.path }))
            .sort((a, b) => a.path.localeCompare(b.path)),
          null,
          1,
        )}\n`,
      );

      progress(0.15, 'Writing flashcards, questions and the graph');
      for (const set of cards.listSets()) {
        const anki = cards.exportSet(set.id);
        await writer.addData(
          inside(`anki/${safeName(set.title, 'cards')}-${set.id.slice(-6)}.txt`),
          anki.content,
        );
      }
      const bank = questions.list({});
      await writer.addData(
        inside('questions/question-bank.json'),
        `${JSON.stringify(bank, null, 1)}\n`,
      );
      for (const quiz of quizzes.list()) {
        const exported = quizzes.exportMarkdown(quiz.id);
        await writer.addData(
          inside(`questions/quizzes/${safeName(quiz.title, 'quiz')}-${quiz.id.slice(-6)}.md`),
          exported.content,
        );
      }
      const everything = graph.graph(
        graphEndpoint.schemas.query.parse({
          types: ['concept', 'note', 'source', 'lecture', 'module', 'topic', 'code'],
          status: ['accepted', 'proposed'],
          isolated: 'true',
          limit: 20_000,
        }),
      );
      await writer.addData(
        inside('graph/graph.json'),
        toNodeLinkJson(everything, { exportedAt: at.toISOString() }),
      );
      await writer.addData(inside('graph/graph.graphml'), toGraphMl(everything));

      // Concepts as notes: the same knowledge written the way the student's own notes are.
      for (const file of conceptFiles(db, concepts, graph, 'concepts'))
        await writer.addData(inside(file.path), file.content);

      // The files: notes first (with their ids), then everything else, as they are.
      const byPath = new Map(notes.map((note) => [note.path, note]));
      // What each file is like in the archive, so a restore can check that it is whole and put back
      // the modification times (which the source library uses to tell what changed).
      const listed: { path: string; sizeBytes: number; mtimeMs: number }[] = [];
      for (const [index, relative] of files.entries()) {
        if (signal.aborted) throw new Error('The export was cancelled.');
        progress(0.2 + 0.78 * (index / Math.max(1, files.length)), `Adding ${relative}`);
        const absolute = path.join(vault.root, ...relative.split('/'));
        const stats = statSync(absolute);
        const note = byPath.get(relative);
        if (note && !note.idPersisted) {
          // Only text that decodes exactly is touched; anything else is copied byte for byte.
          const decoded = decodeNote(readFileSync(absolute));
          const updated = decoded.valid
            ? withPersistedId(decoded.text, analyseNote(decoded.text).frontmatter, note.id)
            : null;
          if (updated !== null) {
            await writer.addData(inside(`vault/${relative}`), updated);
            listed.push({
              path: relative,
              sizeBytes: Buffer.byteLength(updated),
              mtimeMs: Math.trunc(stats.mtimeMs),
            });
            continue;
          }
        }
        await writer.addFile(inside(`vault/${relative}`), absolute, stats.mtime);
        listed.push({ path: relative, sizeBytes: stats.size, mtimeMs: Math.trunc(stats.mtimeMs) });
      }
      await writer.addData(
        inside('data/files.json'),
        `${JSON.stringify(listed, null, 1)}
`,
      );
      progress(0.99, 'Finishing the archive');
      await writer.finish();
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
    renameSync(temporary, path.join(exportsDir, name));
    return { name, manifest };
  }

  return {
    run,

    /** The finished archives, newest first. */
    list(): { name: string; sizeBytes: number; createdAt: string }[] {
      mkdirSync(exportsDir, { recursive: true });
      return readdirSync(exportsDir)
        .filter((entry) => entry.endsWith('.zip'))
        .map((entry) => {
          const stats = statSync(path.join(exportsDir, entry));
          return { name: entry, sizeBytes: stats.size, createdAt: stats.mtime.toISOString() };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.name.localeCompare(a.name));
    },

    /** The path of an archive by name; only names this exporter made are accepted. */
    pathOf(name: string): string {
      if (!/^manuscript-export-[\d-]+\.zip$/u.test(name))
        throw new ValidationError('That is not the name of an export.');
      const file = path.join(exportsDir, name);
      try {
        statSync(file);
      } catch {
        throw new NotFoundError('That export does not exist (any more).');
      }
      return file;
    },

    remove(name: string): void {
      rmSync(this.pathOf(name), { force: true });
    },
  };
}
