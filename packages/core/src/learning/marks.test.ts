import { describe, expect, it } from 'vitest';
import { courseSummary, moduleSummary, requirementFor, summariseMarks, weightsFit } from './marks';

describe('module marks', () => {
  it('matches a hand calculation with one assessment marked', () => {
    // Coursework 40 % marked 70; exam 60 % to come. Secured 0.4 × 70 = 28 points.
    const summary = moduleSummary([
      { weight: 0.4, markAchieved: 70 },
      { weight: 0.6, markAchieved: null },
    ]);
    expect(summary).toMatchObject({ secured: 28, averageSoFar: 70, final: null, best: 88 });
    expect(summary.pendingWeight).toBeCloseTo(0.6);
    // 85 overall needs (85 − 28) / 0.6 = 95 on the exam.
    const requirement = requirementFor(85, summary);
    expect(requirement.kind).toBe('needed');
    if (requirement.kind === 'needed') expect(requirement.average).toBeCloseTo(95);
    expect(requirementFor(90, summary)).toEqual({ kind: 'impossible', best: 88 });
    expect(requirementFor(25, summary)).toEqual({ kind: 'secured' });
  });

  it('gives the final mark once everything is marked', () => {
    const summary = moduleSummary([
      { weight: 0.25, markAchieved: 80 },
      { weight: 0.25, markAchieved: 60 },
      { weight: 0.5, markAchieved: 90 },
    ]);
    expect(summary.final).toBeCloseTo(80);
    expect(requirementFor(85, summary).kind).toBe('missed');
    expect(requirementFor(80, summary).kind).toBe('secured');
  });

  it('counts weight not yet assigned to an assessment as still to come', () => {
    const summary = moduleSummary([{ weight: 0.3, markAchieved: 100 }]);
    expect(summary.unassignedWeight).toBeCloseTo(0.7);
    expect(summary.secured).toBeCloseTo(30);
    expect(summary.final).toBeNull();
    const requirement = requirementFor(72, summary);
    if (requirement.kind !== 'needed') throw new Error('expected a requirement');
    expect(requirement.average).toBeCloseTo(60);
  });

  it('clamps marks and ignores weightless items', () => {
    expect(
      summariseMarks(
        [
          { weight: 1, mark: 140 },
          { weight: 0, mark: 10 },
        ],
        1,
      ).final,
    ).toBe(100);
    expect(moduleSummary([])).toMatchObject({ secured: 0, best: 100, averageSoFar: null });
  });
});

describe('course average', () => {
  it('weights modules by credits', () => {
    // 15 credits at 70 and 30 credits at 85 → (15·70 + 30·85) / 45 = 80.
    const summary = courseSummary([
      { credits: 15, assessments: [{ weight: 1, markAchieved: 70 }] },
      { credits: 30, assessments: [{ weight: 1, markAchieved: 85 }] },
      { credits: 0, assessments: [{ weight: 1, markAchieved: 0 }] },
    ]);
    expect(summary.final).toBeCloseTo(80);
  });

  it('works out what the remaining work must average for a target', () => {
    // Module A (20 credits) finished at 80; module B (40 credits): 50 % marked 90, an exam to come.
    const summary = courseSummary([
      { credits: 20, assessments: [{ weight: 1, markAchieved: 80 }] },
      {
        credits: 40,
        assessments: [
          { weight: 0.5, markAchieved: 90 },
          { weight: 0.5, markAchieved: null },
        ],
      },
    ]);
    // Secured: (20·80 + 20·90) / 60 = 56.67; remaining weight 20 of 60.
    expect(summary.secured).toBeCloseTo(56.667, 2);
    expect(summary.averageSoFar).toBeCloseTo(85);
    const requirement = requirementFor(85, summary);
    if (requirement.kind !== 'needed') throw new Error('expected a requirement');
    // (85 − 56.67) × 60 / 20 = 85.
    expect(requirement.average).toBeCloseTo(85);
  });
});

describe('weightsFit', () => {
  it('allows weights up to 100 % with rounding', () => {
    expect(weightsFit([0.3333333, 0.3333333, 0.3333334])).toBe(true);
    expect(weightsFit([0.6, 0.5])).toBe(false);
  });
});
