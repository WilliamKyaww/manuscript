import { existsSync, readFileSync } from 'node:fs';
import {
  type Backlink,
  ConflictError,
  type CreateNoteBody,
  type Id,
  type LinkResolutionDto,
  type NoteDetail,
  type NoteSummary,
  type NoteTree,
  type NoteWarning,
  NotFoundError,
  type UnlinkedMention,
  ValidationError,
} from '@skb/core';
import {
  analyseNote,
  applyTextEdits,
  FrontmatterEditError,
  formatWikilink,
  isMarkdownPath,
  normaliseKey,
  noteNameFromPath,
  sanitiseFileName,
  setFrontmatterValues,
  toPortablePath,
} from '@skb/core/markdown';
import type { Clock } from '../../shared/clock';
import { writeFileAtomic } from '../../vault/atomic';
import type { Vault } from '../../vault/vault';
import type { SettingsService } from '../settings/service';
import { SOURCES_FOLDER } from './ignore';
import { decodeNote, type NoteIndexer, sha256 } from './indexer';
import { findMentions, mentionPhrases } from './mentions';
import type { NoteRow, NotesRepository } from './repository';
import { instantiateTemplate } from './templates';

/**
 * Notes as the API sees them (tasks 3.08, 3.10, 3.12). The file on disk is always the truth: reads
 * re-check its hash (re-indexing if it changed behind our back) and saves are refused with 409 if the
 * file is not the version the editor started from, so an external edit is never silently lost.
 */

export interface NotesService {
  tree(): NoteTree;
  get(id: string): NoteDetail;
  create(input: CreateNoteBody): NoteDetail;
  update(id: string, input: { content: string; baseHash: string }): NoteDetail;
  backlinks(id: string): { linked: Backlink[] };
  unlinkedMentions(id: string): { mentions: UnlinkedMention[]; truncated: boolean };
  linkMention(
    targetId: string,
    input: { sourceId: string; sourceHash: string; offset: number; text: string },
  ): { source: NoteSummary; link: string };
  tags(): { tag: string; count: number }[];
  templates(): { folder: string; templates: { id: Id<'note'>; path: string; title: string }[] };
}

export interface NotesServiceDependencies {
  vault: Vault;
  repo: NotesRepository;
  indexer: NoteIndexer;
  settings: SettingsService;
  clock: Clock;
}

const MAX_MENTION_SOURCES = 50;
const READ_ONLY_WARNINGS = new Set(['not-utf8', 'too-large']);

const asNoteId = (value: string) => value as Id<'note'>;

function summaryOf(row: NoteRow, aliases: string[]): NoteSummary {
  return {
    id: asNoteId(row.id),
    path: row.path,
    title: row.title,
    type: row.type,
    aliases,
    updatedAt: row.updatedAt,
  };
}

function warningsOf(row: NoteRow): NoteWarning[] {
  try {
    return JSON.parse(row.warningsJson) as NoteWarning[];
  } catch {
    return [];
  }
}

