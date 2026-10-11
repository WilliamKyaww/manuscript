import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  ConflictError,
  type Id,
  type MovePreview,
  NotFoundError,
  type TrashItem,
  type UploadedAttachment,
  ValidationError,
} from '@skb/core';
import {
  applyTextEdits,
  FrontmatterEditError,
  isMarkdownPath,
  sanitiseFileName,
  setFrontmatterValues,
  toPortablePath,
} from '@skb/core/markdown';
import { writeFileAtomic } from '../../vault/atomic';
import { movePath } from '../../vault/move';
import type { Vault } from '../../vault/vault';
import type { SettingsService } from '../settings/service';
import type { Bookmarks } from './bookmarks';
import { SOURCES_FOLDER } from './ignore';
import { decodeNote, type NoteIndexer, sha256 } from './indexer';
import { mediaTypeFor } from './media-types';
import { type MovePlan, planMove } from './moves';
import type { NotesRepository } from './repository';
import type { Trash } from './trash';

/**
 * Vault entries addressed by path — notes, folders and attachments: creating folders, moving and
 * renaming (with link rewriting), the trash, uploads and serving files.
 */

export interface MoveResult {
  from: string;
  to: string;
  noteId: Id<'note'> | null;
  rewritten: { notes: number; links: number };
  failed: { path: string; reason: string }[];
}

export interface VaultFile {
  absolute: string;
  path: string;
  sizeBytes: number;
  mtimeMs: number;
  mediaType: string;
}

export interface EntriesService {
  createFolder(folder: string): { path: string };
  movePreview(from: string, to: string): MovePreview;
  move(from: string, to: string, rewriteLinks: boolean): MoveResult;
  /** A copy beside the original ("Name 1.md"); a copied note never keeps the original's id. */
  copy(entryPath: string): { path: string; noteId: Id<'note'> | null };
  trash(entryPath: string): TrashItem;
  listTrash(): { items: TrashItem[]; retentionDays: number };
  restore(trashId: string): { path: string };
  purge(trashId: string): void;
  saveAttachment(input: {
    fileName: string;
    bytes: Uint8Array;
    folder?: string | null;
  }): UploadedAttachment;
  /** A note or attachment to serve; ignored and application files are never served. */
  file(relativePath: string): VaultFile;
}

export interface EntriesServiceDependencies {
  vault: Vault;
  repo: NotesRepository;
  indexer: NoteIndexer;
  settings: SettingsService;
  trash: Trash;
  bookmarks: Bookmarks;
}

function cleanPath(value: string): string {
  return toPortablePath(value.trim()).replace(/\/+$/, '');
}

