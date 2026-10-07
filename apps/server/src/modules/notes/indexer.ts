import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, type Stats, statSync } from 'node:fs';
import path from 'node:path';
import {
  type IdFactory,
  type IndexStatus,
  MAX_NOTE_LENGTH,
  type NoteChange,
  type NoteWarning,
  NotFoundError,
  ValidationError,
} from '@skb/core';
import {
  analyseNote,
  folderOf,
  LinkResolver,
  linkTargetKey,
  type NoteAnalysis,
  normaliseKey,
  noteNameFromPath,
} from '@skb/core/markdown';
import type { Clock } from '../../shared/clock';
import type { EventBus } from '../../shared/events';
import type { Logger } from '../../shared/logger';
import { writeFileAtomic } from '../../vault/atomic';
import type { Vault } from '../../vault/vault';
import type { SettingsService } from '../settings/service';
import { hasForeignId, persistedIdOf, withPersistedId } from './identity';
import { createClassifier, type VaultClassifier } from './ignore';
import { mediaTypeFor } from './media-types';
import type {
  LinkInsert,
  LinkResolutionRow,
  NoteData,
  NoteRow,
  NotesRepository,
} from './repository';
import { scanVault } from './scanner';

/**
 * Keeps the SQLite index in step with the Markdown files (tasks 3.04–3.06). Files are canonical: every
 * operation re-reads the disk, so applying the same change twice is harmless and the index can always
 * be rebuilt by a full scan. All database work for one batch happens in one synchronous transaction.
 */

export type ChangeOrigin = NoteChange['origin'];

export interface IndexBatch {
  /** Files created or modified. */
  changed?: readonly string[];
  /** Files deleted (or moved away). */
  removed?: readonly string[];
  addedFolders?: readonly string[];
  removedFolders?: readonly string[];
}

export interface IndexResult {
  notes: NoteChange[];
  /** Folders or attachments changed, or notes appeared/disappeared. */
  structure: boolean;
}

export interface NoteIndexer {
  readonly resolver: LinkResolver;
  status(): IndexStatus;
  folders(): string[];
  classifier(): VaultClassifier;
  /** Full reconciliation with the files on disk. Concurrent calls share one scan. */
  scan(): Promise<IndexResult>;
  /** Resolves once no scan is running. */
  whenIdle(): Promise<void>;
  /** Re-indexes specific files (watcher batches and the notes service). Synchronous. */
  apply(batch: IndexBatch, origin: ChangeOrigin): IndexResult;
  /** Writes the note's id into its frontmatter so other data can refer to it durably. */
  ensurePersistentId(noteId: string): NoteRow;
  /** Absolute path of a vault-relative path produced by the index (already validated). */
  absolute(relativePath: string): string;
}

export interface NoteIndexerDependencies {
  vault: Vault;
  repo: NotesRepository;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
  events: EventBus;
  settings: SettingsService;
  /** Notes per transaction during a scan; the event loop is released between chunks. */
  chunkSize?: number;
}

interface BatchContext {
  origin: ChangeOrigin;
  /** Notes whose files have gone: matched against new files to detect moves, deleted at the end. */
  missing: Map<string, NoteRow>;
  affectedKeys: Set<string>;
  changes: NoteChange[];
  structure: boolean;
}

const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const lenientUtf8 = new TextDecoder('utf-8', { ignoreBOM: true });
const MAX_CONTEXT_LENGTH = 240;

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Decodes UTF-8 exactly (a byte-order mark is kept so saving round-trips the file). */
export function decodeNote(bytes: Uint8Array): { text: string; valid: boolean } {
  try {
    return { text: utf8.decode(bytes), valid: true };
  } catch {
    return { text: lenientUtf8.decode(bytes), valid: false };
  }
}

function contextLine(line: string | undefined): string {
  const trimmed = (line ?? '').replace(/\r$/, '').trim();
  return trimmed.length > MAX_CONTEXT_LENGTH
    ? `${trimmed.slice(0, MAX_CONTEXT_LENGTH - 1)}…`
    : trimmed;
}

