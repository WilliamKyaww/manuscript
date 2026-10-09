import { describe, expect, it } from 'vitest';
import {
  answerProblem,
  gradeResponse,
  normaliseAnswer,
  type QuestionAnswer,
  QuestionAnswerSchema,
} from './questions';

const option = (id: string, correct: boolean) => ({ id, text: id, correct, explanation: '' });

describe('answer keys', () => {
  it('needs one right option for multiple choice and at least one for multi-select', () => {
    expect(answerProblem({ kind: 'mcq', options: [option('a', true), option('b', true)] })).toMatch(
      /exactly one/,
    );
    expect(
      answerProblem({ kind: 'multi', options: [option('a', false), option('b', false)] }),
    ).toMatch(/at least one/);
    expect(
      answerProblem({ kind: 'mcq', options: [option('a', true), option('a', false)] }),
    ).toMatch(/differ/);
    expect(
      answerProblem({ kind: 'mcq', options: [option('a', true), option('b', false)] }),
    ).toBeNull();
  });

  it('fills defaults', () => {
    const parsed = QuestionAnswerSchema.parse({
      kind: 'numeric',
      value: 3,
      tolerance: { type: 'absolute', amount: 0 },
    });
    expect(parsed).toEqual({
      kind: 'numeric',
      value: 3,
      tolerance: { type: 'absolute', amount: 0 },
      unit: '',
    });
  });
});

describe('grading', () => {
  it('grades choices', () => {
    const mcq: QuestionAnswer = { kind: 'mcq', options: [option('a', false), option('b', true)] };
    expect(gradeResponse(mcq, { kind: 'mcq', choice: 'b' }).score).toBe(1);
    expect(gradeResponse(mcq, { kind: 'mcq', choice: 'a' }).score).toBe(0);
    expect(gradeResponse(mcq, { kind: 'mcq', choice: 'zzz' }).score).toBe(0);
    expect(
      gradeResponse({ kind: 'true_false', value: false }, { kind: 'true_false', value: false })
        .score,
    ).toBe(1);
  });

  it('gives multi-select credit per right choice, less wrong ones', () => {
    const multi: QuestionAnswer = {
      kind: 'multi',
      options: [option('a', true), option('b', true), option('c', false), option('d', false)],
    };
    const grade = (choices: string[]) => gradeResponse(multi, { kind: 'multi', choices }).score;
    expect(grade(['a', 'b'])).toBe(1);
    expect(grade(['a'])).toBe(0.5);
    expect(grade(['a', 'c'])).toBe(0);
    expect(grade(['a', 'b', 'c', 'd'])).toBe(0);
    expect(grade([])).toBe(0);
  });

  it('accepts numbers within the tolerance', () => {
    const absolute: QuestionAnswer = {
      kind: 'numeric',
      value: 0.3,
      tolerance: { type: 'absolute', amount: 0 },
      unit: '',
    };
    expect(gradeResponse(absolute, { kind: 'numeric', value: 0.1 + 0.2 }).score).toBe(1);
    expect(gradeResponse(absolute, { kind: 'numeric', value: 0.31 }).score).toBe(0);
    const relative: QuestionAnswer = {
      kind: 'numeric',
      value: 200,
      tolerance: { type: 'relative', amount: 0.05 },
      unit: 'ms',
    };
    expect(gradeResponse(relative, { kind: 'numeric', value: 209 }).score).toBe(1);
    expect(gradeResponse(relative, { kind: 'numeric', value: 211 }).score).toBe(0);
  });

  it('matches short answers loosely and otherwise asks the student', () => {
    const short: QuestionAnswer = { kind: 'short', accepted: ['Leader election', 'election'] };
    expect(gradeResponse(short, { kind: 'short', text: '  leader   ELECTION. ' }).score).toBe(1);
    expect(gradeResponse(short, { kind: 'short', text: 'voting' }).score).toBeNull();
    expect(normaliseAnswer('Café!')).toBe('café');
    expect(
      gradeResponse({ kind: 'explain', model: 'Because…' }, { kind: 'explain', text: 'x' }).score,
    ).toBeNull();
  });

  it('refuses a response of another kind', () => {
    expect(() =>
      gradeResponse({ kind: 'true_false', value: true }, { kind: 'short', text: 'x' }),
    ).toThrow();
  });
});
