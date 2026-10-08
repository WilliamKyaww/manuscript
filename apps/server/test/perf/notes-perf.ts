/**
 * Notes performance check (task 3.22, budgets from architecture.md §14). Generates a vault of
 * 10,000 interlinked notes and measures indexing, start-up reconciliation, note opening and other
 * operations through the real modules. Run with `npm run test:perf` (add a number to change the
 * note count). Exits with code 1 if a budget is exceeded.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIdFactory } from '@skb/core';
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
const BUDGETS = { fullIndexMs: 60_000, startupMs: 3_000, noteOpenP95Ms: 100, searchP95Ms: 150 };

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
    const changed = notePath(1);
    writeFileSync(
      path.join(root, ...changed.split('/')),
      `# Renamed content\nLinks to [[${noteName(2)}]].\n`,
    );
    started = performance.now();
    session.modules.notes.indexer.apply({ changed: [changed] }, 'external');
    record('Re-index one changed note', performance.now() - started);
    await session.close();
  } finally {
    rmSync(temp, { recursive: true, force: true, maxRetries: 3 });
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
