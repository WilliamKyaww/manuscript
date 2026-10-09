import {
  estimateTokens,
  type GenerationScope,
  type Locator,
  NotFoundError,
  type Passage,
  ValidationError,
} from '@skb/core';
import { noteSections } from '../ai/retrieval';
import type { LearningRepository } from '../learning/repository';
import type { NotesService } from '../notes/service';
import type { SourcesRepository } from '../sources/repository';

/**
 * The material a generation works from (task 11.02): the sections of a source (or a page or slide
 * range of it), every source and note of a lecture, a note's sections, or a selection — as passages
 * with citation keys S1…Sn and the locator each generated item will carry. Material longer than the
 * budget is cut at a passage boundary, and the estimate says so.
 */

export interface MaterialPassage extends Passage {
  tokens: number;
  /** A link to the place in the vault, for citations written into notes ("[[file.pdf#page=3|p. 3]]"). */
  link: string;
  /** The document as a link target: a source's vault path, or a note's title. */
  document: string;
}

export interface Material {
  /** "Lecture 3 — Consensus", a source's or a note's title. */
  title: string;
  /** For proposals' origin: "Lecture 3 (slides 1–3)". */
  label: string;
  passages: MaterialPassage[];
  totalTokens: number;
  truncated: boolean;
  moduleId: string | null;
  lectureId: string | null;
  /** Where extracted concepts are covered (a `covered_in` relation on acceptance). */
  coveredIn: { type: 'lecture' | 'source' | 'note'; id: string } | null;
}

export interface MaterialDependencies {
  learning: LearningRepository;
  sources: SourcesRepository;
  notes: NotesService;
}

type Draft = Omit<MaterialPassage, 'key'>;

const sectionNumber = (locator: Locator, ordinal: number) =>
  locator.kind === 'pdf' ? locator.page : locator.kind === 'slides' ? locator.slide : ordinal + 1;

const wikilink = (target: string, label: string) =>
  `[[${target.replace(/[[\]|]/gu, '')}|${label.replace(/[[\]|]/gu, '')}]]`;

function pageAnchor(locator: Locator): string {
  return locator.kind === 'pdf' ? `#page=${locator.page}` : '';
}

