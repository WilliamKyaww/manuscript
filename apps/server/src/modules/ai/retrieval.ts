import {
  type AskFilter,
  type AskScope,
  anyTermQuery,
  estimateTokens,
  type Locator,
  LocatorSchema,
  type NoteHeading,
  type Passage,
  questionTerms,
  reciprocalRankFusion,
} from '@skb/core';
import type { Logger } from '../../shared/logger';
import type { LearningRepository } from '../learning/repository';
import type { NotesService } from '../notes/service';
import type { EmbeddingService } from './embeddings/service';
import type { ChunkRow, NoteHit, RetrievalRepository, ScopeFilter } from './retrieval-repository';

/**
 * Retrieval for grounded answers (task 10.07, agent-system.md §5, ADR-0010). Three rankings are
 * fused by reciprocal rank: full-text matches of the question's words, semantic neighbours (when
 * embeddings exist) and passages naming the concepts the question mentions or their neighbours in
 * the graph (two steps at most). The best passages are packed into the token budget and given
 * citation keys S1…Sn. Fusion lives here rather than in the search service, so that search never
 * depends on the AI layer.
 */

export interface RetrievedPassage extends Passage {
  tokens: number;
}

export interface RetrievalDependencies {
  repo: RetrievalRepository;
  learning: LearningRepository;
  embeddings: EmbeddingService;
  notes: NotesService;
  logger: Logger;
}

export type RetrievalService = ReturnType<typeof createRetrievalService>;

const MAX_PASSAGES = 12;
const NOTE_PASSAGE_CHARS = 1_600;
const CONCEPT_LIMIT = 12;

type Candidate = { kind: 'chunk'; chunk: ChunkRow } | { kind: 'note'; note: NoteHit };
const keyOf = (candidate: Candidate) =>
  candidate.kind === 'chunk' ? `chunk:${candidate.chunk.chunkId}` : `note:${candidate.note.id}`;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Whether a phrase occurs in the text as whole words, ignoring case. */
const mentions = (text: string, phrase: string) =>
  phrase.trim().length > 1 &&
  new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(
    text,
  );

