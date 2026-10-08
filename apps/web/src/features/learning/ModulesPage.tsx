import type { Course, ModuleSummary } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarClock, GraduationCap, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { IconButton } from '../../components/IconButton';
import { Page, StickySection } from '../../components/Page';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { coursesQuery, modulesQuery } from './api';
import { CourseDialog, ModuleDialog } from './dialogs';
import { formatDue, formatPercent } from './format';
import { MarksSummary } from './MarksSummary';

/** Modules grouped by course, with marks against targets and the next deadline (task 6.10). */
export function ModulesPage() {
  const api = useApi();
  const courses = useQuery(coursesQuery(api));
  const modules = useQuery(modulesQuery(api));
  const [dialog, setDialog] = useState<'module' | 'course' | null>(null);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  const allCourses = courses.data?.courses ?? [];
  const allModules = modules.data?.modules ?? [];
  const active = allModules.filter((module) => !module.archived);
  const groups = [
    ...allCourses.map((course) => ({
      course,
      modules: active.filter((module) => module.courseId === course.id),
    })),
    {
      course: null,
      modules: active.filter(
        (module) => !allCourses.some((course) => course.id === module.courseId),
      ),
    },
  ].filter((group) => group.course || group.modules.length > 0);
  const archived = allModules.filter((module) => module.archived);

  return (
    <Page
      title="Modules"
      description="Your modules, lectures and assessments — and what you need for your targets."
      width="wide"
      actions={
        <>
          <Button onClick={() => setDialog('course')}>
            <GraduationCap aria-hidden="true" size={16} />
            New course
          </Button>
          <Button variant="primary" onClick={() => setDialog('module')}>
            <Plus aria-hidden="true" size={16} />
            New module
          </Button>
        </>
      }
    >
      {(courses.isPending || modules.isPending) && <LoadingState label="Loading modules" />}
      {(courses.isError || modules.isError) && (
        <ErrorState
          message={(courses.error ?? modules.error)?.message ?? 'Could not load the modules.'}
          onRetry={() => void Promise.all([courses.refetch(), modules.refetch()])}
        />
      )}
      {courses.isSuccess &&
        modules.isSuccess &&
        allModules.length === 0 &&
        allCourses.length === 0 && (
          <EmptyState
            icon={<GraduationCap size={20} />}
            title="No modules yet"
            description="Add the modules you are taking this year, with their credits and assessments, to see the marks you need for your target. A course groups them and holds your target average."
            action={
              <Button variant="primary" onClick={() => setDialog('module')}>
                <Plus aria-hidden="true" size={16} />
                New module
              </Button>
            }
          />
        )}
      {groups.map(({ course, modules: items }) => (
        <StickySection
          key={course?.id ?? 'none'}
          title={course?.title ?? 'Not in a course'}
          description={
            course && course.targetAverage !== null
              ? `Target average ${formatPercent(course.targetAverage)}`
              : undefined
          }
          actions={
            course && (
              <IconButton
                label={`Edit ${course.title}`}
                icon={<Pencil size={14} />}
                size="sm"
                onClick={() => setEditingCourse(course)}
              />
            )
          }
        >
          {course && course.moduleCount > 0 && (
            <Card className="mb-4 p-4">
              <h3 className="mb-3 text-sm font-semibold">Course average (credit-weighted)</h3>
              <MarksSummary
                marks={course.marks}
                requirement={course.requirement}
                target={course.targetAverage}
              />
            </Card>
          )}
          {items.length === 0 ? (
            <p className="text-sm text-muted">No modules in this course yet.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {items.map((module) => (
                <ModuleCard key={module.id} module={module} />
              ))}
            </ul>
          )}
        </StickySection>
      ))}
      {archived.length > 0 && (
        <StickySection title="Archived" description="Modules you have finished or dropped.">
          <ul className="grid gap-3 md:grid-cols-2">
            {archived.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </ul>
        </StickySection>
      )}
      {dialog === 'module' && (
        <ModuleDialog open courses={allCourses} onClose={() => setDialog(null)} />
      )}
      {dialog === 'course' && <CourseDialog open onClose={() => setDialog(null)} />}
      {editingCourse && (
        <CourseDialog open course={editingCourse} onClose={() => setEditingCourse(null)} />
      )}
    </Page>
  );
}

function ModuleCard({ module }: { module: ModuleSummary }) {
  return (
    <li>
      <Link
        to="/modules/$moduleId"
        params={{ moduleId: module.id }}
        className="block h-full rounded-lg border border-border bg-surface p-4 hover:border-border-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
        style={{ borderLeft: `4px solid ${module.colour ?? 'var(--skb-border-strong)'}` }}
      >
        <span className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted">{module.code}</span>
          <span className="truncate font-medium">{module.title}</span>
          {module.credits !== null && <Badge>{module.credits} credits</Badge>}
        </span>
        <span className="mt-2 block">
          <MarksSummary
            marks={module.marks}
            requirement={module.requirement}
            target={module.targetMark}
            compact
          />
        </span>
        {module.nextDeadline && (
          <span className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <CalendarClock aria-hidden="true" size={13} />
            Next: {module.nextDeadline.title}, {formatDue(module.nextDeadline.dueAt)}
          </span>
        )}
        <span className="mt-2 block text-xs text-subtle">
          {module.counts.lectures} lectures · {module.counts.assessments} assessments ·{' '}
          {module.counts.sources} sources · {module.counts.notes} notes
        </span>
      </Link>
    </li>
  );
}
