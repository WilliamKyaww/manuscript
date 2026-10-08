import { readFileSync } from 'node:fs';
import {
  analyseNote,
  encodeLinkDestination,
  type LinkResolution,
  LinkResolver,
  linkTargetKey,
  normaliseKey,
  noteNameFromPath,
  optionalString,
  relativeVaultPath,
  type TextEdit,
  toPortablePath,
  WIKILINK_UNSAFE,
} from '@skb/core/markdown';
import { decodeNote, type NoteIndexer, sha256 } from './indexer';
import type { NotesRepository } from './repository';

/**
 * Planning a move or rename (task 3.08): which files move, and which links in which notes must be
 * rewritten so that every link that pointed somewhere before the move points at the same place
 * afterwards. Planning reads files but changes nothing, so the same plan serves the preview and
 * the move itself.
 *
 * Rules: wikilinks get the shortest target that resolves to the same note (Obsidian's "shortest
 * path when possible"); Markdown links get a path relative to the linking note. Links that were
 * unresolved are left alone.
 */

export interface PlannedMove {
  from: string;
  to: string;
  kind: 'note' | 'attachment';
}

export interface PlannedRewrite {
  sourceId: string;
  sourceTitle: string;
  /** Path of the linking note before and after the move (it may move too). */
  sourcePath: string;
  sourcePathAfter: string;
  /** Hash and text the edits were computed against; writing must verify the hash first. */
  hash: string;
  text: string;
  edits: TextEdit[];
}

export interface MovePlan {
  kind: 'note' | 'folder' | 'attachment';
  from: string;
  to: string;
  moves: PlannedMove[];
  rewrites: PlannedRewrite[];
  /** Links that would change target but cannot be rewritten automatically. */
  failures: { path: string; reason: string }[];
}

export interface MovePlanDependencies {
  repo: NotesRepository;
  indexer: NoteIndexer;
}

function relocate(path: string, from: string, to: string): string {
  if (path === from) return to;
  return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path;
}

/** Shortest path suffix of `path` that resolves to it from `sourcePath`. */
function attachmentTarget(resolver: LinkResolver, path: string, sourcePath: string): string {
  const segments = toPortablePath(path).split('/');
  for (let start = segments.length - 1; start >= 0; start -= 1) {
    const candidate = segments.slice(start).join('/');
    const result = resolver.resolve(candidate, sourcePath);
    if (result.kind === 'attachment' && result.path === path) return candidate;
  }
  return `/${path}`;
}

function sameTarget(
  before: LinkResolution,
  after: LinkResolution,
  newPath: (path: string) => string,
): boolean {
  if (before.kind === 'note') return after.kind === 'note' && after.noteId === before.noteId;
  if (before.kind === 'attachment')
    return after.kind === 'attachment' && after.path === newPath(before.path);
  return true;
}

export function planMove(
  { repo, indexer }: MovePlanDependencies,
  kind: MovePlan['kind'],
  from: string,
  to: string,
): MovePlan {
  const newPath = (path: string) => relocate(path, from, to);
  const moves: PlannedMove[] = [];
  const notes =
    kind === 'note'
      ? [repo.byPath(from)].filter((row) => row !== undefined)
      : kind === 'folder'
        ? repo.inFolder(from)
        : [];
  for (const note of notes) moves.push({ from: note.path, to: newPath(note.path), kind: 'note' });
  const attachments = repo
    .allAttachments()
    .filter((attachment) =>
      kind === 'folder' ? attachment.path.startsWith(`${from}/`) : attachment.path === from,
    );
  if (kind !== 'note')
    for (const attachment of attachments)
      moves.push({ from: attachment.path, to: newPath(attachment.path), kind: 'attachment' });

  // A note without a frontmatter title is titled by its file name, so a rename changes its title.
  const titlesAfter = new Map<string, string>();
  for (const note of notes) {
    const frontmatter = JSON.parse(note.frontmatterJson) as Record<string, unknown>;
    if (optionalString(frontmatter.title) === null) {
      titlesAfter.set(note.id, noteNameFromPath(newPath(note.path)));
    }
  }
  // The link resolver as it will be after the move.
  const after = new LinkResolver(
    repo.resolvable().map((note) => ({
      ...note,
      path: newPath(note.path),
      title: titlesAfter.get(note.id) ?? note.title,
    })),
    repo.allAttachments().map((attachment) => ({ path: newPath(attachment.path) })),
  );
  const before = indexer.resolver;

  // Notes whose links might change meaning: the moved notes themselves, notes linking to anything
  // that moves, and notes linking by a name that a moved note or attachment answers to.
  const movedDocs = notes.map((note) => note.docId);
  const affectedKeys = new Set<string>();
  for (const note of notes) {
    affectedKeys.add(normaliseKey(noteNameFromPath(note.path)));
    affectedKeys.add(normaliseKey(note.title));
    for (const alias of repo.aliases(note.docId)) affectedKeys.add(normaliseKey(alias));
  }
  for (const attachment of attachments) {
    const name = attachment.path.slice(attachment.path.lastIndexOf('/') + 1);
    affectedKeys.add(normaliseKey(name));
    affectedKeys.add(linkTargetKey(name));
  }
  const sourceDocs = new Set<number>(movedDocs);
  for (const link of repo.linksTo(
    movedDocs,
    attachments.map((attachment) => attachment.path),
  ))
    sourceDocs.add(link.sourceDoc);
  for (const link of repo.linksByNameKeys(affectedKeys)) sourceDocs.add(link.sourceDoc);

  const rewrites: PlannedRewrite[] = [];
  const failures: MovePlan['failures'] = [];
  for (const docId of [...sourceDocs].sort((a, b) => a - b)) {
    const source = repo.byDoc(docId);
    if (!source) continue;
    const sourcePathAfter = newPath(source.path);
    const bytes = readFileSync(indexer.absolute(source.path));
    const decoded = decodeNote(bytes);
    if (!decoded.valid) {
      failures.push({
        path: source.path,
        reason: 'The note is not valid UTF-8 text, so its links cannot be rewritten.',
      });
      continue;
    }
    const edits: TextEdit[] = [];
    for (const link of analyseNote(decoded.text).links) {
      if (link.target.trim() === '') continue;
      const was = before.resolve(link.target, source.path);
      const will = after.resolve(link.target, sourcePathAfter);
      if (was.kind === 'unresolved' || sameTarget(was, will, newPath)) continue;
      const targetAfter = newPath(was.path);
      let replacement: string;
      if (link.syntax === 'markdown') {
        const relative = relativeVaultPath(sourcePathAfter, targetAfter);
        const bracketed = decoded.text[link.targetOffset - 1] === '<';
        replacement = bracketed ? relative : encodeLinkDestination(relative);
      } else {
        replacement =
          was.kind === 'note'
            ? (after.linkTargetFor(was.noteId, sourcePathAfter) ?? targetAfter)
            : attachmentTarget(after, targetAfter, sourcePathAfter);
        if (was.kind === 'note' && /\.md$/i.test(link.target)) replacement += '.md';
        if (WIKILINK_UNSAFE.test(replacement)) {
          failures.push({
            path: source.path,
            reason: `"${replacement}" cannot be written as a wikilink.`,
          });
          continue;
        }
      }
      edits.push({ offset: link.targetOffset, length: link.targetLength, text: replacement });
    }
    if (edits.length > 0) {
      rewrites.push({
        sourceId: source.id,
        sourceTitle: source.title,
        sourcePath: source.path,
        sourcePathAfter,
        hash: sha256(bytes),
        text: decoded.text,
        edits,
      });
    }
  }
  return { kind, from, to, moves, rewrites, failures };
}
