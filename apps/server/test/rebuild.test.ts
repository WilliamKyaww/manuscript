import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createIdFactory } from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppContext } from '../src/context';
import { loadMigrations, migrate } from '../src/db/migrate';
import { openDatabase } from '../src/db/sqlite';
import { createModules } from '../src/modules/index';
import { FixedClock } from '../src/shared/clock';
import { createEventBus } from '../src/shared/events';
import { silentLogger } from '../src/shared/logger';
import { openVault } from '../src/vault/vault';

/** Phase 3 acceptance criterion: deleting `.skb/` loses no notes — the index is rebuilt from files. */

let root: string;
afterEach(() => rmSync(root, { recursive: true, force: true }));

function openAt(vaultRoot: string) {
  const clock = new FixedClock('2026-10-08T09:00:00.000Z');
  const ids = createIdFactory({ now: () => clock.now().getTime() });
  const vault = openVault(vaultRoot, { create: true, clock, ids, appVersion: 'test' });
  const db = openDatabase(vault.paths.database);
  migrate(db, loadMigrations(), clock);
  const ctx = {
    config: { mode: 'test' },
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
    modules,
    async close() {
      await modules.close();
      db.close();
      vault.close();
    },
  };
}

describe('rebuilding the index', () => {
  it('recovers every note, link and persisted id after .skb is deleted', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'skb-rebuild-'));
    const write = (relative: string, content: string) => {
      const file = path.join(root, ...relative.split('/'));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    };
    write('Paxos.md', '# Paxos\nSee [[Raft]].');
    write('Notes/Raft.md', '# Raft');

    let session = openAt(root);
    await session.modules.start({ watch: false });
    const raftBefore = session.modules.notes.repo.byPath('Notes/Raft.md');
    if (!raftBefore) throw new Error('Raft was not indexed');
    // Something durable refers to Raft, so its id is written into the file.
    session.modules.notes.indexer.ensurePersistentId(raftBefore.id);
    await session.close();

    rmSync(path.join(root, '.skb'), { recursive: true, force: true });
    expect(existsSync(path.join(root, '.skb'))).toBe(false);

    session = openAt(root);
    await session.modules.start({ watch: false });
    const tree = session.modules.notes.notes.tree();
    expect(tree.notes.map((note) => note.path)).toEqual(['Notes/Raft.md', 'Paxos.md']);
    expect(session.modules.notes.repo.byPath('Notes/Raft.md')?.id).toBe(raftBefore.id);
    const paxos = tree.notes.find((note) => note.path === 'Paxos.md');
    const backlinks = session.modules.notes.notes.backlinks(raftBefore.id);
    expect(backlinks.linked.map((entry) => entry.source.id)).toEqual([paxos?.id]);
    await session.close();
  });
});
