import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createIdFactory,
  DataOverviewSchema,
  ExportManifestSchema,
  type JobSummary,
  JobSummarySchema,
} from '@skb/core';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { makePptx } from '../../../test/fixtures/sources/builders';
import { practiceTestbed } from '../../../test/practice-helpers';
import type { AppContext } from '../../context';
import { loadMigrations, migrate } from '../../db/migrate';
import { openDatabase } from '../../db/sqlite';
import { FixedClock } from '../../shared/clock';
import { createEventBus } from '../../shared/events';
import { silentLogger } from '../../shared/logger';
import { openVault } from '../../vault/vault';
import { createModules } from '../index';
import { CANONICAL_TABLES, readTable } from './tables';
import { readZip } from './zip';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
const scratch: string[] = [];
afterEach(() => {
  bed?.cleanup();
  bed = undefined;
  for (const folder of scratch.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const temp = () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'skb-portability-'));
  scratch.push(folder);
  return folder;
};

const SLIDES = [
  { title: 'Raft', body: ['A leader is elected by a majority of the servers.'] },
  { title: 'Paxos', body: ['Proposers and acceptors agree on one value.'] },
];

async function archiveEntries(file: string) {
  const entries = new Map<string, Uint8Array>();
  await readZip(file, (name) => ({ kind: 'memory', done: (data) => entries.set(name, data) }));
  return entries;
}
const text = (bytes: Uint8Array | undefined) => new TextDecoder().decode(bytes);

/** What a source row says once the parts that are read again from the original are left out. */
const stable = (rows: Record<string, unknown>[], table: string) =>
  rows.map((row) => {
    if (table !== 'sources') return row;
    const {
      status: _status,
      error: _error,
      parser_version: _parser,
      ingested_sha256: _sha,
      ingested_at: _at,
      ...rest
    } = row;
    return rest;
  });

/** Opens a vault folder with the whole application, as it would be on the next start. */
function openRestored(vaultRoot: string, dataDir: string) {
  const clock = new FixedClock('2026-10-09T09:00:00.000Z');
  const ids = createIdFactory({ now: () => clock.now().getTime() });
  const vault = openVault(vaultRoot, { create: false, clock, ids, appVersion: 'test' });
  const db = openDatabase(vault.paths.database);
  migrate(db, loadMigrations(), clock);
  const ctx = {
    config: { mode: 'test', dataDir, aiMock: false },
    logger: silentLogger,
    clock,
    ids,
    vault,
    db,
    events: createEventBus(),
    version: 'test',
    startedAt: clock.now(),
  } as unknown as AppContext;
  const modules = createModules(ctx);
  return {
    db,
    vault,
    modules,
    async close() {
      await modules.close();
      db.close();
      vault.close();
    },
  };
}

