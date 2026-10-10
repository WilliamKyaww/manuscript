/**
 * The rolling study planner (learning-system.md §9, task 14.06). Pure: the same inputs and date
 * always give the same plan, and every item says why it is there.
 *
 * Time is spent in this order, from the minutes the student has said they have each day:
 * 1. due reviews (never dropped — a review that is due is worth more than anything planned);
 * 2. mock exams (one per module per week in the three weeks before its exam);
 * 3. the exam-day retention pass (cards predicted to be forgotten by the exam, in its last week);
 * 4. coursework blocks, front-loaded towards each deadline;
 * 5. learn items for lectures that have material but nothing to study from yet;
 * 6. practice blocks for the highest-priority concepts, interleaved across modules.
 */

export const PLAN_ITEM_KINDS = ['review', 'practice', 'learn', 'coursework', 'mock_exam'] as const;
export type PlanItemKind = (typeof PLAN_ITEM_KINDS)[number];

export const PLAN = {
  defaultDays: 7,
  maxDays: 28,
  /** Practice blocks are this long, within the student's session length. */
  practiceMinutes: { min: 15, max: 25 },
  /** A coursework block shorter than this is not worth switching to. */
  courseworkMinimum: 20,
  courseworkMaximum: 120,
  /** Mock exams in the weeks before an exam. */
  mockWeeks: 3,
  mockDefaultMinutes: 90,
  mockMaximumMinutes: 180,
  /** The final stretch before an exam in which cards forecast to be forgotten are reviewed. */
  retentionWindowDays: 7,
  /** …and "forgotten" means predicted retrievability on the exam date below this. */
  retentionBelow: 0.85,
  /** Within this many days of an exam its cards are scheduled for this retention. */
  examRetentionDays: 14,
  examRetention: 0.93,
  /** Seconds a review takes when the student has no history to say. */
  fallbackSecondsPerCard: 15,
  /** A concept gets at most this many blocks a day, and rests this many days after one. */
  conceptRestDays: 2,
  learnMinutes: 25,
  learnPerDay: 2,
} as const;

export interface Availability {
  /** Minutes available on Monday … Sunday. */
  minutesByWeekday: readonly number[];
  /** YYYY-MM-DD dates with no study at all. */
  blockedDates: readonly string[];
  /** How long one sitting is (15–90 minutes). */
  sessionMinutes: number;
}

export const DEFAULT_AVAILABILITY: Availability = {
  minutesByWeekday: [90, 90, 90, 90, 90, 45, 45],
  blockedDates: [],
  sessionMinutes: 25,
};

export interface PlannerAssessment {
  id: string;
  moduleId: string;
  moduleCode: string;
  title: string;
  kind: 'exam' | 'coursework' | 'test' | 'presentation' | 'project';
  /** Fraction of the module mark. */
  weight: number;
  dueAt: string | null;
  durationMinutes: number | null;
  status: 'planned' | 'submitted' | 'marked';
  /** Hours the student reckons are left to do (coursework). */
  remainingHours: number | null;
}

export interface PlannerConcept {
  id: string;
  name: string;
  moduleId: string | null;
  moduleCode: string | null;
  priority: number;
  mastery: number | null;
  /** The assessment that makes it matter, if there is one. */
  assessment: { title: string; weight: number; daysUntil: number } | null;
}

export interface PlannerLecture {
  id: string;
  moduleId: string;
  moduleCode: string;
  key: string;
  title: string;
  /** Source material is attached. */
  hasMaterial: boolean;
  /** Cards or questions already exist for it. */
  studied: boolean;
  ordinal: number;
}

export interface RetentionPass {
  moduleId: string;
  moduleCode: string;
  assessmentId: string;
  examTitle: string;
  examDate: string;
  /** Cards predicted to be recalled with less than 85 % chance on the exam date. */
  cards: number;
}

export interface PlanItemDraft {
  date: string;
  kind: PlanItemKind;
  targetType: 'module' | 'concept' | 'lecture' | 'assessment' | 'cards' | null;
  targetId: string | null;
  title: string;
  minutes: number;
  reason: string;
}

export interface PlannerInput {
  /** YYYY-MM-DD. */
  today: string;
  days: number;
  availability: Availability;
  /** Reviews falling due on each date (today's includes whatever is overdue). */
  reviewForecast: readonly { date: string; count: number }[];
  secondsPerCard: number | null;
  assessments: readonly PlannerAssessment[];
  /** Concepts by priority, highest first. */
  concepts: readonly PlannerConcept[];
  lectures: readonly PlannerLecture[];
  retention: readonly RetentionPass[];
  /** Items already done or skipped: they keep their place and use up that day's time. */
  kept: readonly PlanItemDraft[];
}

