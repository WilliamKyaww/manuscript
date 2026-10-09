import { describe, expect, it } from 'vitest';
import { reviewDay, shiftDay } from './days';

describe('the review day', () => {
  it('runs from 04:00 to 04:00 local time', () => {
    const late = reviewDay(new Date(2026, 9, 9, 3, 30));
    expect(late.key).toBe('2026-10-08');
    expect(late.start).toEqual(new Date(2026, 9, 8, 4, 0));
    expect(late.end).toEqual(new Date(2026, 9, 9, 4, 0));
    expect(reviewDay(new Date(2026, 9, 9, 4, 0)).key).toBe('2026-10-09');
    expect(reviewDay(new Date(2026, 9, 9, 23, 59)).key).toBe('2026-10-09');
  });

  it('moves by whole days, across month ends', () => {
    const day = reviewDay(new Date(2026, 9, 30, 12, 0));
    expect(shiftDay(day, 2).key).toBe('2026-11-01');
    expect(shiftDay(day, -30).key).toBe('2026-09-30');
  });
});
