import { readFileSync } from 'node:fs';
import { ConflictError, type Id, type NoteSummary, ValidationError } from '@skb/core';
import {
  analyseNote,
  applyTextEdits,
  encodeLinkDestination,
  folderOf,
  noteNameFromPath,
  relativeVaultPath,
  splitFrontmatter,
  type TextEdit,
  WIKILINK_UNSAFE,
} from '@skb/core/markdown';
import { writeFileAtomic } from '../../vault/atomic';
import type { Bookmarks } from './bookmarks';
import type { EntriesService } from './entries';
import { decodeNote, type NoteIndexer, sha256 } from './indexer';
import type { NoteRow, NotesRepository } from './repository';
import type { NoteVersions } from './versions';

/**
 * "Merge entire file with…" (task 23.06, ADR-0042): the body of one note is appended to another,
 * every link that pointed at it is retargeted at the other note (keeping headings and aliases),
 * and it goes to the trash, from where it can be restored. The receiving note keeps a version of
 * its text from before the merge.
 */

export interface MergeResult {
  target: NoteSummary;
  retargeted: { notes: number; links: number };
  failed: { path: string; reason: string }[];
  trashId: string;
}

export interface MergeDependencies {
  repo: NotesRepository;
  indexer: NoteIndexer;
  entries: EntriesService;
  versions: NoteVersions;
  bookmarks: Bookmarks;
}

interface Edited {
  row: NoteRow;
  hash: string;
  text: string;
  edits: TextEdit[];
}

function readText(indexer: NoteIndexer, row: NoteRow): { text: string; hash: string } | null {
  const bytes = readFileSync(indexer.absolute(row.path));
  const decoded = decodeNote(bytes);
  return decoded.valid ? { text: decoded.text, hash: sha256(bytes) } : null;
}

