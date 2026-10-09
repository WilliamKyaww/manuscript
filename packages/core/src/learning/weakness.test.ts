import { describe, expect, it } from 'vitest';
import { type ConceptMastery, conceptMastery } from './mastery';
import { type WeaknessEvidence, weakSignals, windowAccuracy } from './weakness';

const none: ConceptMastery = conceptMastery({
  cards: [],
  answers: [],
  itemsLinked: 0,
  itemsPractised: 0,
});
const evidence = (overrides: Partial<WeaknessEvidence>): WeaknessEvidence => ({
  mastery: none,
  answers: [],
  lapses: 0,
  recallBefore: null,
  itemsLinked: 3,
  ...overrides,
});
const kinds = (input: Partial<WeaknessEvidence>) => weakSignals(evidence(input)).map((s) => s.kind);

describe('weak-area signals', () => {
  it('flags concepts without material', () => {
    expect(kinds({ itemsLinked: 0 })).toEqual(['no_material']);
    expect(kinds({})).toEqual([]);
  });

  it('calls a concept weak only with enough evidence', () => {
    const cards = (n: number, r: number) =>
      Array.from({ length: n }, () => ({
        retrievability: r,
        stability: 5,
        state: 'review' as const,
      }));
    const weak = conceptMastery({
      cards: cards(4, 0.4),
      answers: [],
      itemsLinked: 4,
      itemsPractised: 4,
    });
    expect(kinds({ mastery: weak })).toEqual(['weak']);
    const thin = conceptMastery({
      cards: cards(1, 0.4),
      answers: [],
      itemsLinked: 4,
      itemsPractised: 1,
    });
    expect(kinds({ mastery: thin })).toEqual([]);
  });

  it('sees accuracy slipping between fortnights', () => {
    const answers = [
      { score: 0.5, ageDays: 1 },
      { score: 0.5, ageDays: 3 },
      { score: 1, ageDays: 15 },
      { score: 0.5, ageDays: 20 },
    ];
    expect(windowAccuracy(answers, 0, 14)).toEqual({ mean: 0.5, count: 2 });
    expect(kinds({ answers })).toEqual(['slipping']);
    expect(weakSignals(evidence({ answers }))[0]?.reason).toBe(
      'Accuracy fell from 75 % to 50 % over the last 14 days.',
    );
    // One answer in a window is not enough to call it a trend.
    expect(kinds({ answers: answers.slice(1) })).toEqual([]);
  });

  it('counts lapses and forgetting', () => {
    expect(kinds({ lapses: 2 })).toEqual(['lapsing']);
    const fading = conceptMastery({
      cards: [{ retrievability: 0.6, stability: 3, state: 'review' }],
      answers: [],
      itemsLinked: 1,
      itemsPractised: 1,
    });
    expect(kinds({ mastery: fading, recallBefore: 0.9 })).toEqual(['forgotten']);
    expect(kinds({ mastery: fading, recallBefore: 0.8 })).toEqual([]);
  });
});
