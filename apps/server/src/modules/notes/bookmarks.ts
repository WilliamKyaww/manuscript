import type { Bookmarks as BookmarkList } from '@skb/core';
import { toPortablePath } from '@skb/core/markdown';
import type { SettingsService } from '../settings/service';

/**
 * Bookmarks (task 23.06, ADR-0042): a vault setting listing paths, which follow their files when the
 * application moves or merges them. A bookmark whose file is gone (deleted elsewhere, or in the
 * trash) is kept, so restoring the file brings it back; the client shows it as missing.
 */

export interface Bookmarks {
  list(): BookmarkList;
  replace(next: BookmarkList): BookmarkList;
  /** After a move: bookmarks of the moved entry, or of anything inside a moved folder, follow it. */
  relocate(from: string, to: string): void;
  /** After a merge: a bookmark of the merged note becomes one of the note it was merged into. */
  retarget(from: string, to: string): void;
}

const clean = (value: string) => toPortablePath(value.trim()).replace(/^\/+|\/+$/g, '');

function deduplicated(list: BookmarkList): BookmarkList {
  const seen = new Set<string>();
  const items: BookmarkList['items'] = [];
  for (const item of list.items) {
    const path = clean(item.path);
    if (path === '' || seen.has(path)) continue;
    seen.add(path);
    items.push({ ...item, path });
  }
  return { items };
}

export function createBookmarks(settings: SettingsService): Bookmarks {
  const replace = (next: BookmarkList) => settings.updateBookmarks(deduplicated(next));
  return {
    list: () => settings.bookmarks(),
    replace,
    relocate(from, to) {
      const current = settings.bookmarks();
      let changed = false;
      const items = current.items.map((item) => {
        if (item.path === from) {
          changed = true;
          return { ...item, path: to };
        }
        if (item.path.startsWith(`${from}/`)) {
          changed = true;
          return { ...item, path: `${to}${item.path.slice(from.length)}` };
        }
        return item;
      });
      if (changed) replace({ items });
    },
    retarget(from, to) {
      const current = settings.bookmarks();
      if (!current.items.some((item) => item.path === from)) return;
      replace({
        items: current.items.map((item) =>
          item.path === from ? { path: to, kind: 'note' as const } : item,
        ),
      });
    },
  };
}