function truncate(text: string, chars: number): string {
  if (text.length <= chars) return text;
  const cut = text.slice(0, chars);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), chars - 80)).trimEnd()} …`;
}

/** A note's sections by heading (the opening before the first heading counts as one). */
function sections(content: string, headings: readonly NoteHeading[]) {
  const lines = content.split('\n');
  // Skip frontmatter: its fields are not prose to cite.
  let first = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
    if (end > 0) first = end + 1;
  }
  const starts = [{ line: first + 1, path: [] as string[] }];
  const path: string[] = [];
  for (const heading of headings) {
    path.length = heading.level - 1;
    path[heading.level - 1] = heading.text;
    starts.push({ line: heading.line, path: path.filter(Boolean) });
  }
  return starts
    .map((start, index) => {
      const end = (starts[index + 1]?.line ?? lines.length + 1) - 1;
      return {
        line: start.line,
        headingPath: start.path,
        text: lines
          .slice(start.line - 1, end)
          .join('\n')
          .trim(),
      };
    })
    .filter((section) => section.text.length > 0);
}

export function createRetrievalService(deps: RetrievalDependencies) {
  const { repo, learning, embeddings, notes, logger } = deps;

  function scopeFilter(filter: AskFilter): ScopeFilter {
    const scope: ScopeFilter = {};
    if (filter.moduleId) {
      const module = learning.module(filter.moduleId);
      if (module) scope.moduleCodeKey = module.codeKey;
    }
    if (filter.lectureId) {
      const lecture = learning.lecture(filter.lectureId);
      const module = lecture ? learning.module(lecture.moduleId) : null;
      if (lecture && module)
        scope.lecture = { id: lecture.id, codeKey: module.codeKey, keyNorm: lecture.keyNorm };
    }
    if (filter.sourceIds?.length) scope.sourceIds = filter.sourceIds;
    return scope;
  }

  /** Concepts the question names (or the filter gives), widened by up to two relation steps. */
  function conceptNeighbourhood(question: string, seeds: readonly string[]) {
    const all = repo.conceptNames();
    const named = all
      .filter((concept) => concept.names.some((name) => mentions(question, name)))
      .map((concept) => concept.id);
    const found = [...new Set([...seeds, ...named])];
    const near = repo.relatedConcepts(found).filter((id) => !found.includes(id));
    const far = repo
      .relatedConcepts(near)
      .filter((id) => !found.includes(id) && !near.includes(id));
    const ids = [...found, ...near, ...far].slice(0, CONCEPT_LIMIT);
    const byId = new Map(all.map((concept) => [concept.id, concept]));
    return {
      ids,
      names: ids.flatMap((id) => byId.get(id)?.names ?? []),
      backingNotes: ids.flatMap((id) => byId.get(id)?.noteId ?? []),
    };
  }

  function notePassage(
    note: NoteHit,
    terms: readonly string[],
  ): Omit<RetrievedPassage, 'key'> | null {
    let detail: ReturnType<NotesService['get']>;
    try {
      detail = notes.get(note.id);
    } catch {
      return null;
    }
    const scored = sections(detail.content, detail.headings).map((section) => ({
      section,
      score: terms.filter((term) => section.text.toLowerCase().includes(term)).length,
    }));
    const best = scored.sort((a, b) => b.score - a.score)[0]?.section;
    if (!best) return null;
    const text = truncate(best.text, NOTE_PASSAGE_CHARS);
    const locator: Locator = {
      kind: 'markdown',
      noteId: note.id,
      headingPath: best.headingPath,
      line: best.line,
    };
    return {
      kind: 'note',
      title: note.title,
      label: best.headingPath.at(-1) ?? 'Note',
      locator,
      text,
      tokens: estimateTokens(text),
    };
  }

  function chunkPassage(chunk: ChunkRow): Omit<RetrievedPassage, 'key'> | null {
    const locator = LocatorSchema.safeParse(JSON.parse(chunk.locatorJson));
    if (!locator.success) return null;
    return {
      kind: 'source',
      title: chunk.title,
      label: chunk.label,
      locator: locator.data,
      text: chunk.text,
      tokens: estimateTokens(chunk.text),
    };
  }

  return {
    async retrieve(input: {
      question: string;
      scope: AskScope;
      filter: AskFilter;
      budgetTokens: number;
      signal?: AbortSignal;
    }): Promise<{ passages: RetrievedPassage[]; concepts: string[] }> {
      const filter = scopeFilter(input.filter);
      const withNotes = input.scope !== 'sources';
      const terms = questionTerms(input.question);
      const match = anyTermQuery(terms);
      const concepts = conceptNeighbourhood(input.question, input.filter.conceptIds ?? []);
      const conceptMatch = anyTermQuery(concepts.names.map((name) => name.toLowerCase()));

      const lists: { items: Candidate[]; weight?: number }[] = [];
      const chunks = (rows: ChunkRow[]) => rows.map((chunk) => ({ kind: 'chunk' as const, chunk }));
      const noteItems = (rows: NoteHit[]) => rows.map((note) => ({ kind: 'note' as const, note }));
      if (match) lists.push({ items: chunks(repo.chunks(match, filter, 30)) });
      if (conceptMatch)
        lists.push({ items: chunks(repo.chunks(conceptMatch, filter, 15)), weight: 0.6 });
      if (withNotes && match) lists.push({ items: noteItems(repo.notes(match, filter, 10)) });
      if (withNotes && concepts.ids.length) {
        const ids = [
          ...new Set([...concepts.backingNotes, ...repo.notesMentioning(concepts.ids, 10)]),
        ];
        lists.push({ items: noteItems(repo.notesByIds(ids, filter)), weight: 0.6 });
      }
      if (embeddings.available()) {
        try {
          const hits = await embeddings.similar(input.question, {
            limit: 40,
            purpose: 'ask',
            signal: input.signal,
          });
          const chunkOrder = hits
            .filter((hit) => hit.type === 'chunk')
            .map((hit) => Number(hit.id));
          const byChunk = new Map(
            repo.chunksByIds(chunkOrder, filter).map((row) => [row.chunkId, row]),
          );
          lists.push({ items: chunks(chunkOrder.flatMap((id) => byChunk.get(id) ?? [])) });
          if (withNotes) {
            const noteOrder = hits.filter((hit) => hit.type === 'note').map((hit) => hit.id);
            const byNote = new Map(repo.notesByIds(noteOrder, filter).map((row) => [row.id, row]));
            lists.push({ items: noteItems(noteOrder.flatMap((id) => byNote.get(id) ?? [])) });
          }
        } catch (error) {
          // Semantic search is a bonus: without it, the full-text ranking still answers.
          logger.warn('ai.retrieve.semantic-failed', { error });
        }
      }

      const fused = reciprocalRankFusion(lists, keyOf);
      const passages: RetrievedPassage[] = [];
      let remaining = input.budgetTokens;
      for (const { item } of fused) {
        if (passages.length === MAX_PASSAGES || remaining < 100) break;
        const passage =
          item.kind === 'chunk' ? chunkPassage(item.chunk) : notePassage(item.note, terms);
        if (!passage || passage.tokens > remaining) continue;
        remaining -= passage.tokens;
        passages.push({ ...passage, key: `S${passages.length + 1}` });
      }
      return { passages, concepts: concepts.names };
    },
  };
}
