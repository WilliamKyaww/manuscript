import { z } from 'zod';
import { type CardKind, cardHints, clozeNumbers } from '../learning/cards';
import { answerProblem, type QuestionAnswer } from '../learning/questions';

/**
 * Generation (agent-system.md §11, Phase 11): what a model is asked to return for each task, how
 * that becomes cards, questions, notes and proposals, and the quality checks applied before anyone
 * sees them. Every field is required (empty when unused), because providers' structured outputs
 * reject optional fields; every item names the passage (`S3`) it comes from, which becomes its
 * locator.
 */

export const GENERATION_TASKS = ['cards', 'questions', 'note', 'concepts'] as const;
export type GenerationTask = (typeof GENERATION_TASKS)[number];

const Source = z.string().describe('The key of the passage this comes from, such as S3.');

export const GeneratedCardsSchema = z.object({
  cards: z.array(
    z.object({
      kind: z.enum(['basic', 'cloze']),
      front: z.string().describe('The question, or for cloze the sentence with {{c1::gaps}}.'),
      back: z.string().describe('The answer; empty for cloze cards.'),
      extra: z.string().describe('Optional context shown after the answer; empty if none.'),
      source: Source,
      concepts: z.array(z.string()).describe('Names of the concepts the card tests.'),
    }),
  ),
});
export type GeneratedCards = z.infer<typeof GeneratedCardsSchema>;

export const GENERATED_QUESTION_KINDS = [
  'mcq',
  'multi',
  'true_false',
  'numeric',
  'short',
  'explain',
] as const;

export const GeneratedQuestionsSchema = z.object({
  questions: z.array(
    z.object({
      kind: z.enum(GENERATED_QUESTION_KINDS),
      stem: z.string(),
      /** mcq and multi: the options with the right ones marked; empty otherwise. */
      options: z.array(
        z.object({ text: z.string(), correct: z.boolean(), explanation: z.string() }),
      ),
      /** true_false: the truth of the statement; null otherwise. */
      truth: z.boolean().nullable(),
      /** numeric: the answer, its unit and the accepted absolute error; null/empty otherwise. */
      value: z.number().nullable(),
      unit: z.string(),
      tolerance: z.number().nullable(),
      /** short: accepted answers; explain: empty. */
      accepted: z.array(z.string()),
      /** explain: a model answer; short: empty. */
      model: z.string(),
      explanation: z.string(),
      difficulty: z.number().int().min(1).max(5),
      source: Source,
      concepts: z.array(z.string()),
    }),
  ),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionsSchema>['questions'][number];

export const GeneratedNoteSchema = z.object({
  title: z.string(),
  markdown: z.string().describe('The note in Markdown, citing passages as [S1] after each claim.'),
});

/** Relations a model may propose between concepts. */
export const EXTRACTED_RELATIONS = [
  'relates_to',
  'prerequisite_for',
  'part_of',
  'example_of',
  'contrasts_with',
] as const;

export const GeneratedConceptsSchema = z.object({
  concepts: z.array(
    z.object({
      name: z.string(),
      aliases: z.array(z.string()),
      summary: z.string().describe('One or two sentences.'),
      source: Source,
      quote: z.string().describe('Words from the passage that show the concept.'),
    }),
  ),
  relations: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relation: z.enum(EXTRACTED_RELATIONS),
      /** EXTRACTED: stated in the passage; INFERRED: a reasonable deduction; AMBIGUOUS: unsure. */
      confidence: z.enum(['EXTRACTED', 'INFERRED', 'AMBIGUOUS']),
      /** INFERRED only: 0.95 near-certain · 0.85 strong · 0.75 reasonable · 0.65 weak · 0.55 speculative. */
      score: z.number().min(0).max(1).nullable(),
      source: Source,
      quote: z.string(),
    }),
  ),
});
export type GeneratedConcepts = z.infer<typeof GeneratedConceptsSchema>;

export const GeneratedGradeSchema = z.object({
  score: z.number().describe('0 (missed), 0.5 (partly) or 1 (got it).'),
  feedback: z.string().describe('Two or three sentences for the student.'),
  misconceptions: z.array(z.string()),
});
export type GeneratedGrade = z.infer<typeof GeneratedGradeSchema>;

/** Text read from an image or a scanned page. */
export const GeneratedReadingSchema = z.object({
  pages: z.array(z.object({ page: z.number().int().min(1), text: z.string() })),
});

// --- Converting and checking --------------------------------------------------------------------