export function createMaterialService(deps: MaterialDependencies) {
  const { learning, sources, notes } = deps;

  function sourcePassages(sourceId: string, from?: number, to?: number): Draft[] {
    const source = sources.byId(sourceId);
    if (!source || source.deletedAt) throw new NotFoundError('That source does not exist.');
    if (source.status !== 'ready')
      throw new ValidationError(
        `“${source.title}” has not been read yet (it is ${source.status}).`,
      );
    return sources.sections(sourceId).flatMap((section) => {
      const number = sectionNumber(section.locator, section.ordinal);
      if ((from !== undefined && number < from) || (to !== undefined && number > to)) return [];
      const notesText = section.notes?.trim() ? `\n\nSpeaker notes: ${section.notes.trim()}` : '';
      const text = `${section.text.trim()}${notesText}`.trim();
      if (!text) return [];
      return [
        {
          kind: 'source' as const,
          title: source.title,
          label: section.label,
          locator: section.locator,
          text,
          tokens: estimateTokens(text),
          link: wikilink(`${source.path}${pageAnchor(section.locator)}`, section.label),
          document: source.path,
        },
      ];
    });
  }

  function notePassages(noteId: string): { title: string; passages: Draft[] } {
    const note = notes.get(noteId);
    const passages = noteSections(note.content, note.headings).map((section) => {
      const heading = section.headingPath.at(-1);
      const locator: Locator = {
        kind: 'markdown',
        noteId,
        headingPath: section.headingPath,
        line: section.line,
      };
      return {
        kind: 'note' as const,
        title: note.title,
        label: heading ?? 'Note',
        locator,
        text: section.text,
        tokens: estimateTokens(section.text),
        link: wikilink(heading ? `${note.title}#${heading}` : note.title, heading ?? note.title),
        document: note.title,
      };
    });
    return { title: note.title, passages };
  }

  /** " (slides 1–3)", " (page 4)", or nothing for the whole source. */
  const rangeLabel = (unit: 'page' | 'slide', from?: number, to?: number) => {
    if (from === undefined && to === undefined) return '';
    if (from !== undefined && from === to) return ` (${unit} ${from})`;
    return ` (${unit}s ${from ?? 1}–${to ?? 'end'})`;
  };

  function collect(scope: GenerationScope): Omit<
    Material,
    'passages' | 'truncated' | 'totalTokens'
  > & {
    drafts: Draft[];
  } {
    switch (scope.kind) {
      case 'source': {
        if (scope.from !== undefined && scope.to !== undefined && scope.from > scope.to)
          throw new ValidationError('The range ends before it starts.');
        const drafts = sourcePassages(scope.sourceId, scope.from, scope.to);
        const source = sources.byId(scope.sourceId);
        const title = source?.title ?? 'Source';
        const unit = source?.kind === 'pptx' ? 'slide' : 'page';
        return {
          title,
          label: `${title}${rangeLabel(unit, scope.from, scope.to)}`,
          drafts,
          moduleId: null,
          lectureId: null,
          coveredIn: { type: 'source', id: scope.sourceId },
        };
      }
      case 'lecture': {
        const lecture = learning.lecture(scope.lectureId);
        if (!lecture) throw new NotFoundError('That lecture does not exist.');
        const module = learning.module(lecture.moduleId);
        const title = `${lecture.key} — ${lecture.title}`;
        const drafts: Draft[] = [];
        for (const source of learning.sourcesOfLecture(lecture.id))
          if (source.status === 'ready') drafts.push(...sourcePassages(source.id));
        if (module)
          for (const note of learning.notesOfLecture(module.codeKey, lecture.keyNorm))
            drafts.push(...notePassages(note.id).passages);
        return {
          title,
          label: module ? `${module.code} ${title}` : title,
          drafts,
          moduleId: lecture.moduleId,
          lectureId: lecture.id,
          coveredIn: { type: 'lecture', id: lecture.id },
        };
      }
      case 'note': {
        const { title, passages } = notePassages(scope.noteId);
        return {
          title,
          label: title,
          drafts: passages,
          moduleId: null,
          lectureId: null,
          coveredIn: { type: 'note', id: scope.noteId },
        };
      }
      default: {
        const text = scope.text.trim();
        const where = scope.locator;
        const sourceId = 'sourceId' in where ? where.sourceId : null;
        const source = sourceId ? sources.byId(sourceId) : null;
        const title = scope.title || source?.title || 'Selection';
        return {
          title,
          label: `Selection from ${title}`,
          drafts: [
            {
              kind: where.kind === 'markdown' ? 'note' : 'source',
              title,
              label: 'Selection',
              locator: where,
              text,
              tokens: estimateTokens(text),
              link: source
                ? wikilink(`${source.path}${pageAnchor(where)}`, title)
                : wikilink(title, title),
              document: source?.path ?? title,
            },
          ],
          moduleId: null,
          lectureId: null,
          coveredIn: source
            ? { type: 'source', id: source.id }
            : where.kind === 'markdown'
              ? { type: 'note', id: where.noteId }
              : null,
        };
      }
    }
  }

  return {
    /** The scope's passages, keyed S1…Sn and cut to the budget. */
    gather(scope: GenerationScope, budgetTokens: number): Material {
      const { drafts, ...rest } = collect(scope);
      const totalTokens = drafts.reduce((sum, passage) => sum + passage.tokens, 0);
      const passages: MaterialPassage[] = [];
      let used = 0;
      for (const draft of drafts) {
        if (used + draft.tokens > budgetTokens && passages.length > 0) break;
        used += draft.tokens;
        passages.push({ ...draft, key: `S${passages.length + 1}` });
      }
      return { ...rest, passages, totalTokens, truncated: passages.length < drafts.length };
    },
  };
}

export type MaterialService = ReturnType<typeof createMaterialService>;
