import { describe, expect, it } from 'vitest';
import {
  cardProblem,
  duplicateFinder,
  estimateOutputTokens,
  type GeneratedQuestion,
  textSimilarity,
  toQuestionAnswer,
} from './generation';

const blank: GeneratedQuestion = {
  kind: 'short',
  stem: 'Which property does CAP trade against consistency?',
  options: [],
  truth: null,
  value: null,
  unit: '',
  tolerance: null,
  accepted: [],
  model: '',
  explanation: '',
  difficulty: 3,
  source: 'S1',
  concepts: [],
};

describe('generated questions', () => {
  it('turns each kind into an answer key', () => {
    expect(toQuestionAnswer({ ...blank, accepted: [' availability ', ''] })).toEqual({
      kind: 'short',
      accepted: ['availability'],
    });
    expect(
      toQuestionAnswer({
        ...blank,
        kind: 'mcq',
        options: [
          { text: 'Availability', correct: true, explanation: 'Yes.' },
          { text: 'Latency', correct: false, explanation: '' },
        ],
      }),
    ).toMatchObject({ kind: 'mcq', options: [{ id: 'a', correct: true }, { id: 'b' }] });
    expect(toQuestionAnswer({ ...blank, kind: 'true_false', truth: false })).toEqual({
      kind: 'true_false',
      value: false,
    });
    expect(
      toQuestionAnswer({ ...blank, kind: 'numeric', value: 3, unit: ' nodes', tolerance: null }),
    ).toEqual({
      kind: 'numeric',
      value: 3,
      tolerance: { type: 'absolute', amount: 0 },
      unit: 'nodes',
    });
    expect(toQuestionAnswer({ ...blank, kind: 'explain', model: 'Because…' })).toEqual({
      kind: 'explain',
      model: 'Because…',
    });
  });

  it('rejects keys that cannot work', () => {
    expect(toQuestionAnswer(blank)).toMatch(/accepted answers/u);
    expect(
      toQuestionAnswer({
        ...blank,
        kind: 'mcq',
        options: [
          { text: 'A', correct: true, explanation: '' },
          { text: 'B', correct: true, explanation: '' },
        ],
      }),
    ).toMatch(/exactly one correct/u);
    expect(toQuestionAnswer({ ...blank, kind: 'mcq', options: [] })).toMatch(/two options/u);
    expect(toQuestionAnswer({ ...blank, kind: 'true_false' })).toMatch(/needs its answer/u);
    expect(toQuestionAnswer({ ...blank, kind: 'numeric' })).toMatch(/number/u);
    expect(toQuestionAnswer({ ...blank, kind: 'explain' })).toMatch(/model answer/u);
    expect(toQuestionAnswer({ ...blank, stem: ' ', accepted: ['x'] })).toMatch(/no text/u);
  });
});

describe('generated cards', () => {
  it('finds unusable cards', () => {
    expect(cardProblem({ kind: 'basic', front: 'What is Paxos?', back: '' })).toMatch(/answer/u);
    expect(cardProblem({ kind: 'cloze', front: 'Paxos is a protocol.', back: '' })).toMatch(/gap/u);
    expect(
      cardProblem({ kind: 'cloze', front: '{{c1::Paxos}} reaches consensus.', back: '' }),
    ).toBe(null);
  });

  it('measures overlap between texts, ignoring cloze markup', () => {
    expect(textSimilarity('What is the CAP theorem?', 'what is the cap theorem')).toBe(1);
    expect(textSimilarity('{{c1::Paxos}} reaches consensus', 'Paxos reaches consensus')).toBe(1);
    expect(textSimilarity('Paxos', 'Raft')).toBe(0);
    expect(textSimilarity('a b c d', 'a b c e')).toBeCloseTo(0.6, 5);
  });

  it('finds near-duplicates among many texts', () => {
    const find = duplicateFinder([
      { id: 'a', text: 'What does the CAP theorem say about partitions?' },
      { id: 'b', text: 'Which phase of two-phase commit can block?' },
    ]);
    expect(find('What does the CAP theorem say about a partition?')).toBeNull();
    expect(find('what does the CAP theorem say about partitions')).toMatchObject({
      id: 'a',
      score: 1,
    });
    expect(find('Which phase of two phase commit can block')).toMatchObject({ id: 'b' });
    expect(find('Unrelated words entirely')).toBeNull();
  });

  it('estimates output tokens per task', () => {
    expect(estimateOutputTokens('cards', 10)).toBe(900);
    expect(estimateOutputTokens('note', 10)).toBe(1_800);
  });
});
