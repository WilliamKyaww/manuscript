import { describe, expect, it } from 'vitest';
import { calibrate, simulateRecall } from './calibration';

describe('recall calibration', () => {
  it('measures bins, the Brier score and the calibration error', () => {
    const report = calibrate([
      { predicted: 0.9, recalled: true },
      { predicted: 0.9, recalled: true },
      { predicted: 0.9, recalled: false },
      { predicted: 0.6, recalled: false },
    ]);
    expect(report.count).toBe(4);
    expect(report.recalled).toBe(0.5);
    const ninety = report.bins.find((bin) => bin.from === 0.9);
    expect(ninety).toMatchObject({ count: 3, recalled: 2 / 3 });
    expect(ninety?.meanPredicted).toBeCloseTo(0.9);
    // (3 × 0.01 + 0.81 + 0.36) / 4 = 0.3
    expect(report.brier).toBeCloseTo(0.3);
    // ¾ × |0.9 − ⅔| + ¼ × |0.6 − 0| = 0.325
    expect(report.expectedCalibrationError).toBeCloseTo(0.325);
    expect(calibrate([]).expectedCalibrationError).toBeNull();
  });

  it('finds a student who forgets as the scheduler predicts well calibrated', () => {
    const report = calibrate(simulateRecall({ faces: 300, days: 180, memory: 1, seed: 1 }));
    expect(report.count).toBeGreaterThan(1_000);
    expect(report.expectedCalibrationError).toBeLessThan(0.03);
    expect(Math.abs((report.meanPredicted ?? 0) - (report.recalled ?? 0))).toBeLessThan(0.02);
  });

  it('finds the gap when a student forgets faster than predicted, and how wide it is', () => {
    // FSRS-6's curve is flat: memories half as long move recall from about 0.89 to 0.85.
    const half = calibrate(simulateRecall({ faces: 300, days: 180, memory: 0.5, seed: 1 }));
    expect((half.meanPredicted ?? 0) - (half.recalled ?? 0)).toBeGreaterThan(0.025);
    const quarter = calibrate(simulateRecall({ faces: 300, days: 180, memory: 0.25, seed: 1 }));
    expect((quarter.meanPredicted ?? 0) - (quarter.recalled ?? 0)).toBeGreaterThan(0.08);
    expect(quarter.expectedCalibrationError).toBeGreaterThan(0.08);
  });
});
