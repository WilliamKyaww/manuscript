import {
  type AutoAccept,
  CITATION,
  cardProblem,
  checkCitations,
  duplicateFinder,
  findDuplicate,
  GeneratedCardsSchema,
  GeneratedNoteSchema,
  GeneratedQuestionsSchema,
  type GenerationRequestSchema,
  type Id,
  type NamedConcept,
  toQuestionAnswer,
} from '@skb/core';
import { applyTextEdits, formatWikilink, normaliseKey } from '@skb/core/markdown';
import type { z } from 'zod';
import type { AiService } from '../ai/service';
import { generateStructured } from '../ai/structured';
import type { CardsService } from '../cards/service';
import type { ConceptsService } from '../concepts/service';
import type { LearningRepository } from '../learning/repository';
import { findMentions } from '../notes/mentions';
import type { QuestionsService } from '../practice/questions';
import type { Material, MaterialPassage } from './material';
import { askFor, cardsPrompt, materialMessage, notePrompt, questionsPrompt } from './prompts';
import type { ProposalsService } from './proposals';

/**
 * Generating cards, questions and notes (tasks 11.03–11.05). What the model returns is checked
 * before anyone sees it: every item must name a passage it came from (which becomes its locator),
 * keys must work, and repeats within the batch are dropped. Cards and questions are saved as drafts,
 * a note as a proposal — unless auto-accept is on for that kind.
 */

export type GenerationInput = z.output<typeof GenerationRequestSchema>;

export interface TaskContext {
  request: GenerationInput;
  material: Material;
  signal: AbortSignal;
  autoAccept: AutoAccept;
  maxOutputTokens: number;
  jobId: string | null;
  progress(fraction: number, message: string): void;
}

export interface TaskOutcome {
  created: number;
  /** Items dropped, with why (no source, an unusable key, a repeat…). */
  skipped: number;
  summary: string;
}

export interface TaskDependencies {
  ai: AiService;
  cards: CardsService;
  questions: QuestionsService;
  concepts: ConceptsService;
  proposals: ProposalsService;
  learning: LearningRepository;
}

