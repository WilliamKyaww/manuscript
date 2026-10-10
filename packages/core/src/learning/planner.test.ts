import { describe, expect, it } from 'vitest';
import {
  addDays,
  DEFAULT_AVAILABILITY,
  examAwareRetention,
  PLAN,
  type PlannerConcept,
  type PlannerInput,
  planStudy,
  weekday,
} from './planner';

// Friday 9 October 2026.
const TODAY = '2026-10-09';

const concept = (
  id: string,
  moduleId: string,
  priority: number,
  extra: Partial<PlannerConcept> = {},
): PlannerConcept => ({
  id,
  name: id,
  moduleId,
  moduleCode: moduleId.toUpperCase(),
  priority,
  mastery: 0.4,
  assessment: { title: 'Exam', weight: 0.7, daysUntil: 12 },
  ...extra,
});

const base: PlannerInput = {
  today: TODAY,
  days: 7,
  availability: { ...DEFAULT_AVAILABILITY, minutesByWeekday: [60, 60, 60, 60, 60, 60, 60] },
  reviewForecast: [],
  secondsPerCard: 15,
  assessments: [],
  concepts: [],
  lectures: [],
  retention: [],
  kept: [],
};

const minutesOn = (result: ReturnType<typeof planStudy>, date: string) =>
  result.items.filter((item) => item.date === date).reduce((sum, item) => sum + item.minutes, 0);

