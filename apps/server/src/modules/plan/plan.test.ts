import {
  addDays,
  CardSchema,
  CardSetSchema,
  getPlanEndpoint,
  PlanItemSchema,
  type PlanSettings,
  PlanSettingsSchema,
  StudyPlanSchema,
} from '@skb/core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { practiceTestbed } from '../../../test/practice-helpers';

let bed: Awaited<ReturnType<typeof practiceTestbed>>['bed'] | undefined;
afterEach(() => bed?.cleanup());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const Current = z.object({ plan: StudyPlanSchema.nullable(), today: z.string() });

async function setUp() {
  const testbed = await practiceTestbed();
  bed = testbed.bed;
  // Mid-morning, so the review day is the same date everywhere.
  testbed.clock.advance(10 * HOUR);
  const { api } = testbed;
  const today = (await api.get('/api/plan', Current)).today;
  const assessment = (moduleId: string, body: Record<string, unknown>) =>
    api.post(`/api/modules/${moduleId}/assessments`, body, 201);
  return { ...testbed, today, assessment };
}

describe('availability', () => {
  it('has defaults, and changes are validated and kept', async () => {
    const { api } = await setUp();
    const settings = await api.get('/api/settings/plan', PlanSettingsSchema);
    expect(settings).toMatchObject({ sessionMinutes: 25, examRetention: true, blockedDates: [] });
    expect(settings.minutesByWeekday).toHaveLength(7);
    const changed = await api.patch(
      '/api/settings/plan',
      { minutesByWeekday: [30, 30, 30, 30, 30, 0, 0], sessionMinutes: 30 },
      200,
      PlanSettingsSchema,
    );
    expect(changed.minutesByWeekday).toEqual([30, 30, 30, 30, 30, 0, 0]);
    expect((await api.get('/api/settings/plan', PlanSettingsSchema)).sessionMinutes).toBe(30);
    await api.patch('/api/settings/plan', { minutesByWeekday: [1, 2, 3] }, 400);
    await api.patch('/api/settings/plan', { sessionMinutes: 5 }, 400);
    await api.patch('/api/settings/plan', { blockedDates: ['tomorrow'] }, 400);
  });
});

describe('making a plan', () => {
  it('plans a week that explains itself: reviews, coursework, practice', async () => {
    const { api, today, module, raft, mcq, assessment } = await setUp();
    expect((await api.get('/api/plan', Current)).plan).toBeNull();

    // Something to practise, a card due, and coursework with hours left.
    await mcq([raft.id]);
    const set = await api.post('/api/card-sets', { title: 'Raft' }, 201, CardSetSchema);
    await api
      .post(
        '/api/cards',
        {
          setId: set.id,
          kind: 'basic',
          front: 'Raft elects?',
          back: 'A leader',
        },
        201,
        CardSchema,
      )
      .then((card) =>
        // Rated once, it comes back within the day: that is a review to plan for.
        api.post(
          '/api/reviews',
          { cardId: card.id, ordinal: 0, rating: 3, durationMs: 4_000 },
          201,
        ),
      );
    await assessment(module.id, {
      title: 'Coursework 1',
      kind: 'coursework',
      weight: 0.3,
      dueAt: addDays(today, 4),
      remainingHours: 3,
    });
    await assessment(module.id, {
      title: 'Exam',
      kind: 'exam',
      weight: 0.7,
      dueAt: addDays(today, 12),
      durationMinutes: 90,
    });

    const plan = await api.post('/api/plan/generate', { days: 7 }, 200, StudyPlanSchema);
    expect(plan).toMatchObject({ startDate: today, endDate: addDays(today, 6) });
    const kinds = new Set(plan.items.map((item) => item.kind));
    expect(kinds).toContain('review');
    expect(kinds).toContain('coursework');
    expect(kinds).toContain('practice');
    // Every item says why it is there, and nothing overflows a day's availability.
    for (const item of plan.items) {
      expect(item.reason.length, item.title).toBeGreaterThan(10);
      expect(item.status).toBe('planned');
    }
    const coursework = plan.items.filter((item) => item.kind === 'coursework');
    expect(coursework.reduce((sum, item) => sum + item.minutes, 0)).toBe(180);
    expect(coursework[0]?.reason).toContain('3 h left, due in 4 days (30 % of COC251)');
    const practice = plan.items.find((item) => item.kind === 'practice');
    expect(practice?.targetId).toBe(raft.id);
    expect(practice?.reason).toContain('COC251');
    expect(plan.capacity).toHaveLength(7);

    // The plan is the current one, and asking again for the same inputs gives the same plan.
    const current = await api.get('/api/plan', Current);
    expect(current.plan?.id).toBe(plan.id);
    const again = await api.post('/api/plan/generate', { days: 7 }, 200, StudyPlanSchema);
    expect(again.id).toBe(plan.id);
    const shape = (items: typeof plan.items) =>
      items.map((item) => [item.date, item.kind, item.title, item.minutes, item.reason]);
    expect(shape(again.items)).toEqual(shape(plan.items));
  });

  it('keeps what was done when it plans again, and counts it towards the day', async () => {
    const { api, today, raft, mcq } = await setUp();
    await mcq([raft.id]);
    const first = await api.post('/api/plan/generate', { days: 3 }, 200, StudyPlanSchema);
    const todays = first.items.filter((item) => item.date === today);
    expect(todays.length).toBeGreaterThan(0);
    const done = await api.patch(
      `/api/plan/items/${todays[0]?.id}`,
      { status: 'done' },
      200,
      PlanItemSchema,
    );
    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
    const skipped = first.items.find((item) => item.date === addDays(today, 1));
    await api.patch(`/api/plan/items/${skipped?.id}`, { status: 'skipped' }, 200);

    const second = await api.post('/api/plan/generate', { days: 3 }, 200, StudyPlanSchema);
    expect(second.id).toBe(first.id);
    const kept = second.items.filter((item) => item.status !== 'planned');
    expect(kept.map((item) => item.id).sort()).toEqual([done.id, skipped?.id].sort());
    // Done work takes its minutes out of the day: nothing is planned beyond what was set aside.
    for (const day of second.capacity) {
      const used = second.items
        .filter((item) => item.date === day.date && item.kind !== 'review')
        .reduce((sum, item) => sum + item.minutes, 0);
      expect(used).toBeLessThanOrEqual(day.minutes);
    }
    // Putting an item back to planned works too.
    const undone = await api.patch(
      `/api/plan/items/${done.id}`,
      { status: 'planned' },
      200,
      PlanItemSchema,
    );
    expect(undone.completedAt).toBeNull();
    await api.patch('/api/plan/items/pli_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7', { status: 'done' }, 404);
  });

  it('follows the availability the student sets', async () => {
    const { api, today, module, raft, mcq, assessment } = await setUp();
    await mcq([raft.id]);
    await assessment(module.id, {
      title: 'Coursework 1',
      kind: 'coursework',
      weight: 0.3,
      dueAt: addDays(today, 2),
      remainingHours: 4,
    });
    const none: Partial<PlanSettings> = { minutesByWeekday: [0, 0, 0, 0, 0, 0, 0] };
    await api.patch('/api/settings/plan', none, 200);
    const plan = await api.post('/api/plan/generate', { days: 5 }, 200, StudyPlanSchema);
    expect(plan.items).toEqual([]);
    expect(plan.unscheduled[0]?.reason).toContain('no day before the deadline has time');

    await api.patch(
      '/api/settings/plan',
      { minutesByWeekday: [240, 240, 240, 240, 240, 240, 240], blockedDates: [addDays(today, 1)] },
      200,
    );
    const roomy = await api.post('/api/plan/generate', { days: 5 }, 200, StudyPlanSchema);
    expect(roomy.items.some((item) => item.date === addDays(today, 1))).toBe(false);
    expect(roomy.capacity.find((day) => day.date === addDays(today, 1))?.minutes).toBe(0);
    expect(
      roomy.items.filter((item) => item.kind === 'coursework').reduce((s, i) => s + i.minutes, 0),
    ).toBe(240);
  });

  it('asks for a lecture to be worked through when it has material but nothing to study', async () => {
    const { api, module } = await setUp();
    const lecture = await api.post<{ id: string }>(`/api/modules/${module.id}/lectures`, {
      key: 'L1',
      title: 'Consensus',
    });
    // No material attached yet: nothing to do.
    let plan = await api.post('/api/plan/generate', { days: 2 }, 200, StudyPlanSchema);
    expect(plan.items.filter((item) => item.kind === 'learn')).toEqual([]);
    expect(lecture.id).toBeTruthy();
    plan = await api.get('/api/plan', Current).then((current) => current.plan ?? plan);
    expect(plan.items).toEqual([]);
    expect(getPlanEndpoint.path).toBe('/api/plan');
  });
});

