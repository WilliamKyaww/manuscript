import { z } from 'zod';

/**
 * Questions (learning-system.md §4): the kinds, what each stores as its answer, how a response looks,
 * and grading. Choice and numeric questions grade themselves; short answers match accepted forms
 * and otherwise fall back, like open questions, to grading yourself against a model answer.
 */

export const QUESTION_KINDS = [
  'mcq',
  'multi',
  'true_false',
  'numeric',
  'short',
  'explain',
  'derivation',
  'code',
] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];

/** How a kind is graded, and its level on the practice ladder (recognition → recall → production). */
export const QUESTION_LEVEL: Record<QuestionKind, 'recognition' | 'recall' | 'production'> = {
  mcq: 'recognition',
  multi: 'recognition',
  true_false: 'recognition',
  numeric: 'recall',
  short: 'recall',
  explain: 'production',
  derivation: 'production',
  code: 'production',
};

export const SELF_GRADED: readonly QuestionKind[] = ['explain', 'derivation', 'code'];

const OptionSchema = z.object({
  id: z.string().min(1).max(20),
  text: z.string().trim().min(1).max(2_000),
  correct: z.boolean(),
  /** Why this option is right or wrong, shown after answering. */
  explanation: z.string().max(2_000).default(''),
});

/** What each kind keeps as its answer. */
export const QuestionAnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mcq'), options: z.array(OptionSchema).min(2).max(10) }),
  z.object({ kind: z.literal('multi'), options: z.array(OptionSchema).min(2).max(12) }),
  z.object({ kind: z.literal('true_false'), value: z.boolean() }),
  z.object({
    kind: z.literal('numeric'),
    value: z.number().finite(),
    /** Accepted distance from the value: absolute, or relative (0.01 = 1 %). */
    tolerance: z.object({ type: z.enum(['absolute', 'relative']), amount: z.number().min(0) }),
    unit: z.string().max(40).default(''),
  }),
  z.object({
    kind: z.literal('short'),
    /** Accepted answers; a response matching one (ignoring case, spacing and end punctuation) is right. */
    accepted: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  }),
  z.object({ kind: z.literal('explain'), model: z.string().max(10_000) }),
  z.object({ kind: z.literal('derivation'), model: z.string().max(10_000) }),
  z.object({
    kind: z.literal('code'),
    model: z.string().max(20_000),
    language: z.string().max(40).default(''),
  }),
]);
export type QuestionAnswer = z.infer<typeof QuestionAnswerSchema>;

/** Why an answer key cannot work, or null. */
export function answerProblem(answer: QuestionAnswer): string | null {
  if (answer.kind === 'mcq' && answer.options.filter((option) => option.correct).length !== 1)
    return 'A multiple-choice question needs exactly one correct option.';
  if (answer.kind === 'multi' && !answer.options.some((option) => option.correct))
    return 'Mark at least one option correct.';
  if (answer.kind === 'mcq' || answer.kind === 'multi') {
    const ids = answer.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) return 'Option ids must differ.';
  }
  return null;
}

export const ResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mcq'), choice: z.string() }),
  z.object({ kind: z.literal('multi'), choices: z.array(z.string()).max(12) }),
  z.object({ kind: z.literal('true_false'), value: z.boolean() }),
  z.object({ kind: z.literal('numeric'), value: z.number().finite() }),
  z.object({ kind: z.literal('short'), text: z.string().max(2_000) }),
  z.object({ kind: z.literal('explain'), text: z.string().max(20_000) }),
  z.object({ kind: z.literal('derivation'), text: z.string().max(20_000) }),
  z.object({ kind: z.literal('code'), text: z.string().max(40_000) }),
]);
export type QuestionResponse = z.infer<typeof ResponseSchema>;

/** Scores a student can give themselves against a model answer: not at all, partly, fully. */
export const SELF_SCORES = [0, 0.5, 1] as const;
export type SelfScore = (typeof SELF_SCORES)[number];

/** Case, spacing, accents' composition and end punctuation do not matter for short answers. */
export function normaliseAnswer(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;:,]+$/u, '')
    .trim();
}

export interface Grade {
  /** 0–1, or null when the student grades it themselves. */
  score: number | null;
}

/**
 * Grades a response. Multi-select earns credit per correct choice, less one per wrong choice
 * (never below 0), so ticking everything earns nothing. A short answer that matches no accepted
 * form is not marked wrong: the student compares it with the accepted answers and decides.
 */
export function gradeResponse(answer: QuestionAnswer, response: QuestionResponse): Grade {
  if (answer.kind !== response.kind)
    throw new Error('The response is for another kind of question.');
  switch (answer.kind) {
    case 'mcq': {
      const choice = (response as Extract<QuestionResponse, { kind: 'mcq' }>).choice;
      return { score: answer.options.find((option) => option.id === choice)?.correct ? 1 : 0 };
    }
    case 'multi': {
      const chosen = new Set((response as Extract<QuestionResponse, { kind: 'multi' }>).choices);
      const correct = answer.options.filter((option) => option.correct);
      const hits = correct.filter((option) => chosen.has(option.id)).length;
      const misses = answer.options.filter(
        (option) => !option.correct && chosen.has(option.id),
      ).length;
      return { score: Math.max(0, (hits - misses) / correct.length) };
    }
    case 'true_false':
      return {
        score:
          (response as Extract<QuestionResponse, { kind: 'true_false' }>).value === answer.value
            ? 1
            : 0,
      };
    case 'numeric': {
      const value = (response as Extract<QuestionResponse, { kind: 'numeric' }>).value;
      const allowed =
        answer.tolerance.type === 'absolute'
          ? answer.tolerance.amount
          : Math.abs(answer.value) * answer.tolerance.amount;
      // A tiny margin so that 0.1 + 0.2 counts as 0.3.
      return {
        score:
          Math.abs(value - answer.value) <= allowed + 1e-9 * Math.max(1, Math.abs(answer.value))
            ? 1
            : 0,
      };
    }
    case 'short': {
      const text = normaliseAnswer((response as Extract<QuestionResponse, { kind: 'short' }>).text);
      return {
        score: answer.accepted.some((accepted) => normaliseAnswer(accepted) === text) ? 1 : null,
      };
    }
    default:
      return { score: null };
  }
}