export function createNotesService({
  vault,
  repo,
  indexer,
  settings,
  clock,
}: NotesServiceDependencies): NotesService {
  const requireRow = (id: string): NoteRow => {
    const row = repo.byId(id);
    if (!row)
      throw new NotFoundError(
        'That note does not exist (it may have been deleted or renamed outside the app).',
      );
    return row;
  };

  /** Reads a note's file, re-indexing first if it changed on disk since it was indexed. */
  const readCurrent = (id: string): { row: NoteRow; text: string; hash: string; bytes: Buffer } => {
    let row = requireRow(id);
    const file = indexer.absolute(row.path);
    if (!existsSync(file)) {
      indexer.apply({ removed: [row.path] }, 'external');
      requireRow(id);
    }
    let bytes = readFileSync(file);
    let hash = sha256(bytes);
    if (hash !== row.contentHash) {
      indexer.apply({ changed: [row.path] }, 'external');
      row = requireRow(id);
      bytes = readFileSync(file);
      hash = sha256(bytes);
    }
    return { row, text: decodeNote(bytes).text, hash, bytes };
  };

  const toDetail = (row: NoteRow, text: string, hash: string): NoteDetail => {
    const analysis = analyseNote(text);
    const aliases = [...new Set(analysis.aliases.map((alias) => alias.trim()).filter(Boolean))];
    const resolutionOf = (target: string): LinkResolutionDto => {
      if (target.trim() === '')
        return { kind: 'note', noteId: asNoteId(row.id), path: row.path, ambiguous: false };
      const result = indexer.resolver.resolve(target, row.path);
      if (result.kind === 'note') return { ...result, noteId: asNoteId(result.noteId) };
      if (result.kind === 'concept')
        return { ...result, conceptId: result.conceptId as Id<'concept'> };
      return result;
    };
    return {
      ...summaryOf(row, aliases),
      content: text,
      hash,
      frontmatter: JSON.parse(row.frontmatterJson) as Record<string, unknown>,
      module: row.moduleCode,
      lecture: row.lectureKey,
      tags: analysis.tags,
      createdAt: row.createdAt,
      wordCount: row.wordCount,
      sizeBytes: row.sizeBytes,
      idPersisted: row.idPersisted,
      headings: analysis.headings.map(({ level, text: headingText, slug, line }) => ({
        level,
        text: headingText,
        slug,
        line,
      })),
      links: analysis.links.map((link) => ({
        syntax: link.syntax,
        embed: link.embed,
        target: link.target,
        heading: link.heading,
        blockRef: link.blockRef,
        alias: link.alias,
        line: link.line,
        column: link.column,
        resolution: resolutionOf(link.target),
      })),
      warnings: warningsOf(row),
    };
  };

  const detailAt = (path: string): NoteDetail => {
    const row = repo.byPath(path);
    if (!row) throw new Error(`The note at ${path} was written but could not be indexed.`);
    const bytes = readFileSync(indexer.absolute(path));
    return toDetail(row, decodeNote(bytes).text, sha256(bytes));
  };

  const validateNoteFolder = (folder: string): string => {
    const portable = toPortablePath(folder.trim()).replace(/\/+$/, '');
    if (portable === '') return '';
    vault.resolve(portable);
    if (indexer.classifier().isIgnoredFolder(portable)) {
      throw new ValidationError(`Notes cannot be created in "${portable}", which is not indexed.`);
    }
    if (indexer.classifier().classifyFile(`${portable}/x.md`) !== 'note') {
      throw new ValidationError(
        `Notes cannot be created in "${portable}": ${SOURCES_FOLDER}/ holds imported originals.`,
      );
    }
    return portable;
  };

  const uniquePath = (folder: string, name: string, extension: string): string => {
    const prefix = folder === '' ? '' : `${folder}/`;
    for (let attempt = 0; ; attempt += 1) {
      const candidate = `${prefix}${attempt === 0 ? name : `${name} ${attempt}`}${extension}`;
      if (!existsSync(vault.resolve(candidate))) return candidate;
    }
  };

  return {
    tree() {
      return {
        notes: repo.summaries().map((summary) => ({ ...summary, id: asNoteId(summary.id) })),
        folders: indexer.folders(),
        attachments: repo.allAttachments().map((attachment) => ({
          path: attachment.path,
          sizeBytes: attachment.sizeBytes,
          mediaType: attachment.mediaType,
          updatedAt: new Date(attachment.mtimeMs).toISOString(),
        })),
        index: indexer.status(),
      };
    },

    get(id) {
      const { row, text, hash } = readCurrent(id);
      return toDetail(row, text, hash);
    },

    create(input) {
      const folder = validateNoteFolder(input.folder ?? '');
      const title = input.title?.trim() || 'Untitled';
      let content = input.content ?? '';
      if (input.templateId) {
        const template = requireRow(input.templateId);
        const templatesFolder = settings.notes().templatesFolder;
        if (!template.path.startsWith(`${templatesFolder}/`)) {
          throw new ValidationError(
            `Only notes in the "${templatesFolder}" folder can be used as templates.`,
          );
        }
        const { text } = readCurrent(template.id);
        content = instantiateTemplate(text, {
          title,
          now: clock.now(),
          module: input.module ?? null,
          lecture: input.lecture ?? null,
        });
      }

      const name = sanitiseFileName(title);
      const path = uniquePath(folder, name, '.md');
      const additions: Record<string, unknown> = {};
      if (name !== title && !analyseNote(content).title) additions.title = title;
      if (input.module) additions.module = input.module;
      if (input.lecture) additions.lecture = input.lecture;
      if (Object.keys(additions).length > 0) {
        try {
          content = setFrontmatterValues(content, additions);
        } catch (error) {
          if (!(error instanceof FrontmatterEditError)) throw error;
        }
      }
      writeFileAtomic(vault.resolve(path), content);
      indexer.apply({ changed: [path] }, 'app');
      return detailAt(path);
    },

    update(id, { content, baseHash }) {
      const row = requireRow(id);
      const readOnly = warningsOf(row).find((warning) => READ_ONLY_WARNINGS.has(warning.code));
      if (readOnly) throw new ValidationError(`This note is read-only here: ${readOnly.message}`);
      const file = indexer.absolute(row.path);
      if (!existsSync(file)) {
        indexer.apply({ removed: [row.path] }, 'external');
        throw new ConflictError('The note was deleted or moved outside the app.', {
          details: { reason: 'deleted' },
        });
      }
      const current = readCurrent(id);
      if (current.hash !== baseHash) {
        throw new ConflictError('The note was changed outside the editor since you opened it.', {
          details: { reason: 'changed', currentHash: current.hash },
        });
      }
      if (current.text === content) return toDetail(current.row, current.text, current.hash);
      writeFileAtomic(file, content);
      indexer.apply({ changed: [current.row.path] }, 'app');
      return detailAt(current.row.path);
    },

    backlinks(id) {
      const row = requireRow(id);
      const grouped = new Map<string, Backlink>();
      for (const link of repo.backlinks(row.docId)) {
        let entry = grouped.get(link.sourceId);
        if (!entry) {
          entry = {
            source: { id: asNoteId(link.sourceId), path: link.sourcePath, title: link.sourceTitle },
            mentions: [],
          };
          grouped.set(link.sourceId, entry);
        }
        entry.mentions.push({
          line: link.line,
          column: link.column,
          embed: link.embed,
          context: link.context,
        });
      }
      return { linked: [...grouped.values()] };
    },

    unlinkedMentions(id) {
      const target = requireRow(id);
      const names = [noteNameFromPath(target.path), target.title, ...repo.aliases(target.docId)];
      const linking = repo.sourcesLinkingTo(target.docId);
      const candidates = new Set<number>();
      for (const phrase of mentionPhrases(names)) {
        try {
          for (const docId of repo.ftsPhraseMatches(phrase, MAX_MENTION_SOURCES * 4))
            candidates.add(docId);
        } catch {
          // A phrase that is not searchable (only punctuation, say) has no full-text candidates.
        }
      }
      candidates.delete(target.docId);
      for (const docId of linking) candidates.delete(docId);
      const sources = [...candidates]
        .map((docId) => repo.byDoc(docId))
        .filter((row): row is NoteRow => row !== undefined)
        .sort((a, b) => (a.path < b.path ? -1 : 1));

      const mentions: UnlinkedMention[] = [];
      let truncated = false;
      for (const source of sources) {
        if (mentions.length >= MAX_MENTION_SOURCES) {
          truncated = true;
          break;
        }
        const bytes = readFileSync(indexer.absolute(source.path));
        const matches = findMentions(decodeNote(bytes).text, names);
        if (matches.length === 0) continue;
        mentions.push({
          source: { id: asNoteId(source.id), path: source.path, title: source.title },
          sourceHash: sha256(bytes),
          matches,
        });
      }
      return { mentions, truncated };
    },

    linkMention(targetId, { sourceId, sourceHash, offset, text }) {
      const target = requireRow(targetId);
      const source = readCurrent(sourceId);
      if (source.hash !== sourceHash) {
        throw new ConflictError(
          'The note containing the mention has changed. Refresh and try again.',
          {
            details: { reason: 'changed', currentHash: source.hash },
          },
        );
      }
      const names = [noteNameFromPath(target.path), target.title, ...repo.aliases(target.docId)];
      const match = findMentions(source.text, names).find(
        (candidate) => candidate.offset === offset && candidate.text === text,
      );
      if (!match)
        throw new ValidationError('That text is no longer an unlinked mention of this note.');

      const linkTarget =
        indexer.resolver.linkTargetFor(target.id, source.row.path) ?? noteNameFromPath(target.path);
      const lineStart = source.text.lastIndexOf('\n', offset - 1) + 1;
      const inTable = source.text.slice(lineStart).trimStart().startsWith('|');
      const link =
        normaliseKey(linkTarget) === normaliseKey(text)
          ? formatWikilink({ target: text })
          : formatWikilink({ target: linkTarget, alias: text }, { escapePipe: inTable });
      writeFileAtomic(
        indexer.absolute(source.row.path),
        applyTextEdits(source.text, [{ offset, length: match.length, text: link }]),
      );
      indexer.apply({ changed: [source.row.path] }, 'app');
      const updated = requireRow(sourceId);
      return { source: summaryOf(updated, repo.aliases(updated.docId)), link };
    },

    tags() {
      return repo.tagCounts();
    },

    templates() {
      const folder = settings.notes().templatesFolder;
      return {
        folder,
        templates: repo
          .inFolder(folder)
          .filter((row) => isMarkdownPath(row.path))
          .map((row) => ({ id: asNoteId(row.id), path: row.path, title: row.title })),
      };
    },
  };
}