/** The passage an item names ("S3", "[S3]", "s3"); the only passage when there is just one. */
export function passageFor(
  passages: readonly MaterialPassage[],
  source: string,
): MaterialPassage | null {
  const key = source.replace(/[[\]\s]/gu, '').toUpperCase();
  return (
    passages.find((passage) => passage.key === key) ??
    (passages.length === 1 ? (passages[0] ?? null) : null)
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function createTaskRunners(deps: TaskDependencies) {
  const { ai, cards, questions, concepts, proposals, learning } = deps;

  /** Existing concepts named by an item ("Paxos", "two-phase commits"), as ids. */
  function conceptIds(names: readonly string[], known: readonly NamedConcept[]): Id<'concept'>[] {
    const ids = new Set<string>();
    for (const name of names) {
      const match = name.trim() ? findDuplicate([name], known) : null;
      if (match && match.kind !== 'maybe') ids.add(match.id);
    }
    return [...ids] as Id<'concept'>[];
  }

  const knownConcepts = (): NamedConcept[] =>
    concepts
      .list()
      .map((concept) => ({ id: concept.id, names: [concept.name, ...concept.aliases] }));

  function cardSet(context: TaskContext): Id<'cardSet'> {
    if (context.request.setId) return cards.getSet(context.request.setId).id;
    const { material } = context;
    const existing = cards
      .listSets()
      .find(
        (set) =>
          set.origin === 'ai' &&
          set.title === material.title &&
          (set.lecture?.id ?? null) === material.lectureId,
      );
    if (existing) return existing.id;
    return cards.createSet(
      {
        title: material.title,
        description: `Generated from ${material.label}.`,
        moduleId: material.moduleId as Id<'module'> | null,
        lectureId: material.lectureId as Id<'lecture'> | null,
      },
      'ai',
    ).id;
  }

  async function runCards(context: TaskContext): Promise<TaskOutcome> {
    const { request, material } = context;
    const { object } = await generateStructured(ai, {
      role: 'chat',
      schema: GeneratedCardsSchema,
      system: cardsPrompt(request),
      content: materialMessage(material.passages, askFor('cards', request.count)),
      purpose: 'generate cards',
      maxOutputTokens: context.maxOutputTokens,
      signal: context.signal,
    });
    context.progress(0.8, 'Checking the cards');
    const known = knownConcepts();
    const setId = cardSet(context);
    const kept: { id: string; text: string }[] = [];
    let skipped = 0;
    for (const card of object.cards.slice(0, request.count)) {
      const passage = passageFor(material.passages, card.source);
      const repeat = duplicateFinder(kept)(`${card.front} ${card.back}`);
      if (
        !passage ||
        !request.cardKinds.includes(card.kind) ||
        cardProblem(card) !== null ||
        repeat !== null
      ) {
        skipped += 1;
        continue;
      }
      const created = cards.createCard(
        {
          setId,
          kind: card.kind,
          front: card.front.trim(),
          back: card.kind === 'cloze' ? '' : card.back.trim(),
          extra: card.extra.trim(),
          status: context.autoAccept.cards ? 'active' : 'draft',
          locator: passage.locator,
          conceptIds: conceptIds(card.concepts, known),
        },
        'ai',
      );
      kept.push({ id: created.id, text: `${card.front} ${card.back}` });
    }
    const where = context.autoAccept.cards ? 'added to your cards' : 'ready to review in the Inbox';
    return {
      created: kept.length,
      skipped,
      summary: `${plural(kept.length, 'card')} ${where}${skipped ? ` (${skipped} left out)` : ''}.`,
    };
  }

  async function runQuestions(context: TaskContext): Promise<TaskOutcome> {
    const { request, material } = context;
    const { object } = await generateStructured(ai, {
      role: 'chat',
      schema: GeneratedQuestionsSchema,
      system: questionsPrompt(request),
      content: materialMessage(material.passages, askFor('questions', request.count)),
      purpose: 'generate questions',
      maxOutputTokens: context.maxOutputTokens,
      signal: context.signal,
    });
    context.progress(0.8, 'Checking the questions');
    const known = knownConcepts();
    const kept: { id: string; text: string }[] = [];
    let skipped = 0;
    for (const question of object.questions.slice(0, request.count)) {
      const passage = passageFor(material.passages, question.source);
      const answer = toQuestionAnswer(question);
      const repeat = duplicateFinder(kept)(question.stem);
      if (
        !passage ||
        typeof answer === 'string' ||
        repeat !== null ||
        !request.questionKinds.includes(question.kind)
      ) {
        skipped += 1;
        continue;
      }
      const created = questions.create(
        {
          stem: question.stem.trim(),
          answer,
          explanation: question.explanation.trim(),
          difficulty: Math.min(5, Math.max(1, Math.round(question.difficulty))),
          status: context.autoAccept.questions ? 'active' : 'draft',
          moduleId: material.moduleId as Id<'module'> | null,
          lectureId: material.lectureId as Id<'lecture'> | null,
          locator: passage.locator,
          conceptIds: conceptIds(question.concepts, known),
        },
        'ai',
      );
      kept.push({ id: created.id, text: question.stem });
    }
    const where = context.autoAccept.questions
      ? 'added to your questions'
      : 'ready to review in the Inbox';
    return {
      created: kept.length,
      skipped,
      summary: `${plural(kept.length, 'question')} ${where}${skipped ? ` (${skipped} left out)` : ''}.`,
    };
  }

  /** Links the first plain mention of each concept in the note's prose. */
  function linkConcepts(text: string, known: readonly NamedConcept[]): string {
    const taken: { start: number; end: number }[] = [];
    const edits: { offset: number; length: number; text: string }[] = [];
    for (const concept of known) {
      const name = concept.names[0];
      if (!name) continue;
      const match = findMentions(text, concept.names).find(
        (candidate) =>
          !taken.some(
            (range) =>
              candidate.offset < range.end && candidate.offset + candidate.length > range.start,
          ),
      );
      if (!match) continue;
      taken.push({ start: match.offset, end: match.offset + match.length });
      edits.push({
        offset: match.offset,
        length: match.length,
        text:
          normaliseKey(match.text) === normaliseKey(name)
            ? formatWikilink({ target: match.text })
            : formatWikilink({ target: name, alias: match.text }),
      });
    }
    return applyTextEdits(text, edits);
  }

  async function runNote(context: TaskContext): Promise<TaskOutcome> {
    const { request, material } = context;
    const { object } = await generateStructured(ai, {
      role: 'chat',
      schema: GeneratedNoteSchema,
      system: notePrompt(request),
      content: materialMessage(material.passages, askFor('note', 1)),
      purpose: 'generate a note',
      maxOutputTokens: context.maxOutputTokens,
      signal: context.signal,
    });
    context.progress(0.8, 'Checking citations');
    const byKey = new Map(material.passages.map((passage) => [passage.key, passage]));
    const checked = checkCitations(object.markdown.trim(), new Set(byKey.keys()));
    // Citations become links to the page, slide or section — readable in any Markdown editor.
    const cited = checked.text.replace(CITATION, (_match, inner: string) => {
      const links = inner.split(/\s*[,;]\s*/u).flatMap((key) => byKey.get(key)?.link ?? []);
      return links.length ? `(${links.join(', ')})` : '';
    });
    const body = linkConcepts(cited, knownConcepts());
    const documents = [...new Set(checked.used.flatMap((key) => byKey.get(key)?.document ?? []))];
    const quote = (text: string) => `"${text.replace(/[[\]|]/gu, '').replaceAll('"', '\\"')}"`;
    const frontmatter = [
      '---',
      'generated_by: ai',
      ...(documents.length
        ? ['sources:', ...documents.map((document) => `  - ${quote(`[[${document}]]`)}`)]
        : []),
      '---',
      '',
    ].join('\n');
    const module = material.moduleId ? learning.module(material.moduleId) : null;
    const title =
      object.title
        .replace(/[\r\n]+/gu, ' ')
        .trim()
        .slice(0, 120) || material.title;
    const row = proposals.propose({
      payload: {
        kind: 'note',
        title,
        folder: module?.code.replace(/[\\/:*?"<>|]/gu, '') ?? '',
        content: `${frontmatter}${body}\n`,
      },
      evidence: checked.used.slice(0, 20).flatMap((key) => {
        const passage = byKey.get(key);
        return passage
          ? [
              {
                quote: passage.text.slice(0, 300),
                title: passage.title,
                label: passage.label,
                locator: passage.locator,
              },
            ]
          : [];
      }),
      origin: {
        label: `Note from ${material.label}`,
        jobId: context.jobId,
        moduleId: material.moduleId,
        lectureId: material.lectureId,
        coveredIn: null,
      },
      dedupeKey: `note:${context.jobId ?? `${material.label}:${title}`}`,
    });
    if (row && context.autoAccept.notes && row.status === 'pending')
      proposals.acceptQuietly(row.id);
    const dropped = checked.unknown.length
      ? ` ${plural(checked.unknown.length, 'made-up citation')} removed.`
      : '';
    return {
      created: row ? 1 : 0,
      skipped: 0,
      summary: `${context.autoAccept.notes ? 'The note was saved' : 'The note is ready to review in the Inbox'}, citing ${plural(checked.used.length, 'passage')}.${dropped}`,
    };
  }

  return { runCards, runQuestions, runNote, knownConcepts };
}

export type TaskRunners = ReturnType<typeof createTaskRunners>;
