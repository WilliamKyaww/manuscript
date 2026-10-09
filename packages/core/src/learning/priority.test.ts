import { describe, expect, it } from 'vitest';
import {
  conceptPriority,
  moduleExposures,
  strongestExposure,
  unassignedExposure,
  urgency,
} from './priority';

describe('urgency', () => {
  it('is 14 / days, between 0.25 and 3', () => {
    expect(urgency(14)).toBe(1);
    expect(urgency(7)).toBe(2);
    expect(urgency(0)).toBe(3);
    expect(urgency(1)).toBe(3);
    expect(urgency(200)).toBe(0.25);
  });
});

describe('module exposures', () => {
  const modules = [
    { id: 'm1', code: 'COC251', credits: 30 },
    { id: 'm2', code: 'COC256', credits: 15 },
    { id: 'm3', code: 'COC257', credits: null },
  ];
  const assessments = [
    { id: 'a1', moduleId: 'm1', title: 'Exam', weight: 0.7, dueAt: '2026-10-23' },
    { id: 'a2', moduleId: 'm1', title: 'Coursework', weight: 0.3, dueAt: '2026-10-12' },
    { id: 'a3', moduleId: 'm2', title: 'Exam', weight: 1, dueAt: '2026-09-01' },
  ];

  it('takes the most pressing upcoming assessment', () => {
    const exposures = moduleExposures(modules, assessments, '2026-10-09');
    // Unknown credits count as the mean of the known ones: 22.5 of 67.5.
    const m1 = exposures.get('m1');
    // Exam: 0.7 × 30/67.5 × 14/14 = 0.311; coursework: 0.3 × 30/67.5 × min(14/3, 3) = 0.4.
    expect(m1?.assessment?.id).toBe('a2');
    expect(m1?.stake).toBeCloseTo((0.3 * 30) / 67.5);
    expect(m1?.urgency).toBe(3);
    // A past assessment does not count: the whole module at the lowest urgency.
    expect(exposures.get('m2')).toMatchObject({ assessment: null, urgency: 0.25 });
    expect(exposures.get('m2')?.stake).toBeCloseTo(15 / 67.5);
    expect(exposures.get('m3')?.stake).toBeCloseTo(22.5 / 67.5);
  });

  it('picks a concept’s strongest module and falls back to an equal share', () => {
    const exposures = moduleExposures(modules, assessments, '2026-10-09');
    const both = strongestExposure(
      [exposures.get('m2'), exposures.get('m1')].filter((e) => e !== undefined),
      3,
    );
    expect(both.moduleId).toBe('m1');
    expect(strongestExposure([], 4)).toEqual(unassignedExposure(4));
    expect(unassignedExposure(4).stake).toBe(0.25);
  });
});

describe('priority', () => {
  it('multiplies gap, stake, urgency, importance and risk', () => {
    const exposure = { ...unassignedExposure(1), stake: 0.2, urgency: 2 };
    expect(conceptPriority({ mastery: 0.4, importance: 1.5, exposure })).toBeCloseTo(
      0.6 * 0.2 * 2 * 1.5,
    );
    expect(conceptPriority({ mastery: null, importance: 1, exposure, atRisk: true })).toBeCloseTo(
      1 * 0.2 * 2 * 1.25,
    );
  });
});