describe('dates', () => {
  it('counts weekdays from Monday and adds days', () => {
    expect(weekday('2026-10-09')).toBe(4);
    expect(weekday('2026-10-11')).toBe(6);
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
});

describe('reviews', () => {
  it('reserves time for what is due, at the student’s pace, and says so', () => {
    const result = planStudy({
      ...base,
      reviewForecast: [
        { date: TODAY, count: 40 },
        { date: addDays(TODAY, 2), count: 8 },
      ],
      secondsPerCard: 18,
    });
    const reviews = result.items.filter((item) => item.kind === 'review');
    expect(reviews.map((item) => [item.date, item.minutes])).toEqual([
      [TODAY, 12],
      [addDays(TODAY, 2), 3],
    ]);
    expect(reviews[0]?.reason).toBe(
      '40 cards are due now (including any overdue); about 12 min at 18 s a card.',
    );
  });

  it('never drops a review, even on a day with no time', () => {
    const result = planStudy({
      ...base,
      availability: { ...base.availability, blockedDates: [TODAY] },
      reviewForecast: [{ date: TODAY, count: 30 }],
    });
    const review = result.items.find((item) => item.kind === 'review');
    expect(review?.minutes).toBe(8);
    expect(review?.reason).toContain('more than the time you set aside');
  });
});

describe('practice', () => {
  const concepts = [
    concept('raft', 'cs301', 0.9),
    concept('paxos', 'cs301', 0.8),
    concept('sql', 'db', 0.5),
    concept('b-trees', 'db', 0.4),
  ];

  it('fills the free time with blocks, interleaved across modules, one concept once a day', () => {
    const result = planStudy({ ...base, concepts });
    const first = result.items.filter((item) => item.date === TODAY);
    expect(first.map((item) => item.targetId)).toEqual(['raft', 'sql']);
    for (let offset = 0; offset < 7; offset += 1) {
      const day = result.items.filter((item) => item.date === addDays(TODAY, offset));
      expect(new Set(day.map((item) => item.targetId)).size).toBe(day.length);
      expect(minutesOn(result, addDays(TODAY, offset))).toBeLessThanOrEqual(60);
    }
  });

  it('explains every block in the student’s terms', () => {
    const result = planStudy({ ...base, concepts });
    expect(result.items[0]?.reason).toBe('Weak: raft — 0.40, Exam in 12 days, 70 % of CS301.');
    const unpractised = planStudy({
      ...base,
      concepts: [concept('x', 'm', 1, { mastery: null, assessment: null })],
    });
    expect(unpractised.items[0]?.reason).toBe('Not practised yet, M, nothing dated ahead.');
  });

  it('skips blocked days and uses the weekday’s minutes', () => {
    const result = planStudy({
      ...base,
      availability: {
        ...base.availability,
        minutesByWeekday: [0, 0, 0, 0, 25, 50, 50],
        blockedDates: [addDays(TODAY, 1)],
      },
      concepts,
    });
    expect(result.items.map((item) => item.date)).toEqual([
      TODAY,
      addDays(TODAY, 2),
      addDays(TODAY, 2),
    ]);
  });

  it('rests a concept for a couple of days when there are others to practise', () => {
    const result = planStudy({
      ...base,
      availability: { ...base.availability, minutesByWeekday: [25, 25, 25, 25, 25, 25, 25] },
      concepts: [
        concept('a', 'm1', 5),
        concept('b', 'm1', 4),
        concept('c', 'm1', 3),
        concept('d', 'm1', 2),
      ],
    });
    expect(result.items.map((item) => item.targetId)).toEqual(['a', 'b', 'c', 'd', 'a', 'b', 'c']);
  });
});

describe('coursework', () => {
  const coursework = {
    id: 'asm_cw',
    moduleId: 'cs301',
    moduleCode: 'CS301',
    title: 'Coursework 1',
    kind: 'coursework' as const,
    weight: 0.3,
    dueAt: '2026-10-16',
    durationMinutes: null,
    status: 'planned' as const,
    remainingHours: 4,
  };

  it('spreads the remaining hours up to the deadline, most at the start', () => {
    const result = planStudy({ ...base, days: 10, assessments: [coursework] });
    const blocks = result.items.filter((item) => item.kind === 'coursework');
    const minutes = blocks.map((item) => item.minutes);
    expect(minutes.reduce((a, b) => a + b, 0)).toBe(240);
    expect(minutes[0]).toBeGreaterThanOrEqual(minutes.at(-1) ?? 0);
    expect(blocks.every((item) => item.date <= '2026-10-16')).toBe(true);
    expect(blocks[0]?.reason).toBe(
      '4 h left, due in 7 days (30 % of CS301); spread over 8 days, most at the start.',
    );
  });

  it('says so when the time cannot be found', () => {
    const result = planStudy({
      ...base,
      availability: { ...base.availability, minutesByWeekday: [0, 0, 0, 0, 0, 0, 0] },
      assessments: [coursework],
    });
    expect(result.unscheduled[0]?.reason).toContain('no day before the deadline has time');
  });

  it('ignores marked work and work with nothing left', () => {
    const result = planStudy({
      ...base,
      assessments: [
        { ...coursework, status: 'marked' },
        { ...coursework, id: 'b', remainingHours: null },
      ],
    });
    expect(result.items).toEqual([]);
  });
});

describe('exams', () => {
  const exam = {
    id: 'asm_exam',
    moduleId: 'cs301',
    moduleCode: 'CS301',
    title: 'Exam',
    kind: 'exam' as const,
    weight: 0.7,
    dueAt: '2026-10-23',
    durationMinutes: 90,
    status: 'planned' as const,
    remainingHours: null,
  };
  const roomy = { ...base.availability, minutesByWeekday: [120, 120, 120, 120, 120, 120, 120] };

  it('plans one mock exam a week in the weeks before it, on the roomiest day', () => {
    const result = planStudy({ ...base, days: 14, availability: roomy, assessments: [exam] });
    const mocks = result.items.filter((item) => item.kind === 'mock_exam');
    expect(mocks).toHaveLength(2);
    expect(mocks[0]?.minutes).toBe(90);
    expect(mocks[0]?.date).toBe(TODAY);
    expect(mocks[1]?.date).toBe('2026-10-16');
    expect(mocks[0]?.reason).toContain('Exam is in 14 days (70 % of the module)');
  });

  it('does not plan one for an exam more than three weeks away, nor one that has passed', () => {
    const far = planStudy({
      ...base,
      assessments: [{ ...exam, dueAt: '2026-12-01' }],
      availability: roomy,
    });
    expect(far.items.filter((item) => item.kind === 'mock_exam')).toEqual([]);
    const past = planStudy({
      ...base,
      assessments: [{ ...exam, dueAt: '2026-10-01' }],
      availability: roomy,
    });
    expect(past.items.filter((item) => item.kind === 'mock_exam')).toEqual([]);
  });

  it('reports a mock exam it cannot fit', () => {
    const result = planStudy({ ...base, assessments: [exam] });
    expect(result.unscheduled.some((entry) => entry.title.startsWith('Mock exam'))).toBe(true);
  });

  it('schedules the retention pass in the exam’s last week, the day before if there is room', () => {
    const result = planStudy({
      ...base,
      days: 14,
      availability: roomy,
      retention: [
        {
          moduleId: 'cs301',
          moduleCode: 'CS301',
          assessmentId: 'asm_exam',
          examTitle: 'Exam',
          examDate: '2026-10-16',
          cards: 60,
        },
      ],
    });
    const pass = result.items.find((item) => item.title.startsWith('Exam-day retention'));
    expect(pass?.date).toBe('2026-10-15');
    expect(pass?.minutes).toBe(15);
    expect(pass?.reason).toContain('60 cards in CS301 would be recalled with under 85 %');
  });

  it('leaves the retention pass until the exam is within a week', () => {
    const result = planStudy({
      ...base,
      days: 14,
      availability: roomy,
      retention: [
        {
          moduleId: 'cs301',
          moduleCode: 'CS301',
          assessmentId: 'a',
          examTitle: 'Exam',
          examDate: '2026-10-30',
          cards: 60,
        },
      ],
    });
    expect(result.items).toEqual([]);
  });
});

describe('learn items', () => {
  it('asks to work through lectures that have material and nothing studied', () => {
    const lecture = (id: string, hasMaterial: boolean, studied: boolean, ordinal: number) => ({
      id,
      moduleId: 'm',
      moduleCode: 'CS301',
      key: `L${ordinal}`,
      title: `Lecture ${ordinal}`,
      hasMaterial,
      studied,
      ordinal,
    });
    const result = planStudy({
      ...base,
      lectures: [
        lecture('l1', true, true, 1),
        lecture('l2', true, false, 2),
        lecture('l3', false, false, 3),
      ],
    });
    expect(result.items.map((item) => [item.kind, item.targetId])).toEqual([['learn', 'l2']]);
    expect(result.items[0]?.reason).toContain(
      'has its material attached but no cards or questions yet',
    );
  });
});

describe('re-planning', () => {
  it('counts what is already done towards the day', () => {
    const concepts = [concept('a', 'm', 1), concept('b', 'm', 0.9), concept('c', 'm', 0.8)];
    const kept = [
      {
        date: TODAY,
        kind: 'practice' as const,
        targetType: 'concept' as const,
        targetId: 'z',
        title: 'Practise z',
        minutes: 50,
        reason: 'x',
      },
    ];
    const result = planStudy({ ...base, concepts, kept });
    expect(result.items.filter((item) => item.date === TODAY)).toEqual([]);
  });
});

describe('determinism', () => {
  it('gives the same plan for the same inputs', () => {
    const input: PlannerInput = {
      ...base,
      reviewForecast: [{ date: TODAY, count: 20 }],
      concepts: [
        concept('raft', 'cs301', 0.9),
        concept('sql', 'db', 0.5),
        concept('trees', 'db', 0.5),
      ],
      lectures: [
        {
          id: 'l1',
          moduleId: 'm',
          moduleCode: 'CS301',
          key: 'L1',
          title: 'Intro',
          hasMaterial: true,
          studied: false,
          ordinal: 1,
        },
      ],
    };
    expect(planStudy(input)).toEqual(planStudy({ ...input }));
  });

  it('never plans more than the horizon allows', () => {
    const result = planStudy({ ...base, days: 100, concepts: [concept('a', 'm', 1)] });
    expect(result.items.at(-1)?.date).toBe(addDays(TODAY, PLAN.maxDays - 1));
  });
});

describe('exam-aware retention', () => {
  it('raises retention to 0.93 within 14 days of an exam, and only then', () => {
    expect(examAwareRetention(0.9, 14)).toBe(0.93);
    expect(examAwareRetention(0.9, 0)).toBe(0.93);
    expect(examAwareRetention(0.9, 15)).toBe(0.9);
    expect(examAwareRetention(0.9, -1)).toBe(0.9);
    expect(examAwareRetention(0.9, null)).toBe(0.9);
    expect(examAwareRetention(0.95, 3)).toBe(0.95);
    expect(examAwareRetention(0.9, 3, false)).toBe(0.9);
  });
});
