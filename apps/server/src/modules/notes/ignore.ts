import { VAULT_META_DIR } from '@skb/core';
import { isMarkdownPath, toPortablePath } from '@skb/core/markdown';
import { ATOMIC_TEMP_PATTERN } from '../../vault/atomic';

/**
 * Which vault files are notes, which are attachments and which are ignored (data-model.md §2).
 * Paths are vault-relative and `/`-separated.
 */

/** Imported originals live here (Phase 5); they are linkable files, never notes. */
export const SOURCES_FOLDER = 'Sources';

/** Folders that are never indexed: application data, other tools' metadata, dependencies. */
const ALWAYS_IGNORED_FOLDERS = new Set([
  VAULT_META_DIR,
  '.obsidian',
  '.trash',
  '.git',
  'node_modules',
]);

export type EntryKind = 'note' | 'attachment' | 'ignored';

export interface VaultClassifier {
  /** True if a folder (and so everything inside it) is left out. */
  isIgnoredFolder(path: string): boolean;
  classifyFile(path: string): EntryKind;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globSource(glob: string): string {
  let source = '';
  let index = 0;
  while (index < glob.length) {
    if (glob.startsWith('**/', index)) {
      source += '(?:.*/)?';
      index += 3;
    } else if (glob.startsWith('**', index)) {
      source += '.*';
      index += 2;
    } else if (glob[index] === '*') {
      source += '[^/]*';
      index += 1;
    } else if (glob[index] === '?') {
      source += '[^/]';
      index += 1;
    } else {
      source += escapeRegExp(glob[index] ?? '');
      index += 1;
    }
  }
  return source;
}

/**
 * Compiles a gitignore-like pattern: `*`, `?` and `**` wildcards; a pattern without `/` matches at any
 * depth; a leading `/` or an inner `/` anchors it to the vault root; a trailing `/` matches folders
 * only. A matching folder excludes everything inside it. Matching ignores case.
 */
export function compileIgnorePattern(
  pattern: string,
): (path: string, isFolder: boolean) => boolean {
  const trimmed = pattern.trim().replace(/\\/g, '/');
  const folderOnly = trimmed.endsWith('/');
  const body = trimmed.replace(/^\/+|\/+$/g, '');
  if (body === '') return () => false;
  const anchored = trimmed.startsWith('/') || body.includes('/');
  const prefix = anchored ? '^' : '^(?:.*/)?';
  // The match must end at a segment boundary; anything after it is inside a matched folder.
  const regex = new RegExp(`${prefix}${globSource(body)}(?=/|$)`, 'i');
  return (path, isFolder) => {
    const portable = toPortablePath(path);
    const match = regex.exec(portable);
    if (!match) return false;
    const matchedWhole = match[0].length === portable.length;
    // A folder-only pattern may match a file only through one of its parent folders.
    return !folderOnly || isFolder || !matchedWhole;
  };
}

export function createClassifier(ignorePatterns: readonly string[] = []): VaultClassifier {
  const matchers = ignorePatterns.map(compileIgnorePattern);
  const userIgnored = (path: string, isFolder: boolean) =>
    matchers.some((matches) => matches(path, isFolder));

  const isIgnoredFolder = (path: string): boolean => {
    const segments = toPortablePath(path).split('/');
    // Hidden folders (".git", ".obsidian", …) are other tools' business.
    if (
      segments.some(
        (segment) => segment.startsWith('.') || ALWAYS_IGNORED_FOLDERS.has(segment.toLowerCase()),
      )
    ) {
      return true;
    }
    return userIgnored(path, true);
  };

  return {
    isIgnoredFolder,
    classifyFile(path) {
      const portable = toPortablePath(path);
      const slash = portable.lastIndexOf('/');
      const name = portable.slice(slash + 1);
      if (name === '' || name.startsWith('.') || ATOMIC_TEMP_PATTERN.test(name)) return 'ignored';
      if (slash !== -1 && isIgnoredFolder(portable.slice(0, slash))) return 'ignored';
      if (userIgnored(portable, false)) return 'ignored';
      const inSources = portable.toLowerCase().startsWith(`${SOURCES_FOLDER.toLowerCase()}/`);
      return isMarkdownPath(portable) && !inSources ? 'note' : 'attachment';
    },
  };
}
