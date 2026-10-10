import { addDays, dayNumber, type PlanItem, type StudyPlan } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarRange, Settings2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Page } from '../../components/Page';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { notifyError } from '../../lib/notify';
import { readPreference, writePreference } from '../../lib/storage';
import { selectClasses } from '../learning/Field';
import { planQuery, usePlanActions } from './api';
import { PlanItemRow } from './PlanItemRow';

/**
 * The study plan (tasks 14.09, learning-system.md §9): the coming days, what to do on each and why.
 * Making the plan again keeps what has been ticked off or skipped.
 */

const VIEW_KEY = 'skb.plan.view';
const HORIZONS = [7, 14, 28] as const;

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

function dayRange(plan: StudyPlan, today: string): string[] {
  const first = plan.startDate > today ? plan.startDate : today;
  const length = dayNumber(plan.endDate) - dayNumber(first) + 1;
  return Array.from({ length: Math.max(0, length) }, (_, offset) => addDays(first, offset));
}

function Day({
  date,
  today,
  items,
  capacity,
}: {
  date: string;
  today: string;
  items: PlanItem[];
  capacity: number;
}) {
  const planned = items.reduce((sum, item) => sum + item.minutes, 0);
  return (
    <section
      aria-label={dayLabel(date)}
      data-plan-day={date}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3',
        date === today ? 'border-accent bg-accent-subtle/40' : 'bg-bg',
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{dayLabel(date)}</h3>
        {date === today && <Badge tone="accent">Today</Badge>}
      </header>
      {capacity > 0 || planned > 0 ? (
        <ProgressBar
          value={capacity > 0 ? planned / capacity : 1}
          label={`${planned} of ${capacity} minutes planned on ${dayLabel(date)}`}
          hideLabel
        />
      ) : null}
      <p className="text-xs text-muted">
        {capacity === 0 && planned === 0
          ? 'No time set aside'
          : `${planned} of ${capacity} min${planned > capacity ? ' (reviews are due whatever the time)' : ''}`}
      </p>
      {items.length === 0 ? (
        <p className="text-xs text-muted">Nothing planned.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <PlanItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanView({ plan, today }: { plan: StudyPlan; today: string }) {
  const [view, setView] = useState<'week' | 'list'>(() =>
    readPreference(VIEW_KEY) === 'list' ? 'list' : 'week',
  );
  const days = dayRange(plan, today);
  const items = plan.items.filter((item) => item.date >= today || item.status === 'planned');
  const done = plan.items.filter((item) => item.status === 'done').length;
  const minutes = items.reduce((sum, item) => sum + item.minutes, 0);
  const capacity = new Map(plan.capacity.map((day) => [day.date, day.minutes]));
  const change = (next: 'week' | 'list') => {
    setView(next);
    writePreference(VIEW_KEY, next);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" data-plan-summary>
          {dayLabel(days[0] ?? plan.startDate)} to {dayLabel(plan.endDate)} · {items.length} items ·{' '}
          {minutes} min · {done} done
        </p>
        <fieldset className="flex gap-1">
          <legend className="sr-only">View</legend>
          {(['week', 'list'] as const).map((value) => (
            <label
              key={value}
              className={cn(
                'cursor-pointer rounded-md border px-3 py-1 text-sm capitalize',
                view === value
                  ? 'border-accent bg-accent-subtle'
                  : 'border-border-strong hover:bg-surface-hover',
              )}
            >
              <input
                type="radio"
                name="plan-view"
                className="sr-only"
                checked={view === value}
                onChange={() => change(value)}
              />
              {value === 'week' ? 'Week' : 'List'}
            </label>
          ))}
        </fieldset>
      </div>

      {plan.unscheduled.length > 0 && (
        <div
          role="note"
          className="rounded-md border border-warning bg-warning-subtle px-3 py-2 text-sm"
        >
          <p className="font-medium">Not everything fits</p>
          <ul className="mt-1 list-disc pl-5">
            {plan.unscheduled.map((entry) => (
              <li key={entry.title}>
                {entry.title}: {entry.reason}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted">
            Set aside more time in{' '}
            <Link to="/settings" className="underline">
              Settings → Study plan
            </Link>
            , or move a deadline.
          </p>
        </div>
      )}

      {view === 'week' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {days.map((date) => (
            <Day
              key={date}
              date={date}
              today={today}
              capacity={capacity.get(date) ?? 0}
              items={plan.items.filter((item) => item.date === date)}
            />
          ))}
        </div>
      ) : (
        <ol aria-label="Plan" className="space-y-4">
          {days.map((date) => {
            const ofDay = plan.items.filter((item) => item.date === date);
            return (
              <li key={date}>
                <h3 className="mb-1.5 text-sm font-semibold">
                  {dayLabel(date)}
                  {date === today && (
                    <Badge tone="accent" className="ml-2">
                      Today
                    </Badge>
                  )}
                </h3>
                {ofDay.length === 0 ? (
                  <p className="text-sm text-muted">Nothing planned.</p>
                ) : (
                  <ul className="space-y-2">
                    {ofDay.map((item) => (
                      <PlanItemRow key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function PlanPage() {
  const api = useApi();
  const current = useQuery(planQuery(api));
  const actions = usePlanActions();
  const [days, setDays] = useState<number>(7);
  const plan = current.data?.plan ?? null;
  const make = () => actions.generate.mutate(days, { onError: notifyError });

  return (
    <Page
      title="Plan"
      description="What to study each day, from your deadlines, marks, weak concepts and due reviews — and why."
      width="wide"
      actions={
        <>
          <Link
            to="/settings"
            className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-muted hover:bg-surface-hover hover:text-text"
          >
            <Settings2 aria-hidden="true" size={16} /> Availability
          </Link>
          <select
            aria-label="Days to plan"
            className={cn(selectClasses, 'w-auto')}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            {HORIZONS.map((value) => (
              <option key={value} value={value}>
                {value} days
              </option>
            ))}
          </select>
          <Button variant="primary" loading={actions.generate.isPending} onClick={make}>
            <Sparkles aria-hidden="true" size={16} /> {plan ? 'Plan again' : 'Make a plan'}
          </Button>
        </>
      }
    >
      {current.isPending && <LoadingState label="Loading the plan" />}
      {current.isError && (
        <ErrorState message="The plan could not be loaded." onRetry={() => current.refetch()} />
      )}
      {current.data && !plan && (
        <Card className="p-2">
          <EmptyState
            icon={<CalendarRange size={22} />}
            title="No plan yet"
            description={
              <p>
                A plan sets aside time each day for the reviews that are due, work before each
                deadline, mock exams before an exam, and practice on the concepts that matter most.
                It uses the time you say you have in Settings, and gives a reason for everything it
                suggests.
              </p>
            }
            action={
              <Button variant="primary" loading={actions.generate.isPending} onClick={make}>
                Make a {days}-day plan
              </Button>
            }
          />
        </Card>
      )}
      {plan && current.data && <PlanView plan={plan} today={current.data.today} />}
    </Page>
  );
}