export function mergeNotes(
  { repo, indexer, entries, versions, bookmarks }: MergeDependencies,
  sourceId: string,
  targetId: string,
): MergeResult {
  if (sourceId === targetId) throw new ValidationError('A note cannot be merged with itself.');
  const source = repo.byId(sourceId);
  const target = repo.byId(targetId);
  if (!source || !target) throw new ValidationError('Both notes must exist to be merged.');
  const sourceText = readText(indexer, source);
  const targetText = readText(indexer, target);
  if (!sourceText || !targetText)
    throw new ValidationError('Only notes that are valid UTF-8 text can be merged.');

  const resolver = indexer.resolver;
  /** How a note at `fromPath` should link to the target: wikilinks by name, Markdown by path. */
  const replacementFor = (
    fromPath: string,
    link: { syntax: 'wikilink' | 'markdown'; target: string },
    bracketed: boolean,
  ): string | null => {
    if (link.syntax === 'markdown') {
      const relative = relativeVaultPath(fromPath, target.path);
      return bracketed ? relative : encodeLinkDestination(relative);
    }
    let name = resolver.linkTargetFor(target.id, fromPath) ?? noteNameFromPath(target.path);
    if (/\.md$/i.test(link.target)) name += '.md';
    return WIKILINK_UNSAFE.test(name) ? null : name;
  };

  const failed: MergeResult['failed'] = [];
  const pointsAtSource = (linkTarget: string, fromPath: string) => {
    if (linkTarget.trim() === '') return false;
    const resolved = resolver.resolve(linkTarget, fromPath);
    return resolved.kind === 'note' && resolved.noteId === source.id;
  };

  /** Edits retargeting a note's links from the source to the target. */
  const retarget = (row: NoteRow, text: string, asPath: string): TextEdit[] => {
    const edits: TextEdit[] = [];
    for (const link of analyseNote(text).links) {
      if (!pointsAtSource(link.target, row.path)) continue;
      const replacement = replacementFor(asPath, link, text[link.targetOffset - 1] === '<');
      if (replacement === null) {
        failed.push({ path: row.path, reason: `A link to "${target.title}" cannot be written.` });
        continue;
      }
      edits.push({ offset: link.targetOffset, length: link.targetLength, text: replacement });
    }
    return edits;
  };

  // Notes linking to the source (the target among them, perhaps).
  const linking = new Map<number, Edited>();
  for (const link of repo.linksTo([source.docId])) {
    if (link.sourceDoc === source.docId || linking.has(link.sourceDoc)) continue;
    const row = repo.byDoc(link.sourceDoc);
    const current = row && readText(indexer, row);
    if (!row || !current) {
      if (row) failed.push({ path: row.path, reason: 'The note is not valid UTF-8 text.' });
      continue;
    }
    const edits = retarget(row, current.text, row.path);
    if (edits.length > 0) linking.set(row.docId, { row, ...current, edits });
  }

  // The body that moves: links to itself become links to the target, and relative Markdown links
  // are recomputed when the two notes are in different folders.
  const split = splitFrontmatter(sourceText.text);
  const body = sourceText.text.slice(split.bodyStart);
  const bodyEdits: TextEdit[] = [];
  const moved = folderOf(source.path) !== folderOf(target.path);
  for (const link of analyseNote(body).links) {
    if (pointsAtSource(link.target, source.path)) {
      const replacement = replacementFor(target.path, link, body[link.targetOffset - 1] === '<');
      if (replacement !== null)
        bodyEdits.push({ offset: link.targetOffset, length: link.targetLength, text: replacement });
      continue;
    }
    if (!moved || link.syntax !== 'markdown' || link.target.trim() === '') continue;
    const resolved = resolver.resolve(link.target, source.path);
    if (resolved.kind !== 'note' && resolved.kind !== 'attachment') continue;
    const relative = relativeVaultPath(target.path, resolved.path);
    bodyEdits.push({
      offset: link.targetOffset,
      length: link.targetLength,
      text: body[link.targetOffset - 1] === '<' ? relative : encodeLinkDestination(relative),
    });
  }
  const movedBody = applyTextEdits(body, bodyEdits).replace(/^\s*\n/, '');

  // The target: its own links to the source retargeted, then the body appended.
  const ownEdits = linking.get(target.docId)?.edits ?? [];
  linking.delete(target.docId);
  const receiving = applyTextEdits(targetText.text, ownEdits);
  const eol = receiving.includes('\r\n') ? '\r\n' : '\n';
  const appended = movedBody.replace(/\r?\n/g, eol);
  // One blank line between the two texts, whatever the receiving note ended with.
  const merged =
    receiving.trim() === '' ? appended : `${receiving.replace(/\s+$/, '')}${eol}${eol}${appended}`;

  if (sha256(readFileSync(indexer.absolute(target.path))) !== targetText.hash)
    throw new ConflictError('The note changed while merging. Try again.');
  versions.keep(target.id, targetText.text, 'merge');
  writeFileAtomic(indexer.absolute(target.path), merged);

  const rewritten: string[] = [target.path];
  let links = ownEdits.length;
  let retargetedNotes = ownEdits.length > 0 ? 1 : 0;
  for (const edited of linking.values()) {
    const file = indexer.absolute(edited.row.path);
    if (sha256(readFileSync(file)) !== edited.hash) {
      failed.push({
        path: edited.row.path,
        reason: 'The note changed during the merge, so its links were not retargeted.',
      });
      continue;
    }
    writeFileAtomic(file, applyTextEdits(edited.text, edited.edits));
    rewritten.push(edited.row.path);
    links += edited.edits.length;
    retargetedNotes += 1;
  }
  indexer.apply({ changed: rewritten }, 'app');
  const trashed = entries.trash(source.path);
  bookmarks.retarget(source.path, target.path);

  const updated = repo.byId(target.id) ?? target;
  return {
    target: {
      id: updated.id as Id<'note'>,
      path: updated.path,
      title: updated.title,
      type: updated.type,
      aliases: repo.aliases(updated.docId),
      updatedAt: updated.updatedAt,
    },
    retargeted: { notes: retargetedNotes, links },
    failed,
    trashId: trashed.id,
  };
}
