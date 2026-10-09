import {
  type ConceptDetail,
  type ConceptInputSchema,
  type ConceptSummary,
  ConflictError,
  type Id,
  type IdFactory,
  NotFoundError,
  ValidationError,
} from '@skb/core';
import { normaliseKey } from '@skb/core/markdown';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { NoteIndexer } from '../notes/indexer';
import type { NotesRepository } from '../notes/repository';
import type { SearchService } from '../search/service';
import type { ConceptListRow, ConceptRow, ConceptsRepository } from './repository';

/**
 * Concepts (task 6.07, ADR-0020). Names and aliases share one case-insensitive namespace, so a
 * `[[link]]` names at most one concept; after every change the notes index is told which concepts
 * exist and re-resolves the links they affect (task 6.08).
 */

type ConceptInput = z.infer<typeof ConceptInputSchema>;

export interface ConceptsDependencies {
  repo: ConceptsRepository;
  notesRepo: NotesRepository;
  indexer: NoteIndexer;
  search: SearchService;
  clock: Clock;
  ids: IdFactory;
}

const PASSAGES = 8;

/** URL-friendly form of a name: `CAP theorem` → `cap-theorem`. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'concept' : slug.slice(0, 80);
}

export function createConceptsService(deps: ConceptsDependencies) {
  const { repo, notesRepo, indexer, search, clock, ids } = deps;
  const now = () => clock.now().toISOString();

  const sync = () =>
    indexer.setConcepts(repo.all().map(({ id, name, aliases }) => ({ id, name, aliases })));

  const summaryOf = (row: ConceptListRow): ConceptSummary => ({
    id: row.id as ConceptSummary['id'],
    name: row.name,
    slug: row.slug,
    aliases: row.aliases,
    summary: row.summary,
    importance: row.importance,
    moduleIds: row.moduleIds as ConceptSummary['moduleIds'],
    topicIds: row.topicIds as ConceptSummary['topicIds'],
    noteId: row.noteId as ConceptSummary['noteId'],
    mentionCount: row.mentionCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  const listRow = (id: string): ConceptListRow => {
    const row = repo.all().find((candidate) => candidate.id === id);
    if (!row) throw new NotFoundError('That concept does not exist.');
    return row;
  };

  /** Every name and alias must be free, or already this concept's. */
  const claim = (name: string, aliases: readonly string[], conceptId: string | null) => {
    const entries = [name, ...aliases].map((label) => ({ label, key: normaliseKey(label) }));
    const seen = new Set<string>();
    for (const { label, key } of entries) {
      if (seen.has(key)) throw new ValidationError(`“${label}” is listed twice.`);
      seen.add(key);
      const owner = repo.keyOwner(key);
      if (owner && owner.id !== conceptId)
        throw new ConflictError(
          `“${label}” is already the name or an alias of the concept “${owner.name}”.`,
        );
    }
    const nameKey = normaliseKey(name);
    return { nameKey, aliases: entries.slice(1).map(({ label, key }) => ({ alias: label, key })) };
  };

  const uniqueSlug = (name: string, conceptId: string | null) => {
    const base = slugify(name);
    for (let suffix = 1; ; suffix += 1) {
      const slug = suffix === 1 ? base : `${base}-${suffix}`;
      if (!repo.slugTaken(slug, conceptId)) return slug;
    }
  };

  const checkMemberships = (input: Partial<ConceptInput>) => {
    if (input.moduleIds) {
      const found = repo.existingModules(input.moduleIds);
      if (input.moduleIds.some((id) => !found.has(id)))
        throw new ValidationError('A module does not exist.');
    }
    if (input.topicIds) {
      const found = repo.topicsWithModules(input.topicIds);
      if (found.length !== new Set(input.topicIds).size)
        throw new ValidationError('A topic does not exist.');
    }
  };

  /** A backing note is referred to by id, so its id is saved into the file (ADR-0025). */
  const backingNote = (noteId: string | null | undefined): string | null => {
    if (!noteId) return null;
    if (!notesRepo.byId(noteId)) throw new ValidationError('That note does not exist.');
    indexer.ensurePersistentId(noteId);
    return noteId;
  };

  const detail = (id: string): ConceptDetail => {
    const row = listRow(id);
    const note = row.noteId ? notesRepo.byId(row.noteId) : null;
    const mentions = new Map<string, ConceptDetail['mentions'][number]>();
    for (const mention of repo.mentions(id)) {
      let entry = mentions.get(mention.noteId);
      if (!entry) {
        entry = {
          note: { id: mention.noteId as Id<'note'>, path: mention.path, title: mention.title },
          lines: [],
        };
        mentions.set(mention.noteId, entry);
      }
      entry.lines.push({ line: mention.line, context: mention.context });
    }
    return {
      ...summaryOf(row),
      modules: repo.modules(row.moduleIds).map((module) => ({
        ...module,
        id: module.id as ConceptDetail['modules'][number]['id'],
      })),
      topics: repo.topicsWithModules(row.topicIds).map((topic) => ({
        ...topic,
        id: topic.id as ConceptDetail['topics'][number]['id'],
        moduleId: topic.moduleId as ConceptDetail['topics'][number]['moduleId'],
      })),
      note: note ? { id: note.id as Id<'note'>, path: note.path, title: note.title } : null,
      mentions: [...mentions.values()],
      passages: search.sourcePassages([row.name, ...row.aliases], PASSAGES),
    };
  };

  return {
    sync,

    list: (): ConceptSummary[] => repo.all().map(summaryOf),

    get: detail,

    /** Creates a concept; `ai` when it comes from an accepted proposal. */
    create(input: ConceptInput, createdBy: 'user' | 'ai' = 'user'): ConceptSummary {
      const name = input.name.trim();
      const id = ids('concept');
      repo.transaction(() => {
        const { nameKey, aliases } = claim(name, input.aliases ?? [], null);
        checkMemberships(input);
        repo.insert(
          {
            id,
            name,
            nameKey,
            slug: uniqueSlug(name, null),
            summary: input.summary?.trim() ?? '',
            noteId: backingNote(input.noteId),
            importance: input.importance ?? 1,
            createdAt: now(),
          },
          createdBy,
        );
        repo.setAliases(id, aliases);
        repo.setModules(id, input.moduleIds ?? []);
        repo.setTopics(id, input.topicIds ?? []);
      });
      sync();
      return summaryOf(listRow(id));
    },

    update(id: string, input: Partial<ConceptInput>): ConceptSummary {
      const current = listRow(id);
      repo.transaction(() => {
        const name = input.name?.trim() ?? current.name;
        const { nameKey, aliases } = claim(name, input.aliases ?? current.aliases, id);
        checkMemberships(input);
        const row: ConceptRow = {
          ...current,
          name,
          nameKey,
          slug: name === current.name ? current.slug : uniqueSlug(name, id),
          summary: input.summary !== undefined ? input.summary.trim() : current.summary,
          noteId: input.noteId !== undefined ? backingNote(input.noteId) : current.noteId,
          importance: input.importance ?? current.importance,
          updatedAt: now(),
        };
        repo.update(row);
        if (input.aliases) repo.setAliases(id, aliases);
        if (input.moduleIds) repo.setModules(id, input.moduleIds);
        if (input.topicIds) repo.setTopics(id, input.topicIds);
      });
      sync();
      return summaryOf(listRow(id));
    },

    remove(id: string): void {
      listRow(id);
      repo.remove(id);
      sync();
    },
  };
}

export type ConceptsService = ReturnType<typeof createConceptsService>;
