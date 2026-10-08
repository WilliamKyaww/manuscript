import type { Course } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarClock, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '../../components/Card';
import { LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { coursesQuery, deadlinesQuery, modulesQuery } from '../learning/api';
import { dueLabel, formatDue, formatWeight, isoDay } from '../learning/format';
import { MarksSummary } from '../learning/MarksSummary';

/** Today's deadline and target widgets (task 6.14). */

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
          className="flex size-9 items-center justify-center rounded-md bg-surface-sunken text-muted"
        >
          {icon}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </Card>
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
