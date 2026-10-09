/**
 * Notes performance check (task 3.22, budgets from architecture.md §14). Generates a vault of
 * 10,000 interlinked notes and measures indexing, start-up reconciliation, note opening and other
 * operations through the real modules; search is measured again with a library of 10,000 PDF pages
 * (task 5.16), whose sections and chunks are written straight to the database, and the knowledge
 * graph with concepts and relations added (task 7.12). Run with `npm run test:perf` (add a number
 * to change the note count). Exits with code 1 if a budget is exceeded.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  chunkDocument,
  createIdFactory,
  GraphFilterSchema,
  type IdFactory,
  type NormalisedDocument,
} from '@skb/core';
import type { ServerConfig } from '../../src/config/config';
import type { AppContext } from '../../src/context';
import { loadMigrations, migrate } from '../../src/db/migrate';
import { openDatabase } from '../../src/db/sqlite';
import { createModules } from '../../src/modules/index';
import { systemClock } from '../../src/shared/clock';
import { createEventBus } from '../../src/shared/events';
import { silentLogger } from '../../src/shared/logger';
import { openVault } from '../../src/vault/vault';

const NOTE_COUNT = Number(process.argv[2] ?? 10_000);
const FOLDERS = 50;
const BUDGETS = {
  fullIndexMs: 60_000,
  startupMs: 3_000,
  noteOpenP95Ms: 100,
  searchP95Ms: 150,
  // architecture.md §14: a 5,000-node graph payload in under 500 ms of server time.
  graphPayloadMs: 500,
  graphColdMs: 3_000,
  graphAfterEditMs: 1_000,
};

/** Small deterministic PRNG (mulberry32) so every run generates the same vault. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const WORDS =
  'consensus quorum leader election replication log safety liveness partition latency throughput gradient descent loss function regularisation overfitting tensor kernel convolution attention transformer embedding vector index query planner transaction isolation lock deadlock scheduler heuristic search graph traversal'.split(
    ' ',
  );

function noteName(index: number): string {
  return `Note ${String(index).padStart(5, '0')}`;
}

function notePath(index: number): string {
  return `Module ${index % FOLDERS}/${noteName(index)}.md`;
}

function generateVault(root: string): void {
  const next = random(42);
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T;
  for (let folder = 0; folder < FOLDERS; folder += 1)
    mkdirSync(path.join(root, `Module ${folder}`), { recursive: true });
  for (let index = 0; index < NOTE_COUNT; index += 1) {
    const links = Array.from(
      { length: 3 + Math.floor(next() * 6) },
      () => `[[${noteName(Math.floor(next() * NOTE_COUNT))}]]`,
    );
    const paragraphs = Array.from({ length: 4 }, () =>
      Array.from({ length: 60 }, () => pick(WORDS)).join(' '),
    );
    const content = [
      '---',
      `tags: [${pick(WORDS)}, module-${index % FOLDERS}]`,
      `aliases: [Alias ${index}]`,
      `module: COC${200 + (index % FOLDERS)}`,
      '---',
      `# ${noteName(index)}`,
      paragraphs[0],
      `## Links`,
      `Related: ${links.join(', ')} #${pick(WORDS)}`,
      '## Details',
      paragraphs[1],
      '```ts',
      'const example = [[1, 2], [3, 4]];',
      '```',
      paragraphs[2],
      `> [!note] Remember\n> ${paragraphs[3]}`,
      '',
    ].join('\n');
    writeFileSync(path.join(root, ...notePath(index).split('/')), content);
  }
}

const LIBRARY = { sources: 250, pages: 40, wordsPerPage: 250 };

/** A library of lecture PDFs as ingestion would leave it (no files: only search reads it here). */
function seedLibrary(modules: ReturnType<typeof createModules>, ids: IdFactory): number {
  const next = random(99);
  const pick = <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] as T;
  const repo = modules.sources.repo;
  let chunks = 0;
  repo.transaction(() => {
    for (let index = 0; index < LIBRARY.sources; index += 1) {
      const id = ids('source');
      const title = `Lecture ${index}`;
      const moduleCode = `COC${200 + (index % FOLDERS)}`;
      const now = new Date().toISOString();
      repo.insert({
        id,
        kind: 'pdf',
        title,
        path: `Sources/${moduleCode}/${title}.pdf`,
        originalName: `${title}.pdf`,
        mediaType: 'application/pdf',
        sha256: id,
        sizeBytes: 1,
        mtimeMs: 0,
        pageCount: LIBRARY.pages,
        status: 'ready',
        error: null,
        moduleCode,
        metadataJson: '{}',
        warningsJson: '[]',
        parserVersion: 'pdf-1',
        ingestedSha256: id,
        createdAt: now,
        ingestedAt: now,
      });
      const document: NormalisedDocument = {
        title: null,
        pageCount: LIBRARY.pages,
        warnings: [],
        metadata: {},
        sections: Array.from({ length: LIBRARY.pages }, (_, page) => ({
          kind: 'page' as const,
          label: `p. ${page + 1}`,
          text: Array.from({ length: LIBRARY.wordsPerPage }, () => pick(WORDS)).join(' '),
          notes: null,
          headingPath: [],
          locator: { kind: 'pdf' as const, sourceId: id, page: page + 1 },
        })),
      };
      const drafts = chunkDocument(document, title);
      chunks += drafts.length;
      repo.replaceContent(id, document.sections, drafts);
    }
  });
  return chunks;
}

