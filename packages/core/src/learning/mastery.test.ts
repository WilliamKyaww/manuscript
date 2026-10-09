import { describe, expect, it } from 'vitest';
import { type CardEvidence, conceptMastery, MASTERY, rollUp } from './mastery';

const card = (retrievability: number, stability = 30, state: CardEvidence['state'] = 'review') => ({
  retrievability,
  stability,
  state,
});
const answer = (score: number, ageDays = 0, assisted = false) => ({ score, ageDays, assisted });

describe('concept mastery', () => {
  it('is new without evidence', () => {
    expect(
      conceptMastery({ cards: [], answers: [], itemsLinked: 0, itemsPractised: 0 }),
    ).toMatchObject({
      mastery: null,
      stage: 'new',
      confidence: 'none',
      coverage: null,
    });
  });

  it('reproduces the worked formula by hand', () => {
    // Cards: recall (0.9 + 0.7) / 2 = 0.8 from 2 faces.
    // Answers: today 1 (w 1) and 21 days ago 0 (w 0.5): accuracy 1/1.5 = 0.667, weight 1.5.
    // Mastery: (0.8·2 + 1.5·0.667·1.5) / (2 + 1.5·1.5) = (1.6 + 1.5) / 4.25 = 0.729.
    const result = conceptMastery({
      cards: [card(0.9), card(0.7)],
      answers: [answer(1, 0), answer(0, 21)],
      itemsLinked: 4,
      itemsPractised: 3,
    });
    expect(result.recall).toBeCloseTo(0.8);
    expect(result.recallCount).toBe(2);
    expect(result.accuracy).toBeCloseTo(2 / 3);
    expect(result.answerWeight).toBeCloseTo(1.5);
    expect(result.mastery).toBeCloseTo((0.8 * 2 + 1.5 * (2 / 3) * 1.5) / (2 + 1.5 * 1.5));
    expect(result.evidence).toBeCloseTo(4.25);
    expect(result.confidence).toBe('medium');
    expect(result.stage).toBe('practised');
    expect(result.coverage).toBe(0.75);
  });

  it('ignores answers that weigh too little, counts help as half and uses the last 20', () => {
    expect(
      conceptMastery({ cards: [], answers: [answer(1, 70)], itemsLinked: 1, itemsPractised: 1 })
        .accuracy,
    ).toBeNull();
    const assisted = conceptMastery({
      cards: [],
      answers: [answer(1, 0, true)],
      itemsLinked: 1,
      itemsPractised: 1,
    });
    expect(assisted.answerWeight).toBe(0.5);
    const many = [
      ...Array.from({ length: 20 }, () => answer(1)),
      ...Array.from({ length: 30 }, () => answer(0)),
    ];
    expect(
      conceptMastery({ cards: [], answers: many, itemsLinked: 1, itemsPractised: 1 }).accuracy,
    ).toBe(1);
  });

  it('assigns stages by the published rules', () => {
    const stage = (cards: CardEvidence[], answers = [] as ReturnType<typeof answer>[]) =>
      conceptMastery({ cards, answers, itemsLinked: 1, itemsPractised: 1 }).stage;
    expect(stage([card(0.5)])).toBe('learning');
    expect(stage([card(0.95, 30, 'relearning')])).toBe('learning');
    expect(stage([card(0.7)])).toBe('practised');
    expect(stage([card(0.85)])).toBe('confident');
    // High mastery but little evidence stays confident.
    expect(stage([card(0.95)])).toBe('confident');
    const eight = Array.from({ length: 8 }, () => card(0.95, 30));
    expect(stage(eight)).toBe('mastered');
    // …unless the cards do not last yet.
    expect(stage(Array.from({ length: 8 }, () => card(0.95, 10)))).toBe('confident');
    expect(MASTERY.stage.mastered).toBe(0.9);
  });

  it('keeps mastery between 0 and 1 for any evidence', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let round = 0; round < 200; round += 1) {
      const result = conceptMastery({
        cards: Array.from({ length: Math.floor(random() * 6) }, () =>
          card(random(), random() * 60),
        ),
        answers: Array.from({ length: Math.floor(random() * 30) }, () =>
          answer(Math.round(random() * 2) / 2, random() * 100, random() < 0.3),
        ),
        itemsLinked: 5,
        itemsPractised: Math.floor(random() * 6),
      });
      if (result.mastery !== null) {
        expect(result.mastery).toBeGreaterThanOrEqual(0);
        expect(result.mastery).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('roll-ups', () => {
  it('separates mastery of practised material from readiness', () => {
    const result = rollUp([
      { importance: 1, mastery: 0.9 },
      { importance: 2, mastery: 0.6 },
      { importance: 1, mastery: null },
    ]);
    expect(result.mastery).toBeCloseTo((0.9 + 2 * 0.6) / 3);
    expect(result.readiness).toBeCloseTo((0.9 + 2 * 0.6) / 4);
    expect(result).toMatchObject({ coverage: 2 / 3, practised: 2, total: 3 });
    expect(rollUp([])).toMatchObject({ mastery: null, readiness: null });
    expect(rollUp([{ importance: 1, mastery: null }])).toMatchObject({
      mastery: null,
      readiness: 0,
      coverage: 0,
    });
  });
});
