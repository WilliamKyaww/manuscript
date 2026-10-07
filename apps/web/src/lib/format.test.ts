import { describe, expect, it } from 'vitest';
import { formatDateTime, formatLongDate, formatUptime, greeting } from './format';

describe('formatUptime', () => {
  it.each([
    [5, '5 s'],
    [59, '59 s'],
    [60, '1 min'],
    [3599, '59 min'],
    [3600, '1 h'],
    [3725, '1 h 2 min'],
  ])('formats %d seconds as %s', (seconds, expected) => {
    expect(formatUptime(seconds)).toBe(expected);
  });
});

describe('greeting', () => {
  it('follows the time of day', () => {
    expect(greeting(new Date(2026, 9, 4, 8, 0))).toBe('Good morning');
    expect(greeting(new Date(2026, 9, 4, 12, 0))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 9, 4, 19, 30))).toBe('Good evening');
  });
});

describe('formatLongDate', () => {
  it('uses the British long date format', () => {
    expect(formatLongDate(new Date(2026, 9, 4))).toBe('Sunday 4 October 2026');
  });
});

describe('formatDateTime', () => {
  it('uses the British short format in local time', () => {
    expect(formatDateTime(new Date(2026, 9, 4, 13, 5))).toBe('4 Oct 2026, 13:05');
  });
});