export interface PlannerResult {
  items: PlanItemDraft[];
  /** Things that could not be fitted in, with why, so the student can change the availability. */
  unscheduled: { title: string; reason: string }[];
}

// --- Dates --------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;

export const dayNumber = (date: string) =>
  Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);

export const addDays = (date: string, days: number) =>
  new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);

/** Monday is 0 … Sunday is 6. */
export const weekday = (date: string) => (new Date(dayNumber(date) * DAY_MS).getUTCDay() + 6) % 7;

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const shortDate = (date: string) => SHORT_DATE.format(new Date(dayNumber(date) * DAY_MS));

const inDays = (days: number) =>
  days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
const percent = (value: number) => `${Math.round(value * 100)} %`;
const hours = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1));

/**
 * Desired retention for a module's cards (learning-system.md §9): raised to 0.93 in the fortnight
 * before an exam, otherwise the student's own setting. Never lowers a retention they chose higher.
 */
export function examAwareRetention(
  base: number,
  daysToExam: number | null,
  enabled = true,
): number {
  if (!enabled || daysToExam === null) return base;
  if (daysToExam < 0 || daysToExam > PLAN.examRetentionDays) return base;
  return Math.max(base, PLAN.examRetention);
}

const isExamLike = (assessment: PlannerAssessment) =>
  assessment.kind === 'exam' || assessment.kind === 'test';

// --- Planning -----------------------------------------------------------------------------------

interface Day {
  date: string;
  index: number;
  /** Minutes still free after what has been placed. */
  free: number;
  blocked: boolean;
}