/** A generated question as a question's answer key, or the reason it cannot be one. */
export function toQuestionAnswer(question: GeneratedQuestion): QuestionAnswer | string {
  let answer: QuestionAnswer;
  switch (question.kind) {
    case 'mcq':
    case 'multi': {
      const options = question.options.map((option, index) => ({
        id: String.fromCharCode(97 + index),
        text: option.text.trim(),
        correct: option.correct,
        explanation: option.explanation.trim(),
      }));
      if (options.length < 2) return 'A choice question needs at least two options.';
      if (options.some((option) => !option.text)) return 'Every option needs text.';
      answer = { kind: question.kind, options };
      break;
    }
    case 'true_false':
      if (question.truth === null) return 'A true-or-false question needs its answer.';
      answer = { kind: 'true_false', value: question.truth };
      break;
    case 'numeric':
      if (question.value === null || !Number.isFinite(question.value))
        return 'A numeric question needs its number.';
      answer = {
        kind: 'numeric',
        value: question.value,
        tolerance: { type: 'absolute', amount: Math.max(0, question.tolerance ?? 0) },
        unit: question.unit.trim(),
      };
      break;
    case 'short': {
      const accepted = question.accepted.map((text) => text.trim()).filter(Boolean);
      if (accepted.length === 0) return 'A short-answer question needs accepted answers.';
      answer = { kind: 'short', accepted };
      break;
    }
    default:
      if (!question.model.trim()) return 'An explain question needs a model answer.';
      answer = { kind: 'explain', model: question.model.trim() };
  }
  if (!question.stem.trim()) return 'The question has no text.';
  return answerProblem(answer) ?? answer;
}

/** Problems with a generated card that make it unusable (hints alone do not). */
export function cardProblem(card: { kind: CardKind; front: string; back: string }): string | null {
  if (!card.front.trim()) return 'The card has no question.';
  if (card.kind === 'cloze') {
    if (clozeNumbers(card.front).length === 0) return 'A cloze card needs a {{c1::gap}}.';
  } else if (!card.back.trim()) return 'The card has no answer.';
  return null;
}

/** Writing advice for a card (the editor's hints: one fact, short answers, no lists…). */
export const cardAdvice = (card: { kind: CardKind; front: string; back: string; extra: string }) =>
  cardHints(card);

const words = (text: string) =>
  new Set(
    text
      .toLowerCase()
      // A hint is short: bounding it keeps a text of many `::` and no `}}` linear.
      .replace(/\{\{c\d+::|::[^}]{0,200}\}\}|\}\}/gu, ' ')
      .match(/[\p{L}\p{N}]+/gu) ?? [],
  );

/** Word overlap (Jaccard) of two texts, 0–1. */
export function textSimilarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 && right.size === 0) return 1;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Two cards or questions asking the same thing. */
export const DUPLICATE_SIMILARITY = 0.8;

export interface DuplicateHit {
  id: string;
  text: string;
  score: number;
}

/**
 * Finds the text most like a new one among many (cards, questions). Comparing with every text is
 * slow for large collections, so only texts sharing one of the new text's three rarest words are
 * compared: a text at least 80 % alike shares most of its words, so it almost always shares one of
 * those.
 */
export function duplicateFinder(items: readonly { id: string; text: string }[]) {
  const entries = items.map((item) => ({ ...item, words: words(item.text) }));
  const index = new Map<string, number[]>();
  entries.forEach((entry, position) => {
    for (const word of entry.words) {
      const list = index.get(word);
      if (list) list.push(position);
      else index.set(word, [position]);
    }
  });
  return (text: string, threshold = DUPLICATE_SIMILARITY): DuplicateHit | null => {
    const mine = words(text);
    const rare = [...mine]
      .filter((word) => index.has(word))
      .sort((a, b) => (index.get(a)?.length ?? 0) - (index.get(b)?.length ?? 0))
      .slice(0, 3);
    let best: DuplicateHit | null = null;
    for (const position of new Set(rare.flatMap((word) => index.get(word) ?? []))) {
      const entry = entries[position];
      if (!entry) continue;
      let shared = 0;
      for (const word of mine) if (entry.words.has(word)) shared += 1;
      const score = shared / (mine.size + entry.words.size - shared);
      if (score >= threshold && (!best || score > best.score))
        best = { id: entry.id, text: entry.text, score };
    }
    return best;
  };
}

/** Rough tokens a model writes per item, for estimates before generating. */
export const OUTPUT_TOKENS_PER_ITEM: Record<GenerationTask, number> = {
  cards: 90,
  questions: 260,
  note: 0,
  concepts: 120,
};
export const NOTE_OUTPUT_TOKENS = 1_800;

export function estimateOutputTokens(task: GenerationTask, count: number): number {
  return task === 'note' ? NOTE_OUTPUT_TOKENS : OUTPUT_TOKENS_PER_ITEM[task] * count;
}
