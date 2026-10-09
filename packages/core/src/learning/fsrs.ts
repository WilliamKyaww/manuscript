import {
  type Card,
  createEmptyCard,
  type FSRS,
  fsrs,
  type Grade,
  generatorParameters,
  State,
  type StepUnit,
} from 'ts-fsrs';
import { z } from 'zod';

/**
 * Spaced-repetition scheduling (learning-system.md §3.1, ADR-0011): FSRS-6 through ts-fsrs, behind
 * types of our own so that the database, the API and the UI never depend on the library's. Every
 * function takes the time explicitly, so the same review on the same date always gives the same
 * schedule (ts-fsrs seeds its interval fuzz from the card itself).
 */

export const REVIEW_STATES = ['new', 'learning', 'review', 'relearning'] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

export const RATINGS = [1, 2, 3, 4] as const;
export type ReviewRating = (typeof RATINGS)[number];
export const RATING_LABELS: Record<ReviewRating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

/** A card face's schedule: what ts-fsrs calls a card, in our own shape (dates as ISO strings). */
export const ScheduleSchema = z.object({
  due: z.string(),
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  learningSteps: z.number().int(),
  reps: z.number().int(),
  lapses: z.number().int(),
  state: z.enum(REVIEW_STATES),
  lastReview: z.string().nullable(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

const STEP = /^\d+(\.\d+)?[mhd]$/;
const StepSchema = z.string().regex(STEP, 'Steps look like 1m, 10m, 1h or 1d.');

export const ReviewSettingsSchema = z.object({
  /** The chance of remembering a card when it comes due (0.80–0.95). */
  desiredRetention: z.number().min(0.8).max(0.95),
  maximumIntervalDays: z.number().int().min(1).max(36_500),
  learningSteps: z.array(StepSchema).max(10),
  relearningSteps: z.array(StepSchema).max(10),
  /** Spread due dates a little, so cards learnt together do not stay together. */
  fuzz: z.boolean(),
  newPerDay: z.number().int().min(0).max(9_999),
  /** At most this many reviews a day (null: no limit). */
  reviewsPerDay: z.number().int().min(1).max(99_999).nullable(),
});
export type ReviewSettings = z.infer<typeof ReviewSettingsSchema>;

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = {
  desiredRetention: 0.9,
  maximumIntervalDays: 365,
  learningSteps: ['1m', '10m'],
  relearningSteps: ['10m'],
  fuzz: true,
  newPerDay: 20,
  reviewsPerDay: null,
};

/** Retention above this costs many more reviews for little gain; the settings warn. */
export const HIGH_RETENTION = 0.93;

const STATE_OF: Record<State, ReviewState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};
const STATE_TO: Record<ReviewState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const toSchedule = (card: Card): Schedule => ({
  due: card.due.toISOString(),
  stability: card.stability,
  difficulty: card.difficulty,
  elapsedDays: card.elapsed_days,
  scheduledDays: card.scheduled_days,
  learningSteps: card.learning_steps,
  reps: card.reps,
  lapses: card.lapses,
  state: STATE_OF[card.state],
  lastReview: card.last_review ? card.last_review.toISOString() : null,
});

const toCard = (schedule: Schedule): Card => ({
  due: new Date(schedule.due),
  stability: schedule.stability,
  difficulty: schedule.difficulty,
  elapsed_days: schedule.elapsedDays,
  scheduled_days: schedule.scheduledDays,
  learning_steps: schedule.learningSteps,
  reps: schedule.reps,
  lapses: schedule.lapses,
  state: STATE_TO[schedule.state],
  ...(schedule.lastReview ? { last_review: new Date(schedule.lastReview) } : {}),
});

export interface Scheduler {
  /** A face that has never been reviewed. */
  initial(now: Date): Schedule;
  /** What each rating would do, for the buttons: the next due time and the interval. */
  preview(schedule: Schedule, now: Date): Record<ReviewRating, { due: string; intervalMs: number }>;
  /** Applies a rating. */
  rate(schedule: Schedule, rating: ReviewRating, now: Date): Schedule;
  /** The chance of recalling the face now (null for a face never reviewed). */
  retrievability(schedule: Schedule, now: Date): number | null;
}

export function createScheduler(settings: ReviewSettings = DEFAULT_REVIEW_SETTINGS): Scheduler {
  const engine: FSRS = fsrs(
    generatorParameters({
      request_retention: settings.desiredRetention,
      maximum_interval: settings.maximumIntervalDays,
      enable_fuzz: settings.fuzz,
      enable_short_term: true,
      learning_steps: settings.learningSteps as StepUnit[],
      relearning_steps: settings.relearningSteps as StepUnit[],
    }),
  );
  return {
    initial: (now) => toSchedule(createEmptyCard(now)),
    preview(schedule, now) {
      const outcomes = engine.repeat(toCard(schedule), now);
      const result = {} as Record<ReviewRating, { due: string; intervalMs: number }>;
      for (const rating of RATINGS) {
        const due = outcomes[rating as Grade].card.due;
        result[rating] = { due: due.toISOString(), intervalMs: due.getTime() - now.getTime() };
      }
      return result;
    },
    rate: (schedule, rating, now) =>
      toSchedule(engine.next(toCard(schedule), now, rating as Grade).card),
    retrievability: (schedule, now) =>
      schedule.state === 'new' ? null : engine.get_retrievability(toCard(schedule), now, false),
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A short interval for buttons and lists: "1 min", "10 min", "3 h", "4 d", "2.5 mo", "1.2 y". */
export function formatInterval(ms: number): string {
  if (ms < MINUTE) return '< 1 min';
  if (ms < HOUR) return `${Math.round(ms / MINUTE)} min`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)} d`;
  if (days < 365) {
    const months = Math.round((days / 30.4) * 10) / 10;
    return `${Number.isInteger(months) ? months : months.toFixed(1)} mo`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `${Number.isInteger(years) ? years : years.toFixed(1)} y`;
}
