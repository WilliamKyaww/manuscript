import { describe, expect, it } from 'vitest';
import { ageInDays, answerWeight } from './compute';

// Local times: the review day starts at 04:00 wherever the tests run.
const local = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0);

describe('answer ages', () => {
  it('count whole review days, so a fresh answer weighs exactly 1', () => {
    expect(ageInDays(local(9, 5).toISOString(), local(9, 23))).toBe(0);
    // 03:00 still belongs to the day before.
    expect(ageInDays(local(9, 3).toISOString(), local(9, 5))).toBe(1);
    expect(ageInDays(local(1, 12).toISOString(), local(22, 12))).toBe(21);
    expect(answerWeight(local(9, 5).toISOString(), false, local(9, 23))).toBe(1);
    expect(answerWeight(local(1, 12).toISOString(), true, local(22, 12))).toBe(0.25);
  });
});