export function createEntriesService({
  vault,
  repo,
  indexer,
  settings,
  trash,
  bookmarks,
}: EntriesServiceDependencies): EntriesService {
  const kindOf = (entryPath: string): MovePlan['kind'] => {
    if (repo.byPath(entryPath)) return 'note';
    if (repo.attachment(entryPath)) return 'attachment';
    if (indexer.folders().includes(entryPath)) return 'folder';
    throw new NotFoundError(`"${entryPath}" is not in the vault (or is not indexed).`);
  };

  const notesInside = (folder: string) => repo.inFolder(folder).length;

  const validateMove = (from: string, to: string): MovePlan['kind'] => {
    const kind = kindOf(from);
    vault.resolve(to);
    if (to === from) throw new ValidationError('The new location is the same as the current one.');
    const classifier = indexer.classifier();
    if (kind === 'folder') {
      if (to.startsWith(`${from}/`))
        throw new ValidationError('A folder cannot be moved into itself.');
      if (classifier.isIgnoredFolder(to))
        throw new ValidationError(`"${to}" is not an indexed folder.`);
      if (classifier.classifyFile(`${to}/x.md`) !== 'note' && notesInside(from) > 0) {
        throw new ValidationError(`Folders with notes cannot be moved into ${SOURCES_FOLDER}/.`);
      }
    } else {
      const destination = classifier.classifyFile(to);
      if (kind === 'note' && !isMarkdownPath(to))
        throw new ValidationError('A note’s name must end in .md.');
      if (kind === 'note' && destination !== 'note') {
        throw new ValidationError(
          `Notes cannot be moved into ${SOURCES_FOLDER}/ or a folder that is not indexed.`,
        );
      }
      if (kind === 'attachment' && destination !== 'attachment') {
        throw new ValidationError(
          'An attachment cannot be renamed to a note (.md) or moved out of the index.',
        );
      }
    }
    const caseOnly = to.toLowerCase() === from.toLowerCase();
    if (!caseOnly && existsSync(vault.resolve(to)))
      throw new ConflictError(`"${to}" already exists.`);
    return kind;
  };

  const filesUnder = (folder: string): { files: string[]; folders: string[] } => {
    const files: string[] = [];
    const folders: string[] = [folder];
    const classifier = indexer.classifier();
    for (const entry of readdirSync(vault.resolve(folder), {
      recursive: true,
      withFileTypes: true,
    })) {
      const relative = toPortablePath(
        path.relative(vault.root, path.join(entry.parentPath, entry.name)),
      );
      if (entry.isDirectory()) {
        if (!classifier.isIgnoredFolder(relative)) folders.push(relative);
      } else if (entry.isFile() && classifier.classifyFile(relative) !== 'ignored') {
        files.push(relative);
      }
    }
    return { files, folders };
  };

  const uniqueFile = (folder: string, base: string, extension: string): string => {
    const prefix = folder === '' ? '' : `${folder}/`;
    for (let attempt = 0; ; attempt += 1) {
      const candidate = `${prefix}${attempt === 0 ? base : `${base} ${attempt}`}${extension}`;
      if (!existsSync(vault.resolve(candidate))) return candidate;
    }
  };

  return {
    createFolder(input) {
      const folder = cleanPath(input);
      const absolute = vault.resolve(folder);
      if (indexer.classifier().isIgnoredFolder(folder))
        throw new ValidationError(`"${folder}" would not be indexed.`);
      if (existsSync(absolute)) throw new ConflictError(`"${folder}" already exists.`);
      mkdirSync(absolute, { recursive: true });
      indexer.apply({ addedFolders: [folder] }, 'app');
      return { path: folder };
    },

    movePreview(fromInput, toInput) {
      const from = cleanPath(fromInput);
      const to = cleanPath(toInput);
      const kind = validateMove(from, to);
      const plan = planMove({ repo, indexer }, kind, from, to);
      return {
        from,
        to,
        kind,
        entries: plan.moves.length,
        rewrites: plan.rewrites.map((rewrite) => ({
          source: {
            id: rewrite.sourceId as Id<'note'>,
            path: rewrite.sourcePath,
            title: rewrite.sourceTitle,
          },
          links: rewrite.edits.length,
        })),
      };
    },

    move(fromInput, toInput, rewriteLinks) {
      const from = cleanPath(fromInput);
      const to = cleanPath(toInput);
      const kind = validateMove(from, to);
      const plan = planMove({ repo, indexer }, kind, from, to);
      const noteId = kind === 'note' ? (repo.byPath(from)?.id ?? null) : null;
      const subfolders = indexer.folders().filter((folder) => folder.startsWith(`${from}/`));

      movePath(vault.resolve(from), vault.resolve(to));

      const failed = [...plan.failures];
      const rewritten: string[] = [];
      let links = 0;
      if (rewriteLinks) {
        for (const rewrite of plan.rewrites) {
          const file = vault.resolve(rewrite.sourcePathAfter);
          if (sha256(readFileSync(file)) !== rewrite.hash) {
            failed.push({
              path: rewrite.sourcePathAfter,
              reason: 'The note changed during the move, so its links were not rewritten.',
            });
            continue;
          }
          writeFileAtomic(file, applyTextEdits(rewrite.text, rewrite.edits));
          rewritten.push(rewrite.sourcePathAfter);
          links += rewrite.edits.length;
        }
      }
      const attachmentMoves = plan.moves.filter((move) => move.kind === 'attachment');
      indexer.apply(
        {
          moved: plan.moves.filter((move) => move.kind === 'note'),
          changed: [...rewritten, ...attachmentMoves.map((move) => move.to)],
          removed: attachmentMoves.map((move) => move.from),
          removedFolders: kind === 'folder' ? [from] : [],
          addedFolders:
            kind === 'folder'
              ? [to, ...subfolders.map((folder) => `${to}${folder.slice(from.length)}`)]
              : [],
        },
        'app',
      );
      bookmarks.relocate(from, to);
      return {
        from,
        to,
        noteId: noteId as Id<'note'> | null,
        rewritten: { notes: rewritten.length, links },
        failed,
      };
    },

    copy(entryInput) {
      const from = cleanPath(entryInput);
      const kind = kindOf(from);
      if (kind === 'folder') throw new ValidationError('Only notes and attachments can be copied.');
      const slash = from.lastIndexOf('/');
      const folder = slash === -1 ? '' : from.slice(0, slash);
      const name = from.slice(slash + 1);
      const dot = name.lastIndexOf('.');
      const base = dot > 0 ? name.slice(0, dot) : name;
      const extension = dot > 0 ? name.slice(dot) : '';
      const to = uniqueFile(folder, base, extension);
      const bytes = readFileSync(vault.resolve(from));
      let content: string | Uint8Array = bytes;
      if (kind === 'note') {
        const decoded = decodeNote(bytes);
        if (decoded.valid) {
          try {
            // Two files with one id would be one note to everything that refers to it.
            content = setFrontmatterValues(decoded.text, { id: undefined });
          } catch (error) {
            if (!(error instanceof FrontmatterEditError)) throw error;
            content = decoded.text;
          }
        }
      }
      writeFileAtomic(vault.resolve(to), content);
      indexer.apply({ changed: [to] }, 'app');
      return {
        path: to,
        noteId: kind === 'note' ? ((repo.byPath(to)?.id ?? null) as Id<'note'> | null) : null,
      };
    },

    trash(entryInput) {
      const entryPath = cleanPath(entryInput);
      const kind = kindOf(entryPath);
      const notes =
        kind === 'note'
          ? [repo.byPath(entryPath)]
          : kind === 'folder'
            ? repo.inFolder(entryPath)
            : [];
      const noteIds = Object.fromEntries(notes.flatMap((row) => (row ? [[row.path, row.id]] : [])));
      const item = trash.put(entryPath, kind, noteIds);
      indexer.apply(
        kind === 'folder' ? { removedFolders: [entryPath] } : { removed: [entryPath] },
        'app',
      );
      return item;
    },

    listTrash() {
      return { items: trash.list(), retentionDays: settings.notes().trashRetentionDays };
    },

    restore(trashId) {
      const restored = trash.restore(trashId, (candidate) => existsSync(vault.resolve(candidate)));
      if (restored.item.kind === 'folder') {
        const { files, folders } = filesUnder(restored.path);
        indexer.apply({ changed: files, addedFolders: folders, idHints: restored.noteIds }, 'app');
      } else {
        indexer.apply({ changed: [restored.path], idHints: restored.noteIds }, 'app');
      }
      return { path: restored.path };
    },

    purge(trashId) {
      trash.purge(trashId);
    },

    saveAttachment({ fileName, bytes, folder }) {
      const target = cleanPath(folder?.trim() || settings.notes().attachmentsFolder);
      vault.resolve(target);
      if (indexer.classifier().isIgnoredFolder(target))
        throw new ValidationError(`"${target}" is not an indexed folder.`);
      const baseName = path.posix.basename(fileName.replace(/\\/g, '/'));
      const dot = baseName.lastIndexOf('.');
      const extension = dot > 0 ? `.${baseName.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '')}` : '';
      if (isMarkdownPath(extension))
        throw new ValidationError('Markdown files are notes: create a note instead.');
      const base = sanitiseFileName(dot > 0 ? baseName.slice(0, dot) : baseName);
      const relative = uniqueFile(target, base, extension === '.' ? '' : extension);
      writeFileAtomic(vault.resolve(relative), bytes);
      indexer.apply({ changed: [relative], addedFolders: [target] }, 'app');
      const name = path.posix.basename(relative);
      const resolved = indexer.resolver.resolve(name);
      const embedTarget =
        resolved.kind === 'attachment' && resolved.path === relative ? name : relative;
      return {
        path: relative,
        name,
        sizeBytes: bytes.byteLength,
        mediaType: mediaTypeFor(relative),
        embed: `![[${embedTarget}]]`,
      };
    },

    file(relativePath) {
      const portable = cleanPath(relativePath);
      const absolute = vault.resolve(portable);
      if (indexer.classifier().classifyFile(portable) === 'ignored')
        throw new NotFoundError('No such file.');
      let stats: ReturnType<typeof statSync>;
      try {
        stats = statSync(absolute);
      } catch {
        throw new NotFoundError('No such file.');
      }
      if (!stats.isFile()) throw new NotFoundError('No such file.');
      return {
        absolute,
        path: portable,
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs,
        mediaType: mediaTypeFor(portable),
      };
    },
  };
}
