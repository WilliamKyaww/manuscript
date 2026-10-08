import { folderOf, toPortablePath } from './names';

/**
 * Writing links and applying edits to note text. Used when a note is renamed or moved (incoming and
 * outgoing links are rewritten), when an unlinked mention becomes a link, and by the editor.
 */

export interface TextEdit {
  offset: number;
  length: number;
  text: string;
}

/** Applies non-overlapping edits given as offsets into the original text. */
export function applyTextEdits(source: string, edits: readonly TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => a.offset - b.offset);
  let result = '';
  let cursor = 0;
  for (const edit of sorted) {
    if (edit.offset < cursor) throw new Error('Text edits overlap.');
    if (edit.offset + edit.length > source.length) throw new Error('Text edit is out of range.');
    result += source.slice(cursor, edit.offset) + edit.text;
    cursor = edit.offset + edit.length;
  }
  return result + source.slice(cursor);
}

export interface WikilinkParts {
  target: string;
  heading?: string | null;
  blockRef?: string | null;
  alias?: string | null;
  embed?: boolean;
}

/** Formats `[[target#heading|alias]]`; `escapePipe` writes `\|` for use inside tables. */
export function formatWikilink(
  parts: WikilinkParts,
  options: { escapePipe?: boolean } = {},
): string {
  let inner = parts.target;
  if (parts.blockRef) inner += `#^${parts.blockRef}`;
  else if (parts.heading) inner += `#${parts.heading}`;
  if (parts.alias) inner += `${options.escapePipe ? '\\|' : '|'}${parts.alias}`;
  return `${parts.embed ? '!' : ''}[[${inner}]]`;
}

/** Characters that wikilink targets cannot contain (Obsidian forbids them in file names too). */
export const WIKILINK_UNSAFE = /[[\]|#^]/;

/**
 * Percent-encodes a path for a Markdown link destination: each segment is encoded, `/` is kept,
 * and parentheses are encoded so the destination cannot end the link early.
 */
export function encodeLinkDestination(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[()]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('/');
}

/** Relative path from the folder containing `fromPath` to `toPath` (both vault-relative). */
export function relativeVaultPath(fromPath: string, toPath: string): string {
  const from = folderOf(fromPath).split('/').filter(Boolean);
  const to = toPortablePath(toPath).split('/');
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1;
  return [...Array.from({ length: from.length - common }, () => '..'), ...to.slice(common)].join(
    '/',
  );
}
