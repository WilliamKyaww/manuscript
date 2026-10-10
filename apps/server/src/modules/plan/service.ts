import {
  type Availability,
  addDays,
  createScheduler,
  dayNumber,
  type IdFactory,
  NotFoundError,
  PLAN,
  type PlanItem,
  type PlannerAssessment,
  type PlannerConcept,
  type PlannerInput,
  type PlannerLecture,
  type PlanSettings,
  planStudy,
  type RetentionPass,
  type StudyPlan,
  weekday,
} from '@skb/core';
import type { Clock } from '../../shared/clock';
import { reviewDay } from '../cards/days';
import type { ReviewService } from '../cards/reviews';
import type { LearningService } from '../learning/service';
import type { MasteryService } from '../mastery/service';
import type { SettingsService } from '../settings/service';
import type { ItemRow, PlanRepository, PlanRow } from './repository';

/**
 * The study plan (tasks 14.06, 14.08, learning-system.md §9): gathers what the planner reads —
 * availability, due reviews, assessments, concept priorities, lectures with nothing to study from,
 * the forgetting curve — runs the pure planner, and keeps the result. Making the plan again keeps
 * what has been done or skipped and plans the rest afresh, so a plan is rolling and nothing the
 * student ticked off is ever lost.
 */

export interface PlanDependencies {
  repo: PlanRepository;
  settings: SettingsService;
  reviews: ReviewService;
  learning: LearningService;
  mastery: MasteryService;
  clock: Clock;
  ids: IdFactory;
}

export type PlanService = ReturnType<typeof createPlanService>;

/** What undoing a generated plan needs: the plan as it was, if this one replaced part of it. */
export interface PlanSnapshot {
  plan: PlanRow;
  items: ItemRow[];
}

const EXAM_KINDS = new Set(['exam', 'test']);
const MEDIAN_SINCE_DAYS = 60;
const MIN_PACE_SAMPLES = 20;
const TOP_CONCEPTS = 60;
/** Exams are taken to start at nine in the morning when forecasting what will be remembered. */
const EXAM_HOUR = 'T09:00:00';

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};

