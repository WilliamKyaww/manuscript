import { afterEach, describe, expect, it } from 'vitest';
import { createNotesTestbed, type NotesTestbed } from '../../../test/notes-helpers';
import { type VaultWatcher, watchVault } from './watcher';

let bed: NotesTestbed;
let watcher: VaultWatcher | undefined;

afterEach(async () => {
  await watcher?.close();
  watcher = undefined;
  bed?.cleanup();
});

/** Polls until `check` passes; file-system events take a moment, especially on Windows. */
async function eventually(check: () => void, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

async function start() {
  bed = createNotesTestbed();
  bed.write('Existing.md', 'Links to [[New note]]');
  await bed.indexer.scan();
  watcher = watchVault({
    vault: bed.ctx.vault,
    indexer: bed.indexer,
    logger: bed.ctx.logger,
    batchMs: 50,
  });
  await watcher.ready;
  bed.events.length = 0;
}

describe('watchVault', { timeout: 20_000 }, () => {
  it('indexes notes created, changed, renamed and deleted by other programs', async () => {
    await start();
    bed.write('Folder/New note.md', '# New note');
    await eventually(() => expect(bed.repo.byPath('Folder/New note.md')).toBeDefined());
    const id = bed.idOf('Folder/New note.md');
    const existing = bed.repo.byPath('Existing.md');
    expect(bed.repo.linksFrom(existing?.docId ?? 0)[0]).toMatchObject({ targetKind: 'note' });
    expect(bed.indexer.folders()).toContain('Folder');

    bed.write('Folder/New note.md', '# New note\nEdited elsewhere');
    await eventually(() => expect(bed.repo.byPath('Folder/New note.md')?.wordCount).toBe(4));

    bed.move('Folder/New note.md', 'Folder/Renamed.md');
    await eventually(() => expect(bed.repo.byPath('Folder/Renamed.md')).toBeDefined());
    await watcher?.flush();
    expect(bed.idOf('Folder/Renamed.md')).toBe(id);
    expect(bed.repo.byPath('Folder/New note.md')).toBeUndefined();

    bed.remove('Folder/Renamed.md');
    await eventually(() => expect(bed.repo.byPath('Folder/Renamed.md')).toBeUndefined());
    expect(bed.vaultChanges().every((change) => change.origin === 'external')).toBe(true);
  });

  it('ignores application, tool and temporary files', async () => {
    await start();
    bed.write('.obsidian/workspace.json', '{"a":1}');
    bed.write('.Existing.md.123.0a1b2c3d.tmp', 'partial');
    bed.write('Marker.md', 'marker');
    await eventually(() => expect(bed.repo.byPath('Marker.md')).toBeDefined());
    await watcher?.flush();
    expect(bed.vaultChanges().map((change) => change.path)).toEqual(['Marker.md']);
  });

  it('does not report the app’s own writes as external changes', async () => {
    await start();
    bed.write('Existing.md', 'Rewritten by the app');
    bed.indexer.apply({ changed: ['Existing.md'] }, 'app');
    bed.write('Marker.md', 'marker');
    await eventually(() => expect(bed.repo.byPath('Marker.md')).toBeDefined());
    await watcher?.flush();
    expect(bed.vaultChanges().map((change) => [change.path, change.origin])).toEqual([
      ['Existing.md', 'app'],
      ['Marker.md', 'external'],
    ]);
  });
});
