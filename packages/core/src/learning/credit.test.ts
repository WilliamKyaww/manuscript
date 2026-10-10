import { describe, expect, it } from 'vitest';
import { CREDIT, propagateCredit } from './credit';
import { conceptMastery } from './mastery';

const right = (ageDays = 0, assisted = false) => ({ score: 1, ageDays, assisted });
const wrong = (ageDays = 0) => ({ score: 0, ageDays, assisted: false });

const edges = [
  { from: 'logs', to: 'raft', weight: null },
  { from: 'ordering', to: 'logs', weight: 0.3 },
];

describe('credit along prerequisites', () => {
  it('gives a correct answer on a concept a little credit towards what it builds on', () => {
    const { implicit } = propagateCredit({
      edges,
      answers: new Map([['raft', [right(), right()]]]),
      accuracy: new Map(),
    });
    const logs = implicit.get('logs') ?? [];
    expect(logs).toHaveLength(2);
    expect(logs[0]).toMatchObject({ factor: 0.2, hops: 1, fromId: 'raft' });
    // Two steps: 0.2 × 0.3, and no further.
    expect(implicit.get('ordering')?.[0]).toMatchObject({ factor: 0.2 * 0.3, hops: 2 });
    expect(implicit.has('raft')).toBe(false);
  });

  it('uses only correct answers, and never more than 0.3 an edge', () => {
    const { implicit } = propagateCredit({
      edges: [{ from: 'a', to: 'b', weight: 0.9 }],
      answers: new Map([['b', [right(), wrong(), { score: 0.5, ageDays: 0, assisted: false }]]]),
      accuracy: new Map(),
    });
    expect(implicit.get('a')).toHaveLength(1);
    expect(implicit.get('a')?.[0]?.factor).toBe(CREDIT.maxWeight);
  });

  it('ignores credit towards a prerequisite the student is shaky on', () => {
    const answers = new Map([['raft', [right()]]]);
    expect(
      propagateCredit({ edges, answers, accuracy: new Map([['logs', 0.59]]) }).implicit.has('logs'),
    ).toBe(false);
    expect(
      propagateCredit({ edges, answers, accuracy: new Map([['logs', 0.6]]) }).implicit.has('logs'),
    ).toBe(true);
    // No accuracy to speak of yet is not a reason to refuse.
    expect(
      propagateCredit({ edges, answers, accuracy: new Map([['logs', null]]) }).implicit.has('logs'),
    ).toBe(true);
  });

  it('does not loop on a cycle', () => {
    const { implicit } = propagateCredit({
      edges: [
        { from: 'a', to: 'b', weight: null },
        { from: 'b', to: 'a', weight: null },
      ],
      answers: new Map([['a', [right()]]]),
      accuracy: new Map(),
    });
    expect(implicit.get('b')).toHaveLength(1);
    expect(implicit.has('a')).toBe(false);
  });

  it('flags what builds on a prerequisite answered wrongly lately, and nothing else', () => {
    const { atRisk } = propagateCredit({
      edges,
      answers: new Map([
        ['logs', [wrong(3)]],
        ['ordering', [wrong(20)]],
      ]),
      accuracy: new Map(),
    });
    expect(atRisk.get('raft')).toEqual([{ id: 'logs', failures: 1 }]);
    // A failure three weeks ago is not recent.
    expect(atRisk.has('logs')).toBe(false);
  });
});

describe('credit in mastery', () => {
  const base = { cards: [], itemsLinked: 2, itemsPractised: 1 };

  it('counts like answers, scaled by the edge weights, and says how much', () => {
    const own = conceptMastery({ ...base, answers: [right(), right()] });
    expect(own.implicitWeight).toBe(0);
    const credit = [0, 0, 0].map(() => ({
      score: 1,
      ageDays: 0,
      assisted: false,
      factor: 0.2,
      fromId: 'x',
      hops: 1,
    }));
    // Nothing of its own: 3 × 0.2 = 0.6 of answer weight is enough to say something, little to rely on.
    const only = conceptMastery({ ...base, answers: [], implicit: credit });
    expect(only.answerWeight).toBeCloseTo(0.6);
    expect(only.implicitWeight).toBeCloseTo(0.6);
    expect(only.mastery).toBeCloseTo(1);
    expect(only.confidence).toBe('low');
    expect(only.stage).not.toBe('mastered');
  });

  it('lifts a mixed record only a little', () => {
    const answers = [right(), wrong(), wrong()];
    const without = conceptMastery({ ...base, answers });
    const credit = [0, 1, 2, 3, 4].map(() => ({
      score: 1,
      ageDays: 0,
      assisted: false,
      factor: 0.2,
      fromId: 'x',
      hops: 1,
    }));
    const withCredit = conceptMastery({ ...base, answers, implicit: credit });
    expect(withCredit.mastery ?? 0).toBeGreaterThan(without.mastery ?? 1);
    // One whole answer's worth of credit among three real ones moves it by about a fifth.
    expect((withCredit.mastery ?? 0) - (without.mastery ?? 0)).toBeLessThan(0.2);
    expect(withCredit.implicitWeight).toBeCloseTo(1);
  });

  it('weighs credit by age and assistance like any answer', () => {
    const fresh = conceptMastery({
      ...base,
      answers: [],
      implicit: [{ score: 1, ageDays: 0, assisted: false, factor: 1, fromId: 'x', hops: 1 }],
    });
    const old = conceptMastery({
      ...base,
      answers: [],
      implicit: [{ score: 1, ageDays: 21, assisted: true, factor: 1, fromId: 'x', hops: 1 }],
    });
    expect(fresh.implicitWeight).toBe(1);
    expect(old.implicitWeight).toBe(0);
  });
});
