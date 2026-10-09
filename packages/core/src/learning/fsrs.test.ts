import { createEmptyCard, fsrs, type Grade, generatorParameters } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';
import {
  createScheduler,
  DEFAULT_REVIEW_SETTINGS,
  formatInterval,
  type ReviewRating,
  ReviewSettingsSchema,
  type Schedule,
} from './fsrs';

const start = new Date('2026-10-09T09:00:00.000Z');
const minutes = (n: number) => n * 60_000;
const days = (n: number) => n * 86_400_000;

/** Reviews a face with a sequence of ratings, each when it next falls due. */
function run(ratings: ReviewRating[]): Schedule[] {
  const scheduler = createScheduler();
  let schedule = scheduler.initial(start);
  const history: Schedule[] = [];
  let now = start;
  for (const rating of ratings) {
    schedule = scheduler.rate(schedule, rating, now);
    history.push(schedule);
    now = new Date(schedule.due);
  }
  return history;
}

describe('the scheduler', () => {
  it('matches ts-fsrs itself, review after review', () => {
    const reference = fsrs(
      generatorParameters({
        request_retention: 0.9,
        maximum_interval: 365,
        enable_fuzz: true,
        enable_short_term: true,
        learning_steps: ['1m', '10m'],
        relearning_steps: ['10m'],
      }),
    );
    const ratings: ReviewRating[] = [3, 3, 3, 1, 3, 4, 2, 3];
    let card = createEmptyCard(start);
    let now = start;
    const expected: string[] = [];
    for (const rating of ratings) {
      card = reference.next(card, now, rating as Grade).card;
      expected.push(card.due.toISOString());
      now = card.due;
    }
    expect(run(ratings).map((schedule) => schedule.due)).toEqual(expected);
    // And again: the same reviews on the same dates give the same schedule (fuzz is seeded).
    expect(run(ratings)).toEqual(run(ratings));
  });

  it('starts new faces with the learning steps', () => {
    const scheduler = createScheduler();
    const fresh = scheduler.initial(start);
    expect(fresh).toMatchObject({ state: 'new', reps: 0, lapses: 0, lastReview: null });
    expect(scheduler.retrievability(fresh, start)).toBeNull();
    const preview = scheduler.preview(fresh, start);
    expect(preview[1].intervalMs).toBe(minutes(1));
    expect(preview[2].intervalMs).toBe(minutes(6));
    expect(preview[3].intervalMs).toBe(minutes(10));
    expect(preview[4].intervalMs).toBeGreaterThanOrEqual(days(1));
  });

  it('graduates to review, and a lapse sends a face back to relearning', () => {
    const history = run([3, 3, 3, 3, 1]);
    expect(history.map((schedule) => schedule.state)).toEqual([
      'learning',
      'review',
      'review',
      'review',
      'relearning',
    ]);
    const lapsed = history.at(-1) as Schedule;
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.reps).toBe(5);
    // Intervals grow while the face is remembered.
    const gaps = history
      .slice(1, 4)
      .map((schedule) => Date.parse(schedule.due) - Date.parse(schedule.lastReview ?? ''));
    expect(gaps[1]).toBeGreaterThan(gaps[0] as number);
    expect(gaps[2]).toBeGreaterThan(gaps[1] as number);
  });

  it('estimates retrievability falling with time', () => {
    const scheduler = createScheduler();
    const reviewed = run([3, 3]).at(-1) as Schedule;
    const at = (offset: number) =>
      scheduler.retrievability(reviewed, new Date(Date.parse(reviewed.lastReview ?? '') + offset));
    expect(at(0)).toBeCloseTo(1, 2);
    expect(at(days(1))).toBeLessThan(1);
    expect(at(days(30)) as number).toBeLessThan(at(days(1)) as number);
  });

  it('respects the maximum interval and desired retention', () => {
    const short = createScheduler({
      ...DEFAULT_REVIEW_SETTINGS,
      maximumIntervalDays: 3,
      fuzz: false,
    });
    let schedule = short.initial(start);
    let now = start;
    for (const rating of [4, 4, 4, 4] as ReviewRating[]) {
      schedule = short.rate(schedule, rating, now);
      now = new Date(schedule.due);
    }
    // ts-fsrs caps each interval, then keeps Hard < Good < Easy at least a day apart, so the
    // longest can pass the maximum by two days.
    expect(schedule.scheduledDays).toBeLessThanOrEqual(3 + 2);
    const keen = createScheduler({
      ...DEFAULT_REVIEW_SETTINGS,
      desiredRetention: 0.95,
      fuzz: false,
    });
    const relaxed = createScheduler({
      ...DEFAULT_REVIEW_SETTINGS,
      desiredRetention: 0.8,
      fuzz: false,
    });
    const graduated = (scheduler: ReturnType<typeof createScheduler>) => {
      const first = scheduler.rate(scheduler.initial(start), 4, start);
      return scheduler.preview(first, new Date(first.due))[3].intervalMs;
    };
    expect(graduated(keen)).toBeLessThan(graduated(relaxed));
    expect(
      ReviewSettingsSchema.safeParse({ ...DEFAULT_REVIEW_SETTINGS, desiredRetention: 0.99 })
        .success,
    ).toBe(false);
    expect(
      ReviewSettingsSchema.safeParse({ ...DEFAULT_REVIEW_SETTINGS, learningSteps: ['10 minutes'] })
        .success,
    ).toBe(false);
  });
});

describe('formatInterval', () => {
  it.each([
    [30_000, '< 1 min'],
    [minutes(1), '1 min'],
    [minutes(10), '10 min'],
    [minutes(180), '3 h'],
    [days(4), '4 d'],
    [days(76), '2.5 mo'],
    [days(365), '1 y'],
    [days(440), '1.2 y'],
  ])('formats %d ms as %s', (ms, text) => {
    expect(formatInterval(ms)).toBe(text);
  });
});
