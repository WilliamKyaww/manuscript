/**
 * Names, keys and file names for notes. Link resolution is case-insensitive and Unicode-normalised
 * (NFC), matching how Obsidian resolves wikilinks on Windows and macOS (knowledge-system.md §3).
 */

const MD_EXTENSION = /\.md$/i;

/** Case-insensitive, Unicode-normalised comparison key with collapsed whitespace. */
export function normaliseKey(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Converts any path to the portable `/`-separated form without leading `./` or `/`. */
export function toPortablePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '');
}

export function isMarkdownPath(path: string): boolean {
  return MD_EXTENSION.test(path);
}

/** The note's name as used by wikilinks: the file name without folders or the `.md` extension. */
export function noteNameFromPath(path: string): string {
  const portable = toPortablePath(path);
  const base = portable.slice(portable.lastIndexOf('/') + 1);
  return base.replace(MD_EXTENSION, '');
}

/** Folder part of a vault-relative path ('' for the vault root). */
export function folderOf(path: string): string {
  const portable = toPortablePath(path);
  const index = portable.lastIndexOf('/');
  return index === -1 ? '' : portable.slice(0, index);
}

/** Key for matching a link target: portable, without a trailing `.md`, normalised. */
export function linkTargetKey(target: string): string {
  return normaliseKey(toPortablePath(target).replace(MD_EXTENSION, ''));
}

/** Key for a note path: portable, without `.md`, normalised (used for path-qualified links). */
export function notePathKey(path: string): string {
  return linkTargetKey(path);
}

// Characters that are invalid on Windows or that break wikilinks ([[a|b]], #heading, ^block).
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what we replace.
const UNSAFE_FILE_CHARACTERS = /[<>:"/\\|?*#^[\]\u0000-\u001f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;
const MAX_FILE_NAME_LENGTH = 120;

/** Turns a note title into a safe, portable file name (without extension). */
export function sanitiseFileName(title: string): string {
  let name = title
    .normalize('NFC')
    .replace(UNSAFE_FILE_CHARACTERS, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  if (name.length > MAX_FILE_NAME_LENGTH) name = name.slice(0, MAX_FILE_NAME_LENGTH).trim();
  if (name === '' || /^-+$/.test(name)) name = 'Untitled';
  if (WINDOWS_RESERVED.test(name)) name = `${name}-note`;
  return name;
}