export function createPlanService(deps: PlanDependencies) {
  const { repo, settings, reviews, learning, mastery, clock, ids } = deps;
  const now = () => clock.now().toISOString();
  const today = () => reviewDay(clock.now()).key;

  const availability = (plan: PlanSettings): Availability => ({
    minutesByWeekday: plan.minutesByWeekday,
    blockedDates: plan.blockedDates,
    sessionMinutes: plan.sessionMinutes,
  });

  /** The student's own pace: the median seconds a review took, once there is enough to go on. */
  function secondsPerCard(): number | null {
    const since = new Date(clock.now().getTime() - MEDIAN_SINCE_DAYS * 86_400_000).toISOString();
    const durations = repo.reviewDurations(since);
    if (durations.length < MIN_PACE_SAMPLES) return null;
    // Overlong reviews (a coffee break mid-card) are capped so they do not skew the pace.
    return Math.min(120_000, median(durations)) / 1000;
  }

  /** Everything the planner reads, as plain data. */
  function gather(date: string, days: number, kept: ItemRow[]): PlannerInput {
    const config = settings.plan();
    const modules = learning.listModules().filter((module) => !module.archived);
    const studied = repo.studiedLectures();
    const assessments: PlannerAssessment[] = [];
    const lectures: PlannerLecture[] = [];
    const retention: RetentionPass[] = [];
    const scheduler = createScheduler(settings.review());

    for (const module of modules) {
      const detail = learning.getModule(module.id);
      for (const assessment of detail.assessments) {
        assessments.push({
          id: assessment.id,
          moduleId: module.id,
          moduleCode: module.code,
          title: assessment.title,
          kind: assessment.kind,
          weight: assessment.weight,
          dueAt: assessment.dueAt,
          durationMinutes: assessment.durationMinutes,
          status: assessment.status,
          remainingHours: assessment.remainingHours,
        });
        // Cards forecast to be forgotten by an exam in its last week.
        if (
          EXAM_KINDS.has(assessment.kind) &&
          assessment.status === 'planned' &&
          assessment.dueAt
        ) {
          const until = dayNumber(assessment.dueAt) - dayNumber(date);
          if (until >= 1 && until <= PLAN.retentionWindowDays) {
            const examDay = assessment.dueAt.slice(0, 10);
            const at = new Date(`${examDay}${EXAM_HOUR}`);
            const weak = repo
              .moduleFaces(module.id)
              .filter(
                (face) => (scheduler.retrievability(face.schedule, at) ?? 1) < PLAN.retentionBelow,
              );
            if (weak.length > 0)
              retention.push({
                moduleId: module.id,
                moduleCode: module.code,
                assessmentId: assessment.id,
                examTitle: assessment.title,
                examDate: examDay,
                cards: weak.length,
              });
          }
        }
      }
      for (const lecture of detail.lectures)
        lectures.push({
          id: lecture.id,
          moduleId: module.id,
          moduleCode: module.code,
          key: lecture.key,
          title: lecture.title,
          hasMaterial: lecture.sourceCount > 0,
          studied: studied.has(lecture.id),
          ordinal: lecture.ordinal,
        });
    }

    const concepts: PlannerConcept[] = mastery
      .concepts()
      .filter((row) => row.components.itemsLinked > 0 && row.priority > 0)
      .slice(0, TOP_CONCEPTS)
      .map((row) => ({
        id: row.concept.id,
        name: row.concept.name,
        moduleId: row.exposure.moduleId,
        moduleCode: row.exposure.moduleCode,
        priority: row.priority,
        mastery: row.components.mastery,
        assessment: row.exposure.assessment
          ? {
              title: row.exposure.assessment.title,
              weight: row.exposure.assessment.weight,
              daysUntil: row.exposure.assessment.daysUntil,
            }
          : null,
      }));

    const forecast = reviews.stats().forecast;
    return {
      today: date,
      days,
      availability: availability(config),
      reviewForecast: forecast,
      secondsPerCard: secondsPerCard(),
      assessments,
      concepts,
      lectures,
      retention,
      kept: kept.map((item) => ({
        date: item.date,
        kind: item.kind,
        targetType: item.targetType,
        targetId: item.targetId,
        title: item.title,
        minutes: item.minutes,
        reason: item.reason,
      })),
    };
  }

  const itemView = (row: ItemRow): PlanItem => ({
    ...row,
    id: row.id as PlanItem['id'],
    planId: row.planId as PlanItem['planId'],
  });

  function view(plan: PlanRow): StudyPlan {
    const config = settings.plan();
    const start = dayNumber(plan.startDate);
    const length = Math.max(1, dayNumber(plan.endDate) - start + 1);
    const blocked = new Set(config.blockedDates);
    return {
      id: plan.id as StudyPlan['id'],
      title: plan.title,
      startDate: plan.startDate,
      endDate: plan.endDate,
      generatedBy: plan.generatedBy,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      items: repo.items(plan.id).map(itemView),
      unscheduled: plan.unscheduled,
      capacity: Array.from({ length }, (_, offset) => {
        const date = addDays(plan.startDate, offset);
        return {
          date,
          minutes: blocked.has(date) ? 0 : (config.minutesByWeekday[weekday(date)] ?? 0),
        };
      }),
    };
  }

  const title = (date: string, days: number) => `Study plan, ${date} to ${addDays(date, days - 1)}`;

  return {
    today,

    /** The plan the student is following, or null before one has been made. */
    current(): StudyPlan | null {
      const plan = repo.current();
      return plan ? view(plan) : null;
    },

    /** The plan as it stands, for an undo to put back. */
    snapshot(): PlanSnapshot | null {
      const plan = repo.current();
      return plan ? { plan, items: repo.items(plan.id) } : null;
    },

    /**
     * Makes the plan for `days` days from today. What was done or skipped stays; what was only
     * planned is planned again from the current figures.
     */
    generate(days: number, generatedBy: 'planner' | 'agent' = 'planner'): StudyPlan {
      const date = today();
      const horizon = Math.max(1, Math.min(PLAN.maxDays, Math.floor(days)));
      const existing = repo.current();
      const continuing = existing !== null && existing.endDate >= date;
      const kept = continuing
        ? repo.items(existing.id).filter((item) => item.status !== 'planned' && item.date >= date)
        : [];
      const planned = planStudy(gather(date, horizon, kept));

      return repo.transaction(() => {
        const at = now();
        let planId: string;
        if (continuing && existing) {
          planId = existing.id;
          // Whatever was only planned, whatever its date, is planned again.
          repo.removePlanned(planId, '');
          repo.updatePlan(
            planId,
            {
              title: title(existing.startDate < date ? existing.startDate : date, horizon),
              startDate: existing.startDate < date ? existing.startDate : date,
              endDate: addDays(date, horizon - 1),
              params: { days: horizon, availability: settings.plan() },
              generatedBy,
              unscheduled: planned.unscheduled,
            },
            at,
          );
        } else {
          planId = ids('plan');
          repo.insertPlan({
            id: planId,
            title: title(date, horizon),
            startDate: date,
            endDate: addDays(date, horizon - 1),
            params: { days: horizon, availability: settings.plan() },
            generatedBy,
            unscheduled: planned.unscheduled,
            createdAt: at,
            updatedAt: at,
          });
        }
        const ordinals = new Map<string, number>();
        for (const item of repo.items(planId))
          ordinals.set(item.date, Math.max(ordinals.get(item.date) ?? 0, item.ordinal + 1));
        for (const item of planned.items) {
          const ordinal = ordinals.get(item.date) ?? 0;
          ordinals.set(item.date, ordinal + 1);
          repo.insertItem({
            id: ids('planItem'),
            planId,
            date: item.date,
            ordinal,
            kind: item.kind,
            targetType: item.targetType,
            targetId: item.targetId,
            title: item.title,
            minutes: item.minutes,
            reason: item.reason,
            status: 'planned',
            completedAt: null,
          });
        }
        return view(repo.plan(planId) as PlanRow);
      });
    },

    /** Puts a plan back as it was (undoing a generation), or removes the one that was made. */
    restore(resultPlanId: string, previous: PlanSnapshot | null): void {
      repo.transaction(() => {
        repo.removePlan(resultPlanId);
        if (previous && previous.plan.id === resultPlanId) {
          repo.insertPlan(previous.plan);
          for (const item of previous.items) repo.insertItem(item);
        }
      });
    },

    /** Why a generation can no longer be undone, or null. */
    changedSince(planId: string, updatedAt: string): string | null {
      const plan = repo.plan(planId);
      if (!plan) return 'The plan has been replaced.';
      return plan.updatedAt === updatedAt ? null : 'The plan has changed since.';
    },

    item(id: string): PlanItem {
      const row = repo.item(id);
      if (!row) throw new NotFoundError('That plan item does not exist.');
      return itemView(row);
    },

    /** Ticks an item off, skips it, or puts it back. */
    setStatus(id: string, status: 'planned' | 'done' | 'skipped'): PlanItem {
      const row = repo.item(id);
      if (!row) throw new NotFoundError('That plan item does not exist.');
      if (row.status === status) return itemView(row);
      const at = now();
      repo.transaction(() => {
        repo.setStatus(id, status, status === 'planned' ? null : at);
        repo.updatePlan(row.planId, {}, at);
      });
      return itemView(repo.item(id) as ItemRow);
    },

    /** Items due on a date, for the Today page. */
    forDate(date: string): PlanItem[] {
      const plan = repo.current();
      return plan
        ? repo
            .items(plan.id)
            .filter((item) => item.date === date)
            .map(itemView)
        : [];
    },
  };
}