export function planStudy(input: PlannerInput): PlannerResult {
  const days = Math.max(1, Math.min(PLAN.maxDays, Math.floor(input.days)));
  const items: PlanItemDraft[] = [];
  const unscheduled: PlannerResult['unscheduled'] = [];
  const secondsPerCard = input.secondsPerCard ?? PLAN.fallbackSecondsPerCard;
  const session = Math.min(90, Math.max(15, input.availability.sessionMinutes));
  const blocked = new Set(input.availability.blockedDates);

  const calendar: Day[] = Array.from({ length: days }, (_, index) => {
    const date = addDays(input.today, index);
    const isBlocked = blocked.has(date);
    const base = input.availability.minutesByWeekday[weekday(date)] ?? 0;
    const used = input.kept
      .filter((item) => item.date === date)
      .reduce((sum, item) => sum + item.minutes, 0);
    return {
      date,
      index,
      blocked: isBlocked,
      free: isBlocked ? 0 : Math.max(0, base - used),
    };
  });
  const dayOf = (date: string) => calendar.find((day) => day.date === date);

  const place = (day: Day, item: Omit<PlanItemDraft, 'date'>) => {
    items.push({ date: day.date, ...item });
    day.free = Math.max(0, day.free - item.minutes);
  };

  // 1. Reviews. They are scheduled whatever the availability: a review that is due is not optional.
  for (const day of calendar) {
    const due = input.reviewForecast.find((entry) => entry.date === day.date)?.count ?? 0;
    if (due <= 0) continue;
    const minutes = Math.max(1, Math.ceil((due * secondsPerCard) / 60));
    const over = minutes > day.free;
    place(day, {
      kind: 'review',
      targetType: 'cards',
      targetId: null,
      title: `Review ${due} ${due === 1 ? 'card' : 'cards'}`,
      minutes,
      reason: `${due} ${due === 1 ? 'card is' : 'cards are'} due ${day.index === 0 ? 'now (including any overdue)' : inDays(day.index)}; about ${minutes} min at ${Math.round(secondsPerCard)} s a card${over ? ', more than the time you set aside' : ''}.`,
    });
  }

  // 2. Mock exams: one per exam per week of the three before it.
  const exams = input.assessments
    .filter(
      (assessment) =>
        isExamLike(assessment) && assessment.status === 'planned' && assessment.dueAt !== null,
    )
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? '') || a.id.localeCompare(b.id));
  for (const exam of exams) {
    const until = dayNumber(exam.dueAt as string) - dayNumber(input.today);
    if (until < 1 || until > PLAN.mockWeeks * 7) continue;
    const minutes = Math.min(
      PLAN.mockMaximumMinutes,
      Math.max(30, exam.durationMinutes ?? PLAN.mockDefaultMinutes),
    );
    for (let week = 0; week < PLAN.mockWeeks; week += 1) {
      const from = week * 7;
      const to = Math.min(from + 6, until - 1, days - 1);
      if (from > to) continue;
      // The roomiest day in the week that fits it; the earliest if several do.
      const roomy = calendar
        .filter((day) => day.index >= from && day.index <= to && day.free >= minutes)
        .sort((a, b) => b.free - a.free || a.index - b.index)[0];
      if (!roomy) {
        unscheduled.push({
          title: `Mock exam: ${exam.moduleCode} ${exam.title}`,
          reason: `No day in days ${from + 1}–${to + 1} has ${minutes} free minutes; free up a longer sitting.`,
        });
        continue;
      }
      place(roomy, {
        kind: 'mock_exam',
        targetType: 'assessment',
        targetId: exam.id,
        title: `Mock exam: ${exam.moduleCode} ${exam.title}`,
        minutes,
        reason: `${exam.moduleCode} ${exam.title} is ${inDays(until)} (${percent(exam.weight)} of the module); one timed mock a week for the last ${PLAN.mockWeeks} weeks.`,
      });
    }
  }

  // 3. The exam-day retention pass, in the exam's last week.
  for (const pass of [...input.retention].sort(
    (a, b) => a.examDate.localeCompare(b.examDate) || a.moduleId.localeCompare(b.moduleId),
  )) {
    const until = dayNumber(pass.examDate) - dayNumber(input.today);
    if (pass.cards <= 0 || until < 1 || until > PLAN.retentionWindowDays) continue;
    const minutes = Math.max(5, Math.ceil((pass.cards * secondsPerCard) / 60));
    // The day before the exam if there is room, else the nearest earlier day that has it.
    const candidates = calendar
      .filter((day) => day.index <= until - 1)
      .sort((a, b) => b.index - a.index);
    const target = candidates.find((day) => day.free >= minutes) ?? candidates[0];
    if (!target) continue;
    place(target, {
      kind: 'review',
      targetType: 'module',
      targetId: pass.moduleId,
      title: `Exam-day retention pass: ${pass.moduleCode}`,
      minutes,
      reason: `${pass.cards} ${pass.cards === 1 ? 'card' : 'cards'} in ${pass.moduleCode} would be recalled with under ${percent(PLAN.retentionBelow)} chance on ${shortDate(pass.examDate)} (${pass.examTitle}); reviewing them now keeps them above it.`,
    });
  }

  // 4. Coursework: remaining hours spread over the days to the deadline, most at the start.
  const coursework = input.assessments
    .filter(
      (assessment) =>
        !isExamLike(assessment) &&
        assessment.status === 'planned' &&
        assessment.dueAt !== null &&
        (assessment.remainingHours ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (a.dueAt ?? '').localeCompare(b.dueAt ?? '') ||
        b.weight - a.weight ||
        a.id.localeCompare(b.id),
    );
  for (const work of coursework) {
    const due = work.dueAt as string;
    const until = dayNumber(due) - dayNumber(input.today);
    if (until < 0) continue;
    const total = Math.round((work.remainingHours as number) * 60);
    // The days that can take it: from today up to and including the due date (a deadline day is
    // still a working day until the evening), counted beyond the plan's horizon too.
    const span = Math.min(until + 1, 120);
    const available = Array.from({ length: span }, (_, index) => {
      const date = addDays(input.today, index);
      const known = dayOf(date);
      const base = blocked.has(date)
        ? 0
        : (input.availability.minutesByWeekday[weekday(date)] ?? 0);
      return { date, index, free: known ? known.free : base };
    }).filter((day) => day.free > 0);
    if (available.length === 0) {
      unscheduled.push({
        title: `${work.moduleCode} ${work.title}`,
        reason: `${hours(work.remainingHours as number)} h are left and no day before the deadline has time set aside.`,
      });
      continue;
    }
    // Front-loaded: the first day gets the biggest share (weights n, n-1, … 1).
    const weights = available.map((_, index) => available.length - index);
    const weightTotal = weights.reduce((a, b) => a + b, 0);
    let remaining = total;
    for (const [at, slot] of available.entries()) {
      if (remaining <= 0) break;
      const share =
        at === available.length - 1
          ? remaining
          : Math.round((total * (weights[at] ?? 1)) / weightTotal);
      // Never more than the day has, nor more than one long sitting.
      const minutes = Math.min(share, remaining, slot.free, PLAN.courseworkMaximum);
      if (minutes < PLAN.courseworkMinimum && remaining > minutes && at !== available.length - 1)
        continue;
      if (minutes <= 0) continue;
      remaining -= minutes;
      const day = calendar.find((entry) => entry.date === slot.date);
      if (day)
        place(day, {
          kind: 'coursework',
          targetType: 'assessment',
          targetId: work.id,
          title: `${work.moduleCode} ${work.title}`,
          minutes,
          reason: `${hours(work.remainingHours as number)} h left, due ${inDays(until)} (${percent(work.weight)} of ${work.moduleCode}); spread over ${available.length} ${available.length === 1 ? 'day' : 'days'}, most at the start.`,
        });
    }
    if (remaining > 0 && until < days)
      unscheduled.push({
        title: `${work.moduleCode} ${work.title}`,
        reason: `${Math.ceil(remaining / 60)} h will not fit before the deadline with the time you have set aside.`,
      });
  }

  // 5. Learn items: lectures with material that nothing has been made from yet.
  const unstudied = input.lectures
    .filter((lecture) => lecture.hasMaterial && !lecture.studied)
    .sort(
      (a, b) =>
        a.moduleCode.localeCompare(b.moduleCode) ||
        a.ordinal - b.ordinal ||
        a.id.localeCompare(b.id),
    );
  const learnToday = new Map<string, number>();
  for (const lecture of unstudied) {
    const target = calendar.find(
      (day) => day.free >= PLAN.learnMinutes && (learnToday.get(day.date) ?? 0) < PLAN.learnPerDay,
    );
    if (!target) break;
    learnToday.set(target.date, (learnToday.get(target.date) ?? 0) + 1);
    place(target, {
      kind: 'learn',
      targetType: 'lecture',
      targetId: lecture.id,
      title: `Learn ${lecture.moduleCode} ${lecture.key}: ${lecture.title}`,
      minutes: PLAN.learnMinutes,
      reason: `${lecture.moduleCode} ${lecture.key} has its material attached but no cards or questions yet; work through it and make some.`,
    });
  }

  // 6. Practice: what is left of each day, in blocks, for the concepts that matter most.
  const block = Math.min(PLAN.practiceMinutes.max, Math.max(PLAN.practiceMinutes.min, session));
  const queue = interleave(input.concepts);
  const lastUsed = new Map<string, number>();
  for (const day of calendar) {
    let slots = Math.floor(day.free / block);
    const today = new Set<string>();
    while (slots > 0) {
      // A concept that has rested for a couple of days comes first; with few concepts the one
      // practised longest ago comes round again, but never twice in a day.
      const concept =
        queue.find(
          (candidate) =>
            !today.has(candidate.id) &&
            (lastUsed.get(candidate.id) === undefined ||
              day.index - (lastUsed.get(candidate.id) as number) > PLAN.conceptRestDays),
        ) ?? queue.find((candidate) => !today.has(candidate.id));
      if (!concept) break;
      today.add(concept.id);
      lastUsed.set(concept.id, day.index);
      // Used concepts go to the back, so the next block is the next most pressing.
      queue.splice(queue.indexOf(concept), 1);
      queue.push(concept);
      place(day, {
        kind: 'practice',
        targetType: 'concept',
        targetId: concept.id,
        title: `Practise ${concept.name}`,
        minutes: block,
        reason: practiceReason(concept),
      });
      slots -= 1;
    }
  }

  return { items: sortItems(items), unscheduled };
}

