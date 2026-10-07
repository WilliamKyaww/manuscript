import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ServerEvent } from '@skb/core';
import { createNoteIndexer } from '../src/modules/notes/indexer';
import { createNotesRepository } from '../src/modules/notes/repository';
import { createSettingsService } from '../src/modules/settings/service';
import { createTestContext, type TestContextOptions } from './helpers';

/** A temporary vault with the notes index wired up, plus helpers to change files behind its back. */
export function createNotesTestbed(options: TestContextOptions = {}) {
  const test = createTestContext(options);
  const settings = createSettingsService(test.ctx);
  const repo = createNotesRepository(test.ctx.db);
  const indexer = createNoteIndexer({ ...test.ctx, repo, settings, chunkSize: 3 });
  const events: ServerEvent[] = [];
  test.ctx.events.subscribe((event) => events.push(event));
  const vaultRoot = test.ctx.vault.root;
  const abs = (relative: string) => path.join(vaultRoot, ...relative.split('/'));

  return {
    ...test,
    settings,
    repo,
    indexer,
    events,
    vaultRoot,
    abs,
    write(relative: string, content: string | Uint8Array) {
      mkdirSync(path.dirname(abs(relative)), { recursive: true });
      writeFileSync(abs(relative), content);
    },
    read(relative: string) {
      return readFileSync(abs(relative), 'utf8');
    },
    remove(relative: string) {
      rmSync(abs(relative), { recursive: true, force: true });
    },
    move(from: string, to: string) {
      mkdirSync(path.dirname(abs(to)), { recursive: true });
      renameSync(abs(from), abs(to));
    },
    /** Note id at a path (throws if not indexed). */
    idOf(relative: string): string {
      const row = repo.byPath(relative);
      if (!row) throw new Error(`${relative} is not indexed`);
      return row.id;
    },
    vaultChanges() {
      return events.flatMap((event) => (event.type === 'vault.changed' ? event.notes : []));
    },
  };
}

export type NotesTestbed = ReturnType<typeof createNotesTestbed>;
