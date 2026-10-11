import {
  createScheduler,
  DEFAULT_REVIEW_SETTINGS,
  type ReviewSettings,
  type Schedule,
} from './fsrs';

/**
 * Calibration of predicted recall (Phase 21, task 21.04): when the scheduler says a face will be
 * recalled with probability 0.9, is it recalled about nine times in ten? Mastery's recall component is
 * exactly this prediction, averaged over a concept's faces, so this is how far mastery can be trusted.
 * Only reviews of faces in the review state count: learning steps are minutes apart and say little.
 */

export interface RecallObservation {
  /** The scheduler's chance of recall at the moment of the review. */
  predicted: number;
  /** Whether it was recalled (any rating but Again). */
  recalled: boolean;
}

export interface CalibrationBin {
  from: number;
  to: number;
  count: number;
  meanPredicted: number | null;
  recalled: number | null;
}

export interface CalibrationReport {
  count: number;
  meanPredicted: number | null;
  recalled: number | null;
  /** Mean squared error of the predictions, 0 (perfect) to 1. */
  brier: number | null;
  /** Mean negative log-likelihood; lower is better, 0.69 is a coin toss. */
  logLoss: number | null;
  /** The bins' gaps between predicted and actual, weighted by their size: 0 is perfectly calibrated. */
  expectedCalibrationError: number | null;
  bins: CalibrationBin[];
}

/** Narrow bins where the predictions crowd (a desired retention of 0.9 puts most reviews near it). */
export const CALIBRATION_EDGES = [0, 0.5, 0.7, 0.8, 0.85, 0.9, 0.95, 1] as const;

const mean = (values: readonly number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

export function calibrate(
  observations: readonly RecallObservation[],
  edges: readonly number[] = CALIBRATION_EDGES,
): CalibrationReport {
  const bins: CalibrationBin[] = [];
  let gap = 0;
  for (let index = 0; index < edges.length - 1; index += 1) {
    const from = edges[index] as number;
    const to = edges[index + 1] as number;
    const last = index === edges.length - 2;
    const inside = observations.filter(
      (observation) =>
        observation.predicted >= from &&
        (last ? observation.predicted <= to : observation.predicted < to),
    );
    const meanPredicted = mean(inside.map((observation) => observation.predicted));
    const recalled = mean(inside.map((observation) => (observation.recalled ? 1 : 0)));
    if (meanPredicted !== null && recalled !== null)
      gap += (inside.length / observations.length) * Math.abs(meanPredicted - recalled);
    bins.push({ from, to, count: inside.length, meanPredicted, recalled });
  }
  const outcome = (observation: RecallObservation) => (observation.recalled ? 1 : 0);
  const clamp = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, p));
  return {
    count: observations.length,
    meanPredicted: mean(observations.map((observation) => observation.predicted)),
    recalled: mean(observations.map(outcome)),
    brier: mean(
      observations.map((observation) => (observation.predicted - outcome(observation)) ** 2),
    ),
    logLoss: mean(
      observations.map((observation) =>
        observation.recalled
          ? -Math.log(clamp(observation.predicted))
          : -Math.log(1 - clamp(observation.predicted)),
      ),
    ),
    expectedCalibrationError: observations.length === 0 ? null : gap,
    bins,
  };
}

/** mulberry32, so that a simulation is the same every time. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export interface SimulationOptions {
  faces: number;
  days: number;
  /**
   * How the simulated student's memory compares with the scheduler's model: 1 forgets exactly as it
   * predicts; 0.5 holds each memory half as long (the scheduler over-predicts).
   */
  memory: number;
  seed: number;
  settings?: ReviewSettings;
}

/**
 * Reviews of a simulated student, every face reviewed when due: a check that the measurement above
 * finds good calibration where there is some, and a gap where there is one.
 */
export function simulateRecall(options: SimulationOptions): RecallObservation[] {
  const settings = { ...(options.settings ?? DEFAULT_REVIEW_SETTINGS), fuzz: false };
  const scheduler = createScheduler(settings);
  const next = random(options.seed);
  const start = new Date('2026-01-05T09:00:00.000Z');
  const end = start.getTime() + options.days * 86_400_000;
  const observations: RecallObservation[] = [];
  for (let face = 0; face < options.faces; face += 1) {
    let schedule: Schedule = scheduler.initial(start);
    let at = new Date(start.getTime() + Math.floor(next() * 7) * 86_400_000);
    while (at.getTime() < end) {
      let rating: 1 | 3 = 3;
      if (schedule.state === 'review') {
        const predicted = scheduler.retrievability(schedule, at) ?? 1;
        const truth =
          scheduler.retrievability(
            { ...schedule, stability: schedule.stability * options.memory },
            at,
          ) ?? 1;
        const recalled = next() < truth;
        observations.push({ predicted, recalled });
        rating = recalled ? 3 : 1;
      }
      schedule = scheduler.rate(schedule, rating, at);
      at = new Date(schedule.due);
    }
  }
  return observations;
}