/** Round-robin across modules, each module's concepts in priority order, modules by their best. */
function interleave(concepts: readonly PlannerConcept[]): PlannerConcept[] {
  const byModule = new Map<string, PlannerConcept[]>();
  for (const concept of [...concepts].sort(
    (a, b) => b.priority - a.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  )) {
    const key = concept.moduleId ?? '';
    byModule.set(key, [...(byModule.get(key) ?? []), concept]);
  }
  const lanes = [...byModule.values()];
  const result: PlannerConcept[] = [];
  for (let round = 0; result.length < concepts.length; round += 1)
    for (const lane of lanes) {
      const concept = lane[round];
      if (concept) result.push(concept);
    }
  return result;
}

function practiceReason(concept: PlannerConcept): string {
  const parts: string[] = [];
  parts.push(
    concept.mastery === null
      ? 'Not practised yet'
      : `${concept.mastery < 0.6 ? 'Weak' : 'Mastery'}: ${concept.name} — ${concept.mastery.toFixed(2)}`,
  );
  if (concept.assessment)
    parts.push(
      `${concept.assessment.title} ${inDays(concept.assessment.daysUntil)}, ${percent(concept.assessment.weight)} of ${concept.moduleCode ?? 'the module'}`,
    );
  else if (concept.moduleCode) parts.push(`${concept.moduleCode}, nothing dated ahead`);
  return `${parts.join(', ')}.`;
}

const KIND_ORDER: Record<PlanItemKind, number> = {
  review: 0,
  mock_exam: 1,
  coursework: 2,
  learn: 3,
  practice: 4,
};

function sortItems(items: PlanItemDraft[]): PlanItemDraft[] {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title),
  );
}
