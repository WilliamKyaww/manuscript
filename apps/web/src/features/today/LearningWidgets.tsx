import type { Course } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarClock, Layers, Play, Sparkles, Target, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { InlineError, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { formatCount } from '../../lib/format';
import { coursesQuery, deadlinesQuery, modulesQuery } from '../learning/api';
import { dueLabel, formatDue, formatWeight, isoDay } from '../learning/format';
import { MarksSummary } from '../learning/MarksSummary';
import { weakAreasQuery } from '../practice/api';
import { usePractiseConcept } from '../progress/WeakAreas';
import { cardSetsQuery, reviewSettingsQuery, reviewStatsQuery } from '../review/api';

/** Today's review, deadline, target and weak-area widgets (tasks 6.14, 8.10, 9.13). */

function WidgetCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-md bg-surface-sunken text-muted simplified:bg-transparent"
        >
          {icon}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

/** Rough time per face, for the estimate: a known face is quick, a new one takes longer. */
const SECONDS_PER_DUE = 10;
const SECONDS_PER_NEW = 30;

export function ReviewsWidget() {
  const api = useApi();
  const stats = useQuery(reviewStatsQuery(api));
  const sets = useQuery(cardSetsQuery(api));
  const settings = useQuery(reviewSettingsQuery(api));
  const due = stats.data?.dueToday ?? 0;
  const waiting = (sets.data?.sets ?? []).reduce((sum, set) => sum + set.counts.new, 0);
  const fresh = Math.min(waiting, settings.data?.newPerDay ?? waiting);
  const minutes = Math.max(1, Math.round((due * SECONDS_PER_DUE + fresh * SECONDS_PER_NEW) / 60));
  return (
    <WidgetCard title="Reviews due" icon={<Layers size={18} />}>
      {stats.isPending || sets.isPending ? (
        <LoadingState label="Loading reviews" />
      ) : stats.isError || sets.isError ? (
        <InlineError
          message="Your reviews could not be loaded."
          onRetry={() => {
            void stats.refetch();
            void sets.refetch();
          }}
        />
      ) : (sets.data?.sets.length ?? 0) === 0 ? (
        <p className="text-sm text-muted">
          Make your first{' '}
          <Link to="/review" className="underline">
            flashcards
          </Link>{' '}
          (Ctrl+Shift+A adds one from anywhere).
        </p>
      ) : due + fresh === 0 ? (
        <p className="text-sm text-muted">Nothing is due. Well done.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <span className="text-2xl font-semibold tabular-nums">{due}</span> due
            {fresh > 0 && ` · ${formatCount(fresh, 'new card')}`}
            <span className="block text-xs text-muted">about {formatCount(minutes, 'minute')}</span>
          </p>
          <Link to="/review/session" className={buttonClasses('primary', 'sm')}>
            <Play aria-hidden="true" size={14} /> Review now
          </Link>
        </div>
      )}
    </WidgetCard>
  );
}

const DAYS = 14;

export function DeadlinesWidget({ now }: { now: Date }) {
  const api = useApi();
  const deadlines = useQuery(deadlinesQuery(api, DAYS));
  const modules = useQuery(modulesQuery(api));
  const today = isoDay(now);
  const items = deadlines.data?.deadlines ?? [];
  return (
    <WidgetCard title="Upcoming deadlines" icon={<CalendarClock size={18} />}>
      {deadlines.isPending ? (
        <LoadingState label="Loading deadlines" />
      ) : deadlines.isError || modules.isError ? (
        <InlineError
          message="Your deadlines could not be loaded."
          onRetry={() => {
            void deadlines.refetch();
            void modules.refetch();
          }}
        />
      ) : (modules.data?.modules.length ?? 0) === 0 ? (
        <p className="text-sm text-muted">
          Add your{' '}
          <Link to="/modules" className="underline">
            modules
          </Link>{' '}
          and their assessments to see what is due.
        </p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Nothing is due in the next fortnight.</p>
      ) : (
        <ul aria-label="Upcoming deadlines" className="space-y-2">
          {items.map((deadline) => (
            <li key={deadline.assessmentId} className="flex items-baseline gap-3 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted">
                {dueLabel(deadline.dueAt, today)}
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  to="/modules/$moduleId"
                  params={{ moduleId: deadline.module.id }}
                  className="font-medium hover:underline"
                >
                  {deadline.module.code} {deadline.title}
                </Link>
                <span className="block text-xs text-muted">
                  {formatDue(deadline.dueAt)} · {formatWeight(deadline.weight)} of the module
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

/** The course running today, or else the most recently started one. */
export function currentCourse(courses: readonly Course[], today: string): Course | undefined {
  const running = courses.find(
    (course) =>
      (!course.startDate || course.startDate <= today) &&
      (!course.endDate || course.endDate >= today),
  );
  return running ?? courses[0];
}

export function TargetWidget({ now }: { now: Date }) {
  const api = useApi();
  const courses = useQuery(coursesQuery(api));
  const course = currentCourse(courses.data?.courses ?? [], isoDay(now));
  return (
    <WidgetCard title="Towards your target" icon={<Target size={18} />}>
      {courses.isPending ? (
        <LoadingState label="Loading progress" />
      ) : courses.isError ? (
        <InlineError
          message="Your courses could not be loaded."
          onRetry={() => void courses.refetch()}
        />
      ) : !course ? (
        <p className="text-sm text-muted">
          Create a course with a target average in{' '}
          <Link to="/modules" className="underline">
            Modules
          </Link>{' '}
          to follow your progress here.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted">
            {course.title}
            {course.targetAverage !== null && ` · target average ${course.targetAverage} %`}
          </p>
          <MarksSummary
            marks={course.marks}
            requirement={course.requirement}
            target={course.targetAverage}
            compact
          />
        </>
      )}
    </WidgetCard>
  );
}

const WEAK_SHOWN = 4;

export function WeakAreasWidget() {
  const api = useApi();
  const weak = useQuery(weakAreasQuery(api, undefined, WEAK_SHOWN));
  const practise = usePractiseConcept();
  const items = weak.data?.items ?? [];
  const missing = weak.data?.noMaterial.length ?? 0;
  return (
    <WidgetCard title="Weak areas" icon={<TrendingDown size={18} />}>
      {weak.isPending ? (
        <LoadingState label="Loading weak areas" />
      ) : weak.isError ? (
        <InlineError
          message="Weak areas could not be worked out."
          onRetry={() => void weak.refetch()}
        />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing weak, slipping or being forgotten.{' '}
          {missing > 0 && (
            <>
              {formatCount(missing, 'concept')} {missing === 1 ? 'has' : 'have'} nothing to practise
              yet —{' '}
              <Link to="/progress" className="underline">
                see Progress
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <ul aria-label="Weak areas" className="space-y-2">
          {items.map((row) => (
            <li key={row.concept.id} className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1">
                <Link
                  to="/concepts/$conceptId"
                  params={{ conceptId: row.concept.id }}
                  className="font-medium hover:underline"
                >
                  {row.concept.name}
                </Link>
                <span className="block truncate text-xs text-muted">
                  {row.signals.find((signal) => signal.kind !== 'no_material')?.reason}
                </span>
              </span>
              <Button
                size="sm"
                disabled={practise.pending}
                onClick={() => void practise.start(row.concept.id)}
                aria-label={`Practise ${row.concept.name}`}
              >
                <Sparkles aria-hidden="true" size={14} /> Practise
              </Button>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}
