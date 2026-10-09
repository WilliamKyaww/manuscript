import type { Locator } from '@skb/core';
import { noteNameFromPath } from '@skb/core/markdown';
import type { EmbeddingService } from '../ai/embeddings/service';
import type { ConceptsService } from '../concepts/service';
import { findMentions } from '../notes/mentions';
import type { NotesRepository } from '../notes/repository';
import type { NotesService } from '../notes/service';
import type { ProposalsService } from './proposals';
import type { ProposalsRepository } from './proposals-repository';

/**
 * Link suggestions (task 11.09): for one note, the notes and concepts it mentions by name without
 * linking to them (a link proposal that turns the words into a `[[link]]`), and — when semantic
 * search is on — the notes closest in meaning that it does not link to yet (a proposal to list them
 * under "Related"). Finding mentions needs no model; meaning needs embeddings.
 */

export interface LinkSuggesterDependencies {
  notes: NotesService;
  notesRepo: NotesRepository;
  concepts: ConceptsService;
  embeddings: EmbeddingService;
  proposals: ProposalsService;
  proposalsRepo: ProposalsRepository;
}

const MAX_MENTIONS = 20;
const MAX_RELATED = 3;
/** Cosine similarity a note must reach to be suggested as related. */
export const RELATED_THRESHOLD = 0.5;

export function createLinkSuggester(deps: LinkSuggesterDependencies) {
  const { notes, notesRepo, concepts, embeddings, proposals, proposalsRepo } = deps;

  return {
    suggest(noteId: string): { created: number } {
      const before = proposalsRepo.pendingCount();
      const note = notes.get(noteId);
      const lower = note.content.toLowerCase();
      const linked = new Set(
        note.links.flatMap((link) =>
          link.resolution.kind === 'note'
            ? [link.resolution.noteId as string]
            : link.resolution.kind === 'concept'
              ? [link.resolution.conceptId as string]
              : [],
        ),
      );
      const origin = {
        label: `Links for ${note.title}`,
        jobId: null,
        moduleId: null,
        lectureId: null,
        coveredIn: null,
      };
      const candidates = [
        ...concepts.list().map((concept) => ({
          kind: 'concept' as const,
          id: concept.id as string,
          title: concept.name,
          names: [concept.name, ...concept.aliases],
        })),
        ...notesRepo.all().map((row) => ({
          kind: 'note' as const,
          id: row.id,
          title: row.title,
          names: [row.title, noteNameFromPath(row.path)],
        })),
      ];
      const mentioned = new Set<string>();
      for (const candidate of candidates) {
        if (mentioned.size >= MAX_MENTIONS) break;
        if (candidate.id === noteId || linked.has(candidate.id)) continue;
        const names = [...new Set(candidate.names.filter((name) => name.trim().length >= 3))];
        if (!names.some((name) => lower.includes(name.toLowerCase()))) continue;
        const match = findMentions(note.content, names)[0];
        if (!match) continue;
        mentioned.add(candidate.id);
        const locator: Locator = { kind: 'markdown', noteId, headingPath: [], line: match.line };
        proposals.propose({
          payload: {
            kind: 'link',
            variant: 'mention',
            noteId,
            noteTitle: note.title,
            target: { kind: candidate.kind, id: candidate.id, title: candidate.title },
            text: match.text,
            offset: match.offset,
            sourceHash: note.hash,
            similarity: null,
          },
          evidence: [
            { quote: match.context, title: note.title, label: `Line ${match.line}`, locator },
          ],
          origin,
          dedupeKey: `link:mention:${noteId}:${candidate.id}`,
        });
      }

      const hits = embeddings.relatedNotes(noteId, 8) ?? [];
      const titles = new Map(notesRepo.all().map((row) => [row.id, row.title]));
      for (const hit of hits
        .filter(
          (item) =>
            item.score >= RELATED_THRESHOLD && !linked.has(item.id) && !mentioned.has(item.id),
        )
        .slice(0, MAX_RELATED)) {
        const title = titles.get(hit.id);
        if (!title) continue;
        const [first, second] = [noteId, hit.id].sort();
        proposals.propose({
          payload: {
            kind: 'link',
            variant: 'related',
            noteId,
            noteTitle: note.title,
            target: { kind: 'note', id: hit.id, title },
            text: '',
            offset: 0,
            sourceHash: note.hash,
            similarity: Math.round(hit.score * 100) / 100,
          },
          evidence: [],
          origin,
          dedupeKey: `link:related:${first}:${second}`,
        });
      }
      return { created: Math.max(0, proposalsRepo.pendingCount() - before) };
    },
  };
}

export type LinkSuggester = ReturnType<typeof createLinkSuggester>;