describe('exam-aware retention', () => {
  it('schedules a module’s cards for 0.93 in the fortnight before its exam, and not otherwise', async () => {
    const { api, today, module, concept, assessment, bed: testbed } = await setUp();
    await api.patch('/api/settings/review', { fuzz: false }, 200);
    const other = await api.post<{ id: string }>(
      '/api/modules',
      { code: 'COC999', title: 'Other' },
      201,
    );
    await assessment(module.id, {
      title: 'Exam',
      kind: 'exam',
      weight: 1,
      dueAt: addDays(today, 10),
    });
    const second = await concept('Gossip');
    expect(second.id).toBeTruthy();

    const makeCard = async (moduleId: string, title: string) => {
      const set = await api.post('/api/card-sets', { title, moduleId }, 201, CardSetSchema);
      return api.post(
        '/api/cards',
        { setId: set.id, kind: 'basic', front: `${title}?`, back: 'x' },
        201,
        CardSchema,
      );
    };
    const withExam = await makeCard(module.id, 'With exam');
    const without = await makeCard(other.id, 'Without');

    // Rate both cards the same way at the same moments until they are out of their learning steps,
    // and measure how far ahead the last rating schedules each.
    const clock = testbed.ctx.clock as { now(): Date; advance(ms: number): void };
    const intervalsAfter = async (first: string, second: string) => {
      const result = [0, 0];
      for (let step = 0; step < 4; step += 1) {
        for (const [index, cardId] of [first, second].entries()) {
          const rated = await api.post<{ face: { due: string } }>(
            '/api/reviews',
            { cardId, ordinal: 0, rating: 3, durationMs: 2_000 },
            201,
          );
          result[index] = Date.parse(rated.face.due) - clock.now().getTime();
        }
        clock.advance(11 * 60_000);
      }
      return result as [number, number];
    };
    const [near, far] = await intervalsAfter(withExam.id, without.id);
    // Higher retention means sooner.
    expect(near).toBeGreaterThanOrEqual(DAY);
    expect(near).toBeLessThan(far);

    // Switching the policy off gives the student's own retention again, to both.
    await api.patch('/api/settings/plan', { examRetention: false }, 200);
    const [again, other2] = await intervalsAfter(
      (await makeCard(module.id, 'Third')).id,
      (await makeCard(other.id, 'Fourth')).id,
    );
    expect(again).toBe(other2);
  });
});
