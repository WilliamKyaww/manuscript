import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DataOverviewSchema, JobSummarySchema, VaultInspectionSchema } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { jsonApi } from '../../../test/api-helpers';
import { OBSIDIAN_VAULT } from '../../../test/fixtures/obsidian-vault';
import { createTestApp } from '../../../test/helpers';
import { activeVault, forget, readRegistry, recordOpened, setActive } from './registry';

let harness: ReturnType<typeof createTestApp> | undefined;
const scratch: string[] = [];
afterEach(() => {
  harness?.cleanup();
  harness = undefined;
  for (const folder of scratch.splice(0)) rmSync(folder, { recursive: true, force: true });
});
const temp = () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'skb-vaults-'));
  scratch.push(folder);
  return folder;
};

/** Every file outside the application's own folder, with a hash of its bytes. */
function snapshot(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (relative !== '.skb') walk(full);
      } else {
        files.set(relative, createHash('sha256').update(readFileSync(full)).digest('hex'));
      }
    }
  };
  walk(root);
  return files;
}

describe('the list of vaults on this machine', () => {
  it('keeps the most recent first, forgets, and ignores a damaged file', () => {
    const dataDir = temp();
    const first = path.join(temp(), 'one');
    const second = path.join(temp(), 'two');
    mkdirSync(first);
    mkdirSync(second);
    recordOpened(dataDir, first, new Date('2026-10-01T09:00:00Z'));
    recordOpened(dataDir, second, new Date('2026-10-02T09:00:00Z'));
    recordOpened(dataDir, first, new Date('2026-10-03T09:00:00Z'));
    expect(readRegistry(dataDir).recent.map((entry) => entry.path)).toEqual([first, second]);

    expect(activeVault(dataDir)).toBeNull();
    setActive(dataDir, second);
    expect(activeVault(dataDir)).toBe(second);
    // A vault that has gone is not opened by surprise.
    rmSync(second, { recursive: true });
    expect(activeVault(dataDir)).toBeNull();

    forget(dataDir, first);
    expect(readRegistry(dataDir).recent.map((entry) => entry.path)).toEqual([second]);
    expect(readRegistry(dataDir).active).toBe(second);
    forget(dataDir, second);
    expect(readRegistry(dataDir)).toEqual({ version: 1, active: null, recent: [] });

    writeFileSync(path.join(dataDir, 'vaults.json'), '{ not json');
    expect(readRegistry(dataDir).recent).toEqual([]);
  });
});

describe('opening another vault', () => {
  it('says what a folder is and what opening it will do', async () => {
    harness = createTestApp();
    const api = jsonApi(harness.request);
    const inspect = (folder: string) =>
      api.post('/api/data/vaults/inspect', { path: folder }, 200, VaultInspectionSchema);

    const base = temp();
    expect((await inspect(path.join(base, 'nothing yet'))).kind).toBe('missing');
    const empty = path.join(base, 'empty');
    mkdirSync(empty);
    expect((await inspect(empty)).kind).toBe('empty');

    const plain = path.join(base, 'plain');
    mkdirSync(plain);
    writeFileSync(path.join(plain, 'a.md'), '# A\n');
    writeFileSync(path.join(plain, 'b.pdf'), 'x');
    expect(await inspect(plain)).toMatchObject({ kind: 'folder', notes: 1, files: 1 });

    const obsidian = path.join(base, 'obsidian');
    for (const [relative, content] of Object.entries(OBSIDIAN_VAULT)) {
      const file = path.join(obsidian, ...relative.split('/'));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const found = await inspect(obsidian);
    expect(found.kind).toBe('obsidian');
    expect(found.obsidian).toBe(true);
    expect(found.notes).toBeGreaterThan(3);
    expect(found.summary).toMatch(/adds an id line/u);

    expect((await inspect(harness.ctx.vault.root)).current).toBe(true);
  });

  it('records the choice and asks for a restart only when something will relaunch the process', async () => {
    let requested = 0;
    harness = createTestApp({
      restart: {
        available: true,
        request: () => {
          requested += 1;
        },
      },
    });
    const api = jsonApi(harness.request);
    const dataDir = harness.ctx.config.dataDir;
    const other = path.join(temp(), 'second vault');
    mkdirSync(other);

    const overview = await api.get('/api/data', DataOverviewSchema);
    expect(overview.canRestart).toBe(true);

    expect(await api.post('/api/data/vaults/switch', { path: other }, 200)).toEqual({
      restarting: true,
      path: other,
    });
    expect(requested).toBe(1);
    expect(activeVault(dataDir)).toBe(other);

    // Not into itself, not into a folder inside the vault, not around it.
    await api.post('/api/data/vaults/switch', { path: harness.ctx.vault.root }, 400);
    await api.post(
      '/api/data/vaults/switch',
      { path: path.join(harness.ctx.vault.root, 'inner') },
      400,
    );
    await api.post('/api/data/vaults/switch', { path: path.dirname(harness.ctx.vault.root) }, 400);
    expect(requested).toBe(1);

    // A vault that another copy of the application has open is left alone.
    const busy = path.join(temp(), 'busy');
    mkdirSync(path.join(busy, '.skb'), { recursive: true });
    writeFileSync(
      path.join(busy, '.skb', 'lock'),
      JSON.stringify({
        pid: process.pid,
        hostname: 'elsewhere',
        startedAt: '2026-10-01T00:00:00Z',
      }),
    );
    // (This process holds that lock, so it counts as alive.)
    await api.post('/api/data/vaults/switch', { path: busy }, 409);
  });

  it('without a launcher records the choice and says it opens next time', async () => {
    harness = createTestApp();
    const api = jsonApi(harness.request);
    const other = path.join(temp(), 'next time');
    expect(await api.post('/api/data/vaults/switch', { path: other }, 200)).toEqual({
      restarting: false,
      path: path.resolve(other),
    });
    expect(activeVault(harness.ctx.config.dataDir)).toBeNull(); // not there yet, so not opened by surprise
    mkdirSync(other);
    expect(activeVault(harness.ctx.config.dataDir)).toBe(path.resolve(other));
  });

  it('opens an Obsidian vault in place without changing a single file of it', async () => {
    const vaultFolder = path.join(temp(), 'my obsidian vault');
    for (const [relative, content] of Object.entries(OBSIDIAN_VAULT)) {
      const file = path.join(vaultFolder, ...relative.split('/'));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const before = snapshot(vaultFolder);

    harness = createTestApp({ config: { vaultPath: vaultFolder } });
    const api = jsonApi(harness.request);
    await harness.modules.notes.start({ watch: false });
    await harness.modules.sources.start();
    // Everything the application does on opening: read, index, search, graph and an export.
    await api.get('/api/notes');
    await api.get('/api/graph');
    const exporting = await api.post(
      '/api/data/export',
      undefined,
      201,
      z.object({ job: JobSummarySchema }),
    );
    await harness.modules.jobs.runDue();
    expect(harness.modules.jobs.get(exporting.job.id)?.status).toBe('succeeded');

    const after = snapshot(vaultFolder);
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [relative, hash] of before) expect(after.get(relative), relative).toBe(hash);
  });
});
