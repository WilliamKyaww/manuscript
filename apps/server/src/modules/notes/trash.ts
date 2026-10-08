import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { NotFoundError, type TrashItem, TrashItemSchema } from '@skb/core';
import { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import { writeFileAtomic } from '../../vault/atomic';
import { movePath } from '../../vault/move';
import type { Vault } from '../../vault/vault';

/**
 * Soft deletion (knowledge-system.md §1): deleted notes, folders and attachments are moved into
 * `.skb/trash/<id>/content/` with a `manifest.json`, kept for the retention period and restorable to
 * their original path. Everything stays a plain file the user can recover by hand.
 */

export interface RestoredItem {
  item: TrashItem;
  /** Where it was restored to (suffixed if the original path is taken). */
  path: string;
  /** Note ids recorded at deletion, by restored path, so notes come back with the same id. */
  noteIds: Map<string, string>;
}

export interface Trash {
  /** Moves an entry into the trash, remembering the ids of the notes in it (by vault path). */
  put(
    relativePath: string,
    kind: TrashItem['kind'],
    noteIds: Readonly<Record<string, string>>,
  ): TrashItem;
  list(): TrashItem[];
  get(id: string): TrashItem;
  restore(id: string, isTaken: (relativePath: string) => boolean): RestoredItem;
  purge(id: string): void;
  /** Permanently removes items past their expiry; returns how many. */
  purgeExpired(): number;
}

export interface TrashDependencies {
  vault: Vault;
  clock: Clock;
  logger: Logger;
  retentionDays: () => number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The manifest adds what restoring needs to the public item. */
const ManifestSchema = TrashItemSchema.extend({
  noteIds: z.record(z.string(), z.string()).default({}),
});
type Manifest = z.infer<typeof ManifestSchema>;

function publicItem({ noteIds: _noteIds, ...item }: Manifest): TrashItem {
  return item;
}

function trashId(now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `${stamp}-${randomBytes(4).toString('hex')}`;
}

function restoredName(name: string, attempt: number): string {
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0;
  const base = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : '';
  return `${base} (restored${attempt > 1 ? ` ${attempt}` : ''})${extension}`;
}

export function createTrash({ vault, clock, logger, retentionDays }: TrashDependencies): Trash {
  const root = vault.paths.trash;
  const itemDir = (id: string) => path.join(root, id);
  const contentPath = (id: string, originalPath: string) =>
    path.join(itemDir(id), 'content', path.posix.basename(originalPath));

  const read = (id: string): Manifest | null => {
    try {
      const parsed = ManifestSchema.safeParse(
        JSON.parse(readFileSync(path.join(itemDir(id), 'manifest.json'), 'utf8')),
      );
      return parsed.success && parsed.data.id === id ? parsed.data : null;
    } catch {
      return null;
    }
  };

  const get = (id: string): Manifest => {
    const item = read(id);
    if (!item || !existsSync(contentPath(id, item.originalPath)))
      throw new NotFoundError('That item is no longer in the trash.');
    return item;
  };

  return {
    put(relativePath, kind, noteIds) {
      const now = clock.now();
      const id = trashId(now);
      const item: Manifest = {
        id,
        originalPath: relativePath,
        kind,
        deletedAt: now.toISOString(),
        notes: Object.keys(noteIds).length,
        expiresAt: new Date(now.getTime() + retentionDays() * DAY_MS).toISOString(),
        noteIds: { ...noteIds },
      };
      mkdirSync(path.join(itemDir(id), 'content'), { recursive: true });
      writeFileAtomic(
        path.join(itemDir(id), 'manifest.json'),
        `${JSON.stringify(item, null, 2)}\n`,
      );
      try {
        movePath(vault.resolve(relativePath), contentPath(id, relativePath));
      } catch (error) {
        rmSync(itemDir(id), { recursive: true, force: true });
        throw error;
      }
      return publicItem(item);
    },

    list() {
      if (!existsSync(root)) return [];
      return readdirSync(root)
        .map(read)
        .filter((item): item is Manifest => item !== null)
        .map(publicItem)
        .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0));
    },

    get: (id) => publicItem(get(id)),

    restore(id, isTaken) {
      const item = get(id);
      const folder = path.posix.dirname(item.originalPath);
      const name = path.posix.basename(item.originalPath);
      let target = item.originalPath;
      for (let attempt = 1; isTaken(target); attempt += 1) {
        target =
          folder === '.' ? restoredName(name, attempt) : `${folder}/${restoredName(name, attempt)}`;
      }
      movePath(contentPath(id, item.originalPath), vault.resolve(target));
      rmSync(itemDir(id), { recursive: true, force: true });
      const noteIds = new Map<string, string>();
      for (const [originalNotePath, noteId] of Object.entries(item.noteIds)) {
        const inside =
          originalNotePath === item.originalPath
            ? ''
            : originalNotePath.slice(item.originalPath.length);
        noteIds.set(`${target}${inside}`, noteId);
      }
      return { item: publicItem(item), path: target, noteIds };
    },

    purge(id) {
      get(id);
      rmSync(itemDir(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },

    purgeExpired() {
      const now = clock.now().toISOString();
      let removed = 0;
      for (const item of this.list()) {
        if (item.expiresAt > now) continue;
        try {
          rmSync(itemDir(item.id), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
          removed += 1;
        } catch (error) {
          logger.warn('Could not empty an expired trash item', { id: item.id, error });
        }
      }
      return removed;
    },
  };
}
