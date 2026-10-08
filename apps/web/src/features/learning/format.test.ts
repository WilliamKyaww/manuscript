import { moduleSummary, requirementFor } from '@skb/core';
import { describe, expect, it } from 'vitest';
import {
  dueLabel,
  formatDue,
  formatPercent,
  formatWeight,
  headlineMark,
  requirementText,
} from './format';

describe('learning formats', () => {
  it('formats percentages and weights', () => {
    expect(formatPercent(70)).toBe('70 %');
    expect(formatPercent(72.46)).toBe('72.5 %');
    expect(formatWeight(0.4)).toBe('40 %');
  });

  it('explains what a target needs', () => {
    const marks = moduleSummary([
      { weight: 0.4, markAchieved: 70 },
      { weight: 0.6, markAchieved: null },
    ]);
    expect(requirementText(requirementFor(85, marks), 85, marks)).toBe(
      'Needs an average of 95 % on the remaining 60 % for 85 %.',
    );
    expect(requirementText(requirementFor(90, marks), 90, marks)).toBe(
      '90 % is out of reach: the best still possible is 88 %.',
    );
    expect(requirementText(requirementFor(20, marks), 20, marks)).toBe('20 % is already secured.');
    expect(requirementText(null, null, marks)).toBeNull();
    expect(headlineMark(marks)).toEqual({ label: 'So far', value: '70 %' });
  });

  it('describes deadlines', () => {
    expect(formatDue('2026-10-14')).toBe('Wed 14 Oct');
    expect(formatDue('2026-10-14T09:30')).toBe('Wed 14 Oct, 09:30');
    expect(dueLabel('2026-10-14', '2026-10-14')).toBe('today');
    expect(dueLabel('2026-10-15T10:00', '2026-10-14')).toBe('tomorrow');
    expect(dueLabel('2026-10-24', '2026-10-14')).toBe('in 10 days');
    expect(dueLabel('2026-10-01', '2026-10-14')).toBe('overdue');
  });
});
