import { describe, expect, it } from 'vitest';
import {
  type PracticeConcept,
  type PracticeItem,
  type PracticeStep,
  practiceSession,
} from './practice';

const item = (id: string, concept: string, level: PracticeItem['level']): PracticeItem => ({
  id,
  conceptIds: [concept],
  level,
});
const concept = (id: string, priority: number, stage: PracticeConcept['stage'] = 'new') => ({
  id,
  priority,
  stage,
});

/** Runs a session, answering with `answer(itemId)`, until it ends or `limit` items. */
function play(
  concepts: PracticeConcept[],
  items: PracticeItem[],
  answer: (itemId: string) => number,
  limit = 50,
) {
  const steps: PracticeStep[] = [];
  for (let i = 0; i < limit; i += 1) {
    const { next } = practiceSession(concepts, items, steps, 42);
    if (!next) break;
    steps.push({ itemId: next.itemId, conceptId: next.conceptId, score: answer(next.itemId) });
  }
  return { steps, session: practiceSession(concepts, items, steps, 42) };
}

const ladder = (id: string) => [
  item(`${id}-mcq`, id, 'recognition'),
  item(`${id}-short`, id, 'recall'),
  item(`${id}-explain`, id, 'production'),
];

describe('the Learn engine', () => {
  it('climbs the ladder and secures a concept after two correct answers at recall or above', () => {
    const { steps, session } = play([concept('a', 1)], ladder('a'), () => 1);
    expect(steps.map((step) => step.itemId)).toEqual(['a-mcq', 'a-short', 'a-explain']);
    expect(session.progress.get('a')).toMatchObject({ secure: true, secureCorrect: 2 });
    expect(session.next).toBeNull();
  });

  it('steps down after a mistake', () => {
    const answers: Record<string, number[]> = { 'a-short': [0, 1], 'a-mcq': [1, 1] };
    const { steps } = play([concept('a', 1)], ladder('a'), (id) => answers[id]?.shift() ?? 1);
    expect(steps.map((step) => step.itemId)).toEqual([
      'a-mcq',
      'a-short',
      'a-mcq',
      'a-short',
      'a-explain',
    ]);
  });

  it('starts known concepts higher up', () => {
    const { steps } = play([concept('a', 1, 'confident')], ladder('a'), () => 1);
    expect(steps[0]?.itemId).toBe('a-explain');
  });

  it('interleaves: never three in a row for one concept while others wait', () => {
    const concepts = [concept('a', 10), concept('b', 1), concept('c', 1)];
    const items = [...ladder('a'), ...ladder('b'), ...ladder('c')];
    const { steps, session } = play(concepts, items, () => 0, 30);
    for (let i = 2; i < steps.length; i += 1) {
      const run = new Set(steps.slice(i - 2, i + 1).map((step) => step.conceptId));
      expect(run.size).toBeGreaterThan(1);
    }
    // Priority still shows: the important concept is practised most.
    const count = (id: string) => steps.filter((step) => step.conceptId === id).length;
    expect(count('a')).toBeGreaterThan(count('b'));
    expect(session.next).not.toBeNull();
  });

  it('secures a concept with recognition material only at its own top', () => {
    const { session } = play([concept('a', 1)], [item('a1', 'a', 'recognition')], () => 1);
    expect(session.progress.get('a')?.secure).toBe(true);
  });

  it('skips concepts without material and ends when every concept is secure', () => {
    const { steps, session } = play(
      [concept('a', 1), concept('empty', 5), concept('b', 1)],
      [...ladder('a'), ...ladder('b')],
      () => 1,
    );
    expect(steps.every((step) => step.conceptId !== 'empty')).toBe(true);
    expect(session.progress.has('empty')).toBe(false);
    expect([...session.progress.values()].every((state) => state.secure)).toBe(true);
    expect(session.next).toBeNull();
  });

  it('rebuilds the same session from the same answers', () => {
    const concepts = [concept('a', 1), concept('b', 1)];
    const items = [
      ...ladder('a'),
      ...ladder('b'),
      item('a-mcq2', 'a', 'recognition'),
      item('b-mcq2', 'b', 'recognition'),
    ];
    const first = play(concepts, items, () => 0, 12).steps;
    expect(play(concepts, items, () => 0, 12).steps).toEqual(first);
    // With two items on a rung, a wrong answer is not followed by the same item.
    for (let i = 1; i < first.length; i += 1)
      if (first[i]?.conceptId === first[i - 1]?.conceptId)
        expect(first[i]?.itemId).not.toBe(first[i - 1]?.itemId);
  });
});