function targetNameKey(target: string): string {
  const key = linkTargetKey(target);
  return key.slice(key.lastIndexOf('/') + 1);
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export function createNoteIndexer(deps: NoteIndexerDependencies): NoteIndexer {
  const { vault, repo, clock, ids, logger, events, settings } = deps;
  const chunkSize = deps.chunkSize ?? 200;
  const resolver = new LinkResolver();
  const docByNoteId = new Map<string, number>();
  let folderSet = new Set<string>();
  let classifier = createClassifier(settings.notes().ignorePatterns);
  let scanning: Promise<IndexResult> | null = null;
  let state: IndexStatus['state'] = 'starting';
  let progress = { processed: 0, total: 0 };
  let lastScan: { at: string; ms: number } | null = null;
  let lastProgressEvent = 0;

  const absolute = (relativePath: string) => path.join(vault.root, ...relativePath.split('/'));

  /** Case-sensitive existence check: on Windows and macOS `existsSync` ignores case, which would
   * make a case-only rename look like a copy. */
  const existsExactly = (relativePath: string) => {
    const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
    try {
      return readdirSync(absolute(folderOf(relativePath))).includes(name);
    } catch {
      return false;
    }
  };

  const loadResolver = () => {
    for (const id of [...docByNoteId.keys()]) resolver.removeNote(id);
    docByNoteId.clear();
    for (const note of repo.resolvable()) {
      resolver.setNote(note);
      docByNoteId.set(note.id, note.docId);
    }
    for (const attachment of repo.allAttachments())
      resolver.setAttachment({ path: attachment.path });
  };
  loadResolver();

  const status = (): IndexStatus => ({
    state,
    notes: resolver.noteCount,
    attachments: resolver.attachmentCount,
    processed: state === 'scanning' ? progress.processed : 0,
    total: state === 'scanning' ? progress.total : 0,
    lastScanAt: lastScan?.at ?? null,
    lastScanMs: lastScan?.ms ?? null,
  });

  const publishStatus = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressEvent < 250) return;
    lastProgressEvent = now;
    events.publish({ type: 'index.status', status: status() });
  };

  const newBatch = (origin: ChangeOrigin): BatchContext => ({
    origin,
    missing: new Map(),
    affectedKeys: new Set(),
    changes: [],
    structure: false,
  });

  const addFolderWithParents = (folder: string, batch?: BatchContext) => {
    for (let current = folder; current !== ''; current = folderOf(current)) {
      if (folderSet.has(current)) break;
      folderSet.add(current);
      if (batch) batch.structure = true;
    }
  };

  const keysOf = (notePath: string, title: string, aliases: readonly string[]) => [
    normaliseKey(noteNameFromPath(notePath)),
    normaliseKey(title),
    ...aliases.map(normaliseKey),
  ];

  const resolveLink = (
    target: string,
    sourcePath: string,
    sourceDoc: number,
  ): LinkResolutionRow => {
    if (target.trim() === '')
      return { targetKind: 'note', targetDoc: sourceDoc, targetPath: sourcePath, ambiguous: false };
    const result = resolver.resolve(target, sourcePath);
    if (result.kind === 'note') {
      return {
        targetKind: 'note',
        targetDoc: docByNoteId.get(result.noteId) ?? null,
        targetPath: result.path,
        ambiguous: result.ambiguous,
      };
    }
    if (result.kind === 'attachment') {
      return {
        targetKind: 'attachment',
        targetDoc: null,
        targetPath: result.path,
        ambiguous: result.ambiguous,
      };
    }
    return { targetKind: 'unresolved', targetDoc: null, targetPath: null, ambiguous: false };
  };

  const removeNoteRow = (row: NoteRow, batch: BatchContext) => {
    for (const key of keysOf(row.path, row.title, repo.aliases(row.docId)))
      batch.affectedKeys.add(key);
    repo.delete(row.docId);
    resolver.removeNote(row.id);
    docByNoteId.delete(row.id);
    batch.changes.push({
      kind: 'deleted',
      id: row.id as NoteChange['id'],
      path: row.path,
      from: null,
      hash: null,
      origin: batch.origin,
    });
    batch.structure = true;
  };

  const removeAttachmentPath = (attachmentPath: string, batch: BatchContext) => {
    if (!repo.attachment(attachmentPath)) return;
    repo.deleteAttachment(attachmentPath);
    resolver.removeAttachment(attachmentPath);
    const name = attachmentPath.slice(attachmentPath.lastIndexOf('/') + 1);
    batch.affectedKeys.add(normaliseKey(name));
    batch.affectedKeys.add(targetNameKey(name));
    batch.structure = true;
  };

  const indexAttachment = (relativePath: string, stats: Stats, batch: BatchContext) => {
    const existing = repo.attachment(relativePath);
    const mtimeMs = Math.trunc(stats.mtimeMs);
    if (existing && existing.sizeBytes === stats.size && existing.mtimeMs === mtimeMs) return;
    const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
    repo.upsertAttachment({
      path: relativePath,
      nameKey: normaliseKey(name),
      sizeBytes: stats.size,
      mtimeMs,
      mediaType: mediaTypeFor(relativePath),
      indexedAt: clock.now().toISOString(),
    });
    if (!existing) {
      resolver.setAttachment({ path: relativePath });
      batch.affectedKeys.add(normaliseKey(name));
      batch.affectedKeys.add(targetNameKey(name));
      batch.structure = true;
    }
  };

  /** Writes an id into a note file, returning the new text, or null when the frontmatter is invalid. */
  const persistId = (
    file: string,
    text: string,
    analysis: NoteAnalysis,
    id: string,
  ): string | null => {
    const updated = withPersistedId(text, analysis.frontmatter, id);
    if (updated === null) return null;
    writeFileAtomic(file, updated);
    return updated;
  };

  const indexNote = (relativePath: string, batch: BatchContext): void => {
    const file = absolute(relativePath);
    let stats = statSync(file);
    let bytes: Uint8Array = readFileSync(file);
    let hash = sha256(bytes);
    const existing = repo.byPath(relativePath);
    if (existing && existing.contentHash === hash) {
      const mtimeMs = Math.trunc(stats.mtimeMs);
      if (existing.mtimeMs !== mtimeMs)
        repo.touch(existing.docId, mtimeMs, new Date(stats.mtimeMs).toISOString());
      return;
    }

    const decoded = decodeNote(bytes);
    let text = decoded.text;
    let analysis = analyseNote(text);
    const warnings: NoteWarning[] = [];
    const editable = decoded.valid && text.length <= MAX_NOTE_LENGTH;
    const rewrite = (id: string): boolean => {
      if (!editable) return false;
      const updated = persistId(file, text, analysis, id);
      if (updated === null) return false;
      text = updated;
      bytes = Buffer.from(updated, 'utf8');
      hash = sha256(bytes);
      stats = statSync(file);
      analysis = analyseNote(text);
      return true;
    };

    // Identity: a persisted id wins; otherwise keep the row at this path, or adopt a moved row.
    let row: NoteRow | undefined = existing;
    let movedFrom: string | null = null;
    let id: string;
    let idPersisted = false;
    const stored = persistedIdOf(analysis.frontmatter);
    if (stored) {
      const owner = repo.byId(stored.id);
      if (owner && owner.path !== relativePath) {
        const ownerGone = batch.missing.has(owner.path) || !existsExactly(owner.path);
        if (ownerGone) {
          if (existing) removeNoteRow(existing, batch);
          batch.missing.delete(owner.path);
          row = owner;
          movedFrom = owner.path;
          id = stored.id;
          idPersisted = true;
        } else {
          // A copied file: the original keeps the id and the copy gets its own.
          id = existing?.id ?? ids('note');
          idPersisted = rewrite(id);
          warnings.push({
            code: 'duplicate-id',
            message: idPersisted
              ? `This note had the same id as "${owner.path}" (probably a copy), so it was given a new id.`
              : `This note has the same id as "${owner.path}". Remove the id from one of them.`,
          });
        }
      } else {
        id = stored.id;
        idPersisted = true;
      }
    } else {
      const moved = existing
        ? undefined
        : [...batch.missing.values()].find((candidate) => candidate.contentHash === hash);
      if (moved) {
        batch.missing.delete(moved.path);
        row = moved;
        movedFrom = moved.path;
      }
      id = row?.id ?? ids('note');
      if (settings.notes().assignIds === 'on-index') idPersisted = rewrite(id);
    }

    if (!decoded.valid) {
      warnings.push({
        code: 'not-utf8',
        message: 'The file is not valid UTF-8 text, so it is read-only here to avoid damaging it.',
      });
    } else if (text.length > MAX_NOTE_LENGTH) {
      warnings.push({
        code: 'too-large',
        message: 'The note is too large to edit here, so it is read-only.',
      });
    }
    if (analysis.frontmatterError)
      warnings.push({ code: 'frontmatter-invalid', message: analysis.frontmatterError });
    if (hasForeignId(analysis.frontmatter)) {
      warnings.push({
        code: 'foreign-id',
        message:
          'The "id" property is not an application id, so it is left alone; the application uses "skb-id" instead.',
      });
    }

    const title = analysis.title ?? noteNameFromPath(relativePath);
    const aliases = [...new Set(analysis.aliases.map((alias) => alias.trim()).filter(Boolean))];
    const now = clock.now().toISOString();
    const data: NoteData = {
      id,
      path: relativePath,
      pathKey: linkTargetKey(relativePath),
      nameKey: normaliseKey(noteNameFromPath(relativePath)),
      title,
      titleKey: normaliseKey(title),
      type: analysis.type,
      moduleCode: analysis.module,
      lectureKey: analysis.lecture,
      frontmatterJson: JSON.stringify(analysis.frontmatter) ?? '{}',
      contentHash: hash,
      sizeBytes: stats.size,
      mtimeMs: Math.trunc(stats.mtimeMs),
      wordCount: analysis.wordCount,
      idPersisted,
      warningsJson: JSON.stringify(warnings),
      createdAt:
        isoDate(analysis.created) ??
        row?.createdAt ??
        new Date(stats.birthtimeMs || stats.mtimeMs).toISOString(),
      updatedAt: new Date(stats.mtimeMs).toISOString(),
      indexedAt: now,
    };

    if (row) {
      for (const key of keysOf(row.path, row.title, repo.aliases(row.docId)))
        batch.affectedKeys.add(key);
      if (row.id !== id) {
        resolver.removeNote(row.id);
        docByNoteId.delete(row.id);
      }
      repo.update(row.docId, data);
    }
    const docId = row ? row.docId : repo.insert(data);
    for (const key of keysOf(relativePath, title, aliases)) batch.affectedKeys.add(key);
    resolver.setNote({ id, path: relativePath, title, aliases });
    docByNoteId.set(id, docId);

    repo.setAliases(
      docId,
      aliases.map((alias) => ({ alias, key: normaliseKey(alias) })),
    );
    repo.setTags(docId, analysis.tags);
    repo.setFts(docId, {
      title: [title, ...aliases].join('\n'),
      headings: analysis.headings.map((heading) => heading.text).join('\n'),
      body: analysis.searchText,
      tags: analysis.tags.join(' '),
    });
    const lines = text.split('\n');
    const links: LinkInsert[] = analysis.links.map((link, ordinal) => ({
      ordinal,
      syntax: link.syntax,
      embed: link.embed,
      targetRaw: link.target,
      targetNameKey: targetNameKey(link.target),
      heading: link.heading,
      blockRef: link.blockRef,
      alias: link.alias,
      line: link.line,
      column: link.column,
      context: contextLine(lines[link.line - 1]),
      ...resolveLink(link.target, relativePath, docId),
    }));
    repo.setLinks(docId, links);

    addFolderWithParents(folderOf(relativePath), batch);
    const kind: NoteChange['kind'] = movedFrom ? 'moved' : row ? 'updated' : 'created';
    if (kind !== 'updated') batch.structure = true;
    batch.changes.push({
      kind,
      id: id as NoteChange['id'],
      path: relativePath,
      from: movedFrom,
      hash,
      origin: batch.origin,
    });
  };

  /** Indexes one file of any kind; a vanished or ignored file is treated as removed. */
  const indexPath = (relativePath: string, batch: BatchContext) => {
    const kind = classifier.classifyFile(relativePath);
    let stats: Stats | null = null;
    try {
      stats = statSync(absolute(relativePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!stats?.isFile() || kind === 'ignored') {
      const note = repo.byPath(relativePath);
      if (note) batch.missing.set(note.path, note);
      removeAttachmentPath(relativePath, batch);
      return;
    }
    if (kind === 'note') {
      removeAttachmentPath(relativePath, batch);
      indexNote(relativePath, batch);
    } else {
      const note = repo.byPath(relativePath);
      if (note) batch.missing.set(note.path, note);
      indexAttachment(relativePath, stats, batch);
      addFolderWithParents(folderOf(relativePath), batch);
    }
  };

  const reResolve = (batch: BatchContext) => {
    for (const link of repo.linksByNameKeys(batch.affectedKeys)) {
      const next = resolveLink(link.targetRaw, link.sourcePath, link.sourceDoc);
      if (
        next.targetKind !== link.targetKind ||
        next.targetDoc !== link.targetDoc ||
        next.targetPath !== link.targetPath ||
        next.ambiguous !== link.ambiguous
      ) {
        repo.updateLinkResolution(link.linkId, next);
      }
    }
  };

  /** Deletes rows for notes that are really gone (re-checked: the service may have recreated them). */
  const finishBatch = (batch: BatchContext) => {
    for (const row of batch.missing.values()) {
      const current = repo.byDoc(row.docId);
      if (!current || current.path !== row.path) continue;
      if (!existsExactly(row.path) || classifier.classifyFile(row.path) !== 'note')
        removeNoteRow(current, batch);
    }
    batch.missing.clear();
    reResolve(batch);
  };

  const publishChanges = (batch: BatchContext): IndexResult => {
    if (batch.changes.length > 0 || batch.structure) {
      events.publish({ type: 'vault.changed', notes: batch.changes, structure: batch.structure });
    }
    return { notes: batch.changes, structure: batch.structure };
  };

  /** Runs `fn` in a transaction; on failure the in-memory resolver is rebuilt from the database. */
  const transact = (fn: () => void) => {
    try {
      repo.transaction(fn);
    } catch (error) {
      loadResolver();
      throw error;
    }
  };

  const safeIndexPath = (relativePath: string, batch: BatchContext) => {
    try {
      indexPath(relativePath, batch);
    } catch (error) {
      logger.warn('Could not index a vault file', { path: relativePath, error });
    }
  };

  const apply = (input: IndexBatch, origin: ChangeOrigin): IndexResult => {
    const batch = newBatch(origin);
    transact(() => {
      for (const folder of input.removedFolders ?? []) {
        for (const known of [...folderSet]) {
          if (known === folder || known.startsWith(`${folder}/`)) {
            folderSet.delete(known);
            batch.structure = true;
          }
        }
        for (const note of repo.inFolder(folder)) batch.missing.set(note.path, note);
        for (const attachment of repo.allAttachments()) {
          if (attachment.path.startsWith(`${folder}/`) && !existsSync(absolute(attachment.path))) {
            removeAttachmentPath(attachment.path, batch);
          }
        }
      }
      for (const folder of input.addedFolders ?? []) {
        if (!classifier.isIgnoredFolder(folder) && existsSync(absolute(folder)))
          addFolderWithParents(folder, batch);
      }
      for (const removed of input.removed ?? []) safeIndexPath(removed, batch);
      for (const changed of new Set(input.changed ?? [])) safeIndexPath(changed, batch);
      finishBatch(batch);
    });
    return publishChanges(batch);
  };

  const runScan = async (): Promise<IndexResult> => {
    const started = performance.now();
    state = 'scanning';
    progress = { processed: 0, total: 0 };
    publishStatus(true);
    const batch = newBatch('external');
    try {
      const scan = scanVault(vault.root, classifier);
      for (const error of scan.errors) logger.warn('Could not read part of the vault', error);
      const previousFolders = folderSet;
      folderSet = new Set(scan.folders);
      if (
        previousFolders.size !== folderSet.size ||
        [...folderSet].some((folder) => !previousFolders.has(folder))
      ) {
        batch.structure = true;
      }

      const notesOnDisk = new Map(
        scan.files.filter((file) => file.kind === 'note').map((file) => [file.path, file]),
      );
      const attachmentsOnDisk = scan.files.filter((file) => file.kind === 'attachment');
      const rows = repo.all();
      for (const row of rows) {
        if (!notesOnDisk.has(row.path)) batch.missing.set(row.path, row);
      }
      const rowsByPath = new Map(rows.map((row) => [row.path, row]));
      // Older files first, so an original keeps its id over a later copy of it.
      const toIndex = [...notesOnDisk.values()]
        .filter((file) => {
          const row = rowsByPath.get(file.path);
          return !row || row.sizeBytes !== file.sizeBytes || row.mtimeMs !== file.mtimeMs;
        })
        .sort((a, b) => a.birthtimeMs - b.birthtimeMs || (a.path < b.path ? -1 : 1));

      const knownAttachments = new Map(repo.allAttachments().map((row) => [row.path, row]));
      const attachmentChanges = attachmentsOnDisk.filter((file) => {
        const row = knownAttachments.get(file.path);
        knownAttachments.delete(file.path);
        return !row || row.sizeBytes !== file.sizeBytes || row.mtimeMs !== file.mtimeMs;
      });

      progress.total = toIndex.length + attachmentChanges.length;
      const work = [
        ...toIndex.map((file) => file.path),
        ...attachmentChanges.map((file) => file.path),
      ];
      for (let index = 0; index < work.length; index += chunkSize) {
        const chunk = work.slice(index, index + chunkSize);
        transact(() => {
          for (const relativePath of chunk) safeIndexPath(relativePath, batch);
        });
        progress.processed += chunk.length;
        publishStatus();
        await yieldToEventLoop();
      }
      transact(() => {
        for (const stale of knownAttachments.keys()) removeAttachmentPath(stale, batch);
        finishBatch(batch);
      });
      lastScan = { at: clock.now().toISOString(), ms: Math.round(performance.now() - started) };
      logger.info('Vault index is up to date', {
        notes: resolver.noteCount,
        attachments: resolver.attachmentCount,
        reindexed: toIndex.length,
        ms: lastScan.ms,
      });
    } finally {
      state = 'ready';
      publishStatus(true);
    }
    return publishChanges(batch);
  };

  settings.onNotesChange((next, previous) => {
    if (next.ignorePatterns.join('\n') === previous.ignorePatterns.join('\n')) return;
    classifier = createClassifier(next.ignorePatterns);
    void indexer
      .scan()
      .catch((error) => logger.error('Re-scan after a settings change failed', { error }));
  });

  const indexer: NoteIndexer = {
    resolver,
    status,
    folders: () => [...folderSet].sort(),
    classifier: () => classifier,
    absolute,
    scan() {
      scanning ??= runScan().finally(() => {
        scanning = null;
      });
      return scanning;
    },
    async whenIdle() {
      while (scanning) await scanning.catch(() => undefined);
    },
    apply,
    ensurePersistentId(noteId) {
      const row = repo.byId(noteId);
      if (!row) throw new NotFoundError('That note does not exist.');
      if (row.idPersisted) return row;
      const file = absolute(row.path);
      const decoded = decodeNote(readFileSync(file));
      if (!decoded.valid)
        throw new ValidationError('The note is not valid UTF-8 text, so its id cannot be saved.');
      const analysis = analyseNote(decoded.text);
      const updated = withPersistedId(decoded.text, analysis.frontmatter, row.id);
      if (updated === null) {
        throw new ValidationError(
          `The frontmatter of "${row.path}" is not valid YAML, so its id cannot be saved. Fix the frontmatter first.`,
        );
      }
      writeFileAtomic(file, updated);
      apply({ changed: [row.path] }, 'app');
      const persisted = repo.byId(noteId);
      if (!persisted?.idPersisted)
        throw new Error(`Saving the id of ${row.path} did not take effect.`);
      return persisted;
    },
  };
  return indexer;
}