/** One module per vault folder code, 20 concepts in each, and two relations per concept. */
function seedConcepts(modules: ReturnType<typeof createModules>): number {
  const next = random(7);
  const concepts: string[] = [];
  for (let folder = 0; folder < FOLDERS; folder += 1) {
    const module = modules.learning.createModule({
      code: `COC${200 + folder}`,
      title: `Module ${folder}`,
    });
    for (let index = 0; index < 20; index += 1)
      concepts.push(
        modules.concepts.create({ name: `Concept ${folder}-${index}`, moduleIds: [module.id] }).id,
      );
  }
  let relations = 0;
  for (const from of concepts) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const to = concepts[Math.floor(next() * concepts.length)] as string;
      try {
        modules.relations.create({ from, to, relation: 'relates_to' });
        relations += 1;
      } catch {
        // The same pair twice, or a concept with itself: skipped.
      }
    }
  }
  return relations;
}

function open(root: string, dataDir: string) {
  const ids = createIdFactory();
  const vault = openVault(root, { create: true, clock: systemClock, ids, appVersion: 'perf' });
  const db = openDatabase(vault.paths.database);
  migrate(db, loadMigrations(), systemClock);
  const config: ServerConfig = {
    mode: 'test',
    host: '127.0.0.1',
    port: 0,
    vaultPath: root,
    dataDir,
    webDir: null,
    logLevel: 'error',
    openBrowser: false,
    devWebOrigin: null,
    authTokenOverride: 'perf',
  };
  const ctx: AppContext = {
    config,
    logger: silentLogger,
    clock: systemClock,
    ids,
    vault,
    db,
    events: createEventBus(),
    version: 'perf',
    startedAt: new Date(),
  };
  const modules = createModules(ctx);
  return {
    modules,
    ids,
    close: async () => {
      await modules.close();
      db.close();
      vault.close();
    },
  };
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

async function main() {
  const temp = mkdtempSync(path.join(tmpdir(), 'skb-perf-'));
  const root = path.join(temp, 'vault');
  const results: { measure: string; value: string; budget: string; ok: boolean }[] = [];
  const record = (measure: string, ms: number, budget?: number) =>
    results.push({
      measure,
      value: `${Math.round(ms)} ms`,
      budget: budget ? `< ${budget} ms` : '—',
      ok: budget === undefined || ms < budget,
    });
  try {
    let started = performance.now();
    generateVault(root);
    console.log(
      `Generated ${NOTE_COUNT} notes in ${Math.round(performance.now() - started)} ms (${root})`,
    );

    // 1. First index of a vault (empty database).
    let session = open(root, path.join(temp, 'data'));
    started = performance.now();
    await session.modules.start({ watch: false });
    record(`Full index of ${NOTE_COUNT} notes`, performance.now() - started, BUDGETS.fullIndexMs);
    const status = session.modules.notes.indexer.status();
    console.log(`Indexed ${status.notes} notes`);
    await session.close();

    // 2. Start-up with an existing index: open, migrate, load the resolver and reconcile.
    started = performance.now();
    session = open(root, path.join(temp, 'data'));
    const opened = performance.now() - started;
    await session.modules.start({ watch: false });
    record(
      'Start-up with an existing index (open + reconcile)',
      performance.now() - started,
      BUDGETS.startupMs,
    );
    record('  of which opening the database and loading links', opened);

    // 3. Opening notes (read file, verify hash, analyse, resolve links).
    const tree = session.modules.notes.notes.tree();
    const sample = random(7);
    const timings: number[] = [];
    for (let round = 0; round < 300; round += 1) {
      const note = tree.notes[Math.floor(sample() * tree.notes.length)];
      if (!note) continue;
      const before = performance.now();
      session.modules.notes.notes.get(note.id);
      timings.push(performance.now() - before);
    }
    record('Note open, p95 (300 random notes)', percentile(timings, 0.95), BUDGETS.noteOpenP95Ms);
    record('Note open, median', percentile(timings, 0.5));

    // 4. Other operations (no budget yet; recorded for comparison).
    started = performance.now();
    session.modules.notes.notes.tree();
    record('File tree listing (all notes)', performance.now() - started);
    const backlinkTimings: number[] = [];
    for (let round = 0; round < 100; round += 1) {
      const note = tree.notes[Math.floor(sample() * tree.notes.length)];
      if (!note) continue;
      const before = performance.now();
      session.modules.notes.notes.backlinks(note.id);
      backlinkTimings.push(performance.now() - before);
    }
    record('Backlinks, p95', percentile(backlinkTimings, 0.95));

    // Full-text search (task 4.09): a mix of the query shapes people type.
    const queries = [
      'consensus',
      'leader election',
      '"gradient descent"',
      'trans',
      'quorum tag:module-3',
      'lock -deadlock',
      'kernel OR tensor',
      'module:COC207',
      'folder:"Module 4" attention',
      'replication log safety',
    ];
    const searchTimings: number[] = [];
    let found = 0;
    for (let round = 0; round < 20; round += 1) {
      for (const query of queries) {
        const before = performance.now();
        found += session.modules.search.search(query, { limit: 20, offset: 0 }).results.length;
        searchTimings.push(performance.now() - before);
      }
    }
    record(
      `Search, p95 (${searchTimings.length} queries, ${found} results)`,
      percentile(searchTimings, 0.95),
      BUDGETS.searchP95Ms,
    );
    record('Search, median', percentile(searchTimings, 0.5));
    if (process.env.SKB_PERF_DETAIL) {
      for (const query of queries) {
        const before = performance.now();
        const response = session.modules.search.search(query, { limit: 20, offset: 0 });
        console.log(
          `${Math.round(performance.now() - before)} ms  total ${response.total}  ${query}`,
        );
      }
    }
    // The same searches with a library of lecture PDFs (task 5.16), plus source-only queries.
    started = performance.now();
    const chunkCount = seedLibrary(session.modules, session.ids);
    const pages = LIBRARY.sources * LIBRARY.pages;
    record(
      `Writing ${pages} PDF pages (${chunkCount} chunks) to the index`,
      performance.now() - started,
    );
    const libraryQueries = [
      ...queries,
      'kind:pdf attention',
      'quorum kind:source',
      'module:COC210 kernel',
    ];
    const libraryTimings: number[] = [];
    let libraryFound = 0;
    for (let round = 0; round < 15; round += 1) {
      for (const query of libraryQueries) {
        const before = performance.now();
        libraryFound += session.modules.search.search(query, { limit: 20, offset: 0 }).results
          .length;
        libraryTimings.push(performance.now() - before);
      }
    }
    record(
      `Search with ${pages} PDF pages too, p95 (${libraryTimings.length} queries, ${libraryFound} results)`,
      percentile(libraryTimings, 0.95),
      BUDGETS.searchP95Ms,
    );
    record('Search with PDF pages too, median', percentile(libraryTimings, 0.5));
    if (process.env.SKB_PERF_DETAIL) {
      for (const query of libraryQueries) {
        const before = performance.now();
        const response = session.modules.search.search(query, { limit: 20, offset: 0 });
        console.log(
          `${Math.round(performance.now() - before)} ms  total ${response.total}  ${query}`,
        );
      }
    }

    // The knowledge graph (task 7.12): modules, concepts and relations on top of the notes and
    // the library, then a 5,000-node payload, first built from scratch and then from the cache.
    started = performance.now();
    const relationCount = seedConcepts(session.modules);
    record(
      `Writing 50 modules, 1000 concepts and ${relationCount} relations`,
      performance.now() - started,
    );
    const filter = GraphFilterSchema.parse({});
    started = performance.now();
    const cold = session.modules.graph.graph(filter);
    JSON.stringify(cold);
    record(
      `Graph: first build and a ${cold.nodes.length}-node payload (${cold.edges.length} edges, of ${cold.matched})`,
      performance.now() - started,
      BUDGETS.graphColdMs,
    );
    const graphTimings: number[] = [];
    for (let round = 0; round < 10; round += 1) {
      const before = performance.now();
      JSON.stringify(session.modules.graph.graph(filter));
      graphTimings.push(performance.now() - before);
    }
    record(
      `Graph: ${cold.nodes.length}-node payload from the cache, p95`,
      percentile(graphTimings, 0.95),
      BUDGETS.graphPayloadMs,
    );
    // The usual change while writing: a note's text, not its links. The analytics are kept.
    const edited = path.join(root, ...notePath(3).split('/'));
    writeFileSync(edited, `${readFileSync(edited, 'utf8')}\nOne more sentence.\n`);
    session.modules.notes.indexer.apply({ changed: [notePath(3)] }, 'external');
    started = performance.now();
    JSON.stringify(session.modules.graph.graph(filter));
    record(
      'Graph: payload after an edit that changes no link',
      performance.now() - started,
      BUDGETS.graphAfterEditMs,
    );
    started = performance.now();
    const centre = session.modules.concepts.list()[0]?.id ?? '';
    session.modules.graph.local(centre, 2, GraphFilterSchema.parse({ limit: 300 }));
    record('Graph: a concept two steps out', performance.now() - started);
    started = performance.now();
    const report = session.modules.graph.report();
    record(
      `Graph: report (${report.communities.length} clusters, ${report.prompts.length} prompts)`,
      performance.now() - started,
    );

    const changed = notePath(1);
    writeFileSync(
      path.join(root, ...changed.split('/')),
      `# Renamed content\nLinks to [[${noteName(2)}]].\n`,
    );
    started = performance.now();
    session.modules.notes.indexer.apply({ changed: [changed] }, 'external');
    record('Re-index one changed note', performance.now() - started);
    await session.close();
  } catch (error) {
    // Report the failure itself: removing the folder may fail too while the database is open.
    console.error(error);
    process.exitCode = 1;
  } finally {
    try {
      rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      console.error(`Could not remove ${temp}; delete it by hand.`);
    }
  }

  console.table(results);
  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`Over budget: ${failed.map((result) => result.measure).join(', ')}`);
    process.exit(1);
  }
  console.log('All notes performance budgets met.');
}

void main();
