import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CalendarRange } from 'lucide-react';
import { buttonClasses } from '../../components/Button';
import { Card } from '../../components/Card';
import { LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { planQuery } from '../plan/api';
import { PlanItemRow } from '../plan/PlanItemRow';

/** Today's plan (task 14.10): what is planned for today, each item with its reason, and where to start. */
export function PlanWidget() {
  const api = useApi();
  const current = useQuery(planQuery(api));
  const plan = current.data?.plan ?? null;
  const today = current.data?.today ?? '';
  const items = plan?.items.filter((item) => item.date === today) ?? [];
  const minutes = items.reduce((sum, item) => sum + item.minutes, 0);
  const done = items.filter((item) => item.status === 'done').length;
  return (
    <Card className="p-5 md:col-span-2" data-widget="plan">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-md bg-surface-sunken text-muted"
          >
            <CalendarRange size={18} />
          </span>
          <h2 className="text-base font-semibold">Today’s plan</h2>
        </div>
        <Link to="/plan" className={buttonClasses('ghost', 'sm')}>
          {plan ? 'Open the plan' : 'Make a plan'}
        </Link>
      </div>
      {current.isPending && <LoadingState label="Loading the plan" />}
      {current.data && !plan && (
        <p className="text-sm text-muted">
          No study plan yet. A plan sets aside time for your reviews, deadlines and weakest
          concepts, and says why.
        </p>
      )}
      {plan && items.length === 0 && (
        <p className="text-sm text-muted">
          Nothing is planned for today. Plan again to refresh it.
        </p>
      )}
      {items.length > 0 && (
        <>
          <p className="mb-2 text-sm text-muted">
            {items.length} {items.length === 1 ? 'item' : 'items'} · {minutes} min · {done} done
          </p>
          <ul aria-label="Today’s plan" className="grid gap-2 lg:grid-cols-2">
            {items.map((item) => (
              <PlanItemRow key={item.id} item={item} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