describe('export and restore', () => {
  it('writes your vault and data in open formats, and restores them into a new vault', async () => {
    const testbed = await practiceTestbed();
    bed = testbed.bed;
    const { api, raft, paxos, mcq, quiz, attempt, answer, module } = testbed;
    await bed.start();

    // Something of everything: a source, notes (one written by hand, without an id), concepts with a
    // relation, flashcards, questions, a quiz and answers.
    const imported = await bed.imported('consensus.pptx', makePptx(SLIDES), 'COC251');
    await bed.settle();
    const note = await api.post<{ id: string; path: string }>('/api/notes', {
      title: 'Raft',
      content: '# Raft\n\nLeader election needs a majority. See [[Paxos]].\n',
    });
    await api.patch(`/api/concepts/${raft.id}`, { noteId: note.id }, 200);
    const byHand = path.join(bed.ctx.vault.root, 'Obsidian note.md');
    const handwritten = '---\ntags: [exam]\n---\n# By hand\n\nNo id yet.\r\nLine two.\r\n';
    writeFileSync(byHand, handwritten);
    await bed.modules.notes.indexer.scan();
    await api.post('/api/relations', { from: paxos.id, to: raft.id, relation: 'relates_to' }, 201);
    const set = await api.post<{ id: string }>('/api/card-sets', {
      title: 'Consensus: terms',
      moduleId: module.id,
    });
    await api.post('/api/cards', {
      setId: set.id,
      kind: 'basic',
      front: 'What does Raft elect?',
      back: 'A leader',
      conceptIds: [raft.id],
    });
    const questions = await Promise.all(
      [0, 1, 2].map((n) => mcq([raft.id], { stem: `Raft ${n}` })),
    );
    const quizSummary = await quiz({ kind: 'practice', config: {} });
    const started = await attempt(quizSummary.id);
    for (const question of questions)
      await answer(started.id, { questionId: question.id, response: { kind: 'mcq', choice: 'a' } });

    // --- Export -------------------------------------------------------------------------------
    const exporting = await api.post(
      '/api/data/export',
      undefined,
      201,
      z.object({ job: JobSummarySchema }),
    );
    await bed.modules.jobs.runDue();
    const finished = bed.modules.jobs.get(exporting.job.id) as JobSummary;
    expect(finished.status, finished.error ?? '').toBe('succeeded');

    const overview = await api.get('/api/data', DataOverviewSchema);
    expect(overview.exports).toHaveLength(1);
    expect(overview.counts).toMatchObject({ concepts: 2, cards: 1, questions: 3, answers: 3 });
    const archiveName = overview.exports[0]?.name as string;
    const archive = path.join(overview.exportsFolder, archiveName);
    const entries = await archiveEntries(archive);
    const root = `${archiveName.replace(/\.zip$/u, '')}/`;
    const inside = (name: string) => entries.get(`${root}${name}`);

    // Open formats, in documented places.
    const manifest = ExportManifestSchema.parse(JSON.parse(text(inside('manifest.json'))));
    expect(manifest.tables).toEqual(CANONICAL_TABLES.map((table) => table.name));
    expect(manifest.counts.tables.concepts).toBe(2);
    expect(text(inside('README.md'))).toContain('Obsidian-compatible');
    expect(text(inside('docs/schema.md'))).toContain('## review_logs');
    const concepts = JSON.parse(text(inside('data/concepts.json'))) as { name: string }[];
    expect(concepts.map((concept) => concept.name).sort()).toEqual(['Paxos', 'Raft']);
    expect(
      [...entries.keys()].some((name) => name.includes('/anki/') && name.endsWith('.txt')),
    ).toBe(true);
    const graph = JSON.parse(text(inside('graph/graph.json'))) as {
      nodes: { label: string }[];
      links: unknown[];
    };
    expect(graph.nodes.map((node) => node.label)).toContain('Raft');
    expect(text(inside('graph/graph.graphml'))).toContain('<graphml');
    expect(JSON.parse(text(inside('questions/question-bank.json')))).toHaveLength(3);
    // The app's own folder, the database and the keys are never in an archive.
    expect([...entries.keys()].some((name) => name.includes('.skb') || name.endsWith('.db'))).toBe(
      false,
    );
    // The originals are byte for byte what was imported.
    const sourcePath = (await bed.source(imported.source.id)).path;
    const archivedOriginal = Buffer.from(inside(`vault/${sourcePath}`) ?? new Uint8Array());
    expect(archivedOriginal.equals(readFileSync(bed.abs(sourcePath)))).toBe(true);
    // A note without an id gains one in the archive only, and nothing else about it changes.
    expect(readFileSync(byHand, 'utf8')).toBe(handwritten);
    const archived = text(inside('vault/Obsidian note.md'));
    expect(archived).toMatch(
      /^---\nid: note_[0-9A-HJKMNP-TV-Z]{26}\ntags: \[exam\]\n---\n# By hand/u,
    );
    expect(archived).toContain('No id yet.\r\nLine two.\r\n');
    const noteIds = JSON.parse(text(inside('data/note-ids.json'))) as {
      id: string;
      path: string;
    }[];
    const handId = noteIds.find((entry) => entry.path === 'Obsidian note.md')?.id;
    expect(archived).toContain(`id: ${handId}`);

    // --- Restore ------------------------------------------------------------------------------
    const target = path.join(temp(), 'restored vault');
    const restoring = await api.post(
      '/api/data/restore',
      { archive: archiveName, target },
      201,
      z.object({ job: JobSummarySchema }),
    );
    await bed.modules.jobs.runDue();
    const restored = bed.modules.jobs.get(restoring.job.id) as JobSummary;
    expect(restored.status, restored.error ?? '').toBe('succeeded');
    expect(restored.message).toContain(target);

    // Files are where they were, and the notes carry their ids.
    expect(readFileSync(path.join(target, ...sourcePath.split('/')))).toEqual(
      readFileSync(bed.abs(sourcePath)),
    );
    expect(text(new Uint8Array(readFileSync(path.join(target, 'Obsidian note.md'))))).toContain(
      `id: ${handId}`,
    );
    expect(existsSync(path.join(target, '.skb', 'skb.db'))).toBe(true);

    // The student's own data is the same, table by table (what is read from sources is made again).
    const copy = openDatabase(path.join(target, '.skb', 'skb.db'), { readOnly: true });
    for (const table of CANONICAL_TABLES) {
      expect(stable(readTable(copy, table.name), table.name), table.name).toEqual(
        stable(readTable(bed.ctx.db, table.name), table.name),
      );
    }
    copy.close();

    // Opened by the application, the derived parts come back by themselves.
    const reopened = openRestored(target, path.join(temp(), 'data'));
    try {
      await reopened.modules.notes.start({ watch: false });
      await reopened.modules.sources.start();
      for (let round = 0; round < 20; round += 1) {
        await reopened.modules.sources.reconciler.whenIdle();
        if ((await reopened.modules.jobs.runDue()) === 0) break;
      }
      const notes = reopened.modules.notes.repo.all();
      expect(notes.find((row) => row.path === 'Obsidian note.md')?.id).toBe(handId);
      expect(notes.find((row) => row.id === note.id)?.path).toBe(note.path);
      const sources = reopened.modules.sources.repo.live();
      expect(sources.map((row) => row.status)).toEqual(['ready']);
      expect(reopened.modules.concepts.get(raft.id).note?.id).toBe(note.id);
    } finally {
      await reopened.close();
    }
  });

  it('refuses a folder that is not empty, and an export from a newer version, and leaves nothing behind', async () => {
    const testbed = await practiceTestbed();
    bed = testbed.bed;
    const { api } = testbed;
    await bed.start();
    const exporting = await api.post(
      '/api/data/export',
      undefined,
      201,
      z.object({ job: JobSummarySchema }),
    );
    await bed.modules.jobs.runDue();
    expect(bed.modules.jobs.get(exporting.job.id)?.status).toBe('succeeded');
    const name = (await api.get('/api/data', DataOverviewSchema)).exports[0]?.name as string;

    const run = async (body: Record<string, unknown>) => {
      const started = await api.post(
        '/api/data/restore',
        body,
        201,
        z.object({ job: JobSummarySchema }),
      );
      await bed?.modules.jobs.runDue();
      return bed?.modules.jobs.get(started.job.id) as JobSummary;
    };

    const occupied = temp();
    writeFileSync(path.join(occupied, 'mine.md'), '# Mine\n');
    const refused = await run({ archive: name, target: occupied });
    expect(refused.status).toBe('failed');
    expect(refused.error).toMatch(/not empty/u);
    expect(readFileSync(path.join(occupied, 'mine.md'), 'utf8')).toBe('# Mine\n');

    // The vault in use is not a place to restore into, nor is a folder inside it.
    const inside = await run({ archive: name, target: path.join(bed.ctx.vault.root, 'again') });
    expect(inside.error).toMatch(/outside the vault/u);

    // An archive from the future is not guessed at.
    const manifest = {
      format: 99,
      app: 'manuscript',
      appVersion: '9.0.0',
      exportedAt: '2030-01-01T00:00:00.000Z',
      vault: { id: 'vault_x', name: 'x' },
      migrations: 99,
      counts: { files: 0, notes: 0, tables: {} },
      tables: [],
    };
    const future = path.join(temp(), 'future.zip');
    writeFileSync(future, zipSync({ 'export/manifest.json': strToU8(JSON.stringify(manifest)) }));
    const target = path.join(temp(), 'new');
    const newer = await run({ archive: future, target });
    expect(newer.status).toBe('failed');
    expect(newer.error).toMatch(/newer version/u);
    expect(existsSync(target)).toBe(false);

    // Something that is not an export at all.
    const notExport = path.join(temp(), 'random.zip');
    mkdirSync(path.dirname(notExport), { recursive: true });
    writeFileSync(notExport, zipSync({ 'hello.txt': strToU8('hello') }));
    const random = await run({ archive: notExport, target: path.join(temp(), 'other') });
    expect(random.error).toMatch(/not a Manuscript export/u);
  });
});
