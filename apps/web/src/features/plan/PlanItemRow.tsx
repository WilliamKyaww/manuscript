import type { PlanItem } from '@skb/core';
import { Link } from '@tanstack/react-router';
import { Check, Circle, RotateCcw, SkipForward } from 'lucide-react';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Button, buttonClasses } from '../../components/Button';
import { cn } from '../../lib/cn';
import { notifyError } from '../../lib/notify';
import { usePractiseConcept } from '../progress/WeakAreas';
import { usePlanActions } from './api';

/**
 * One planned item (task 14.09): what to do, for how long, and — always — why. It can be ticked
 * off, skipped, put back, and opened where the work is done.
 */

export const KIND_LABELS: Record<PlanItem['kind'], { label: string; tone: BadgeTone }> = {
  review: { label: 'Review', tone: 'info' },
  practice: { label: 'Practise', tone: 'accent' },
  learn: { label: 'Learn', tone: 'success' },
  coursework: { label: 'Coursework', tone: 'warning' },
  mock_exam: { label: 'Mock exam', tone: 'danger' },
};

/** Where the work of an item is done. */
function Open({ item }: { item: PlanItem }) {
  const practise = usePractiseConcept();
  const link = `${buttonClasses('secondary', 'sm')}`;
  switch (item.kind) {
    case 'practice':
      return item.targetId ? (
        <Button
          size="sm"
          loading={practise.pending}
          onClick={() => void practise.start(item.targetId as string)}
        >
          Start
        </Button>
      ) : null;
    case 'review':
      return item.targetType === 'module' && item.targetId ? (
        <Link to="/review/session" search={{ module: item.targetId }} className={link}>
          Start
        </Link>
      ) : (
        <Link to="/review/session" className={link}>
          Start
        </Link>
      );
    case 'learn':
      return item.targetId ? (
        <Link to="/lectures/$lectureId" params={{ lectureId: item.targetId }} className={link}>
          Open lecture
        </Link>
      ) : null;
    case 'mock_exam':
      return (
        <Link to="/practice" className={link}>
          Open Practice
        </Link>
      );
    default:
      return (
        <Link to="/modules" className={link}>
          Open modules
        </Link>
      );
  }
}

export function PlanItemRow({ item, compact = false }: { item: PlanItem; compact?: boolean }) {
  const actions = usePlanActions();
  const set = (status: PlanItem['status']) =>
    actions.setStatus.mutate({ id: item.id, status }, { onError: notifyError });
  const finished = item.status !== 'planned';
  const kind = KIND_LABELS[item.kind];
  return (
    <li
      data-plan-item
      data-status={item.status}
      className={cn(
        'rounded-md border border-border bg-surface p-2.5 text-sm',
        finished && 'bg-surface-sunken',
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label={finished ? `Put back: ${item.title}` : `Mark done: ${item.title}`}
          aria-pressed={item.status === 'done'}
          className="mt-0.5 rounded-full text-muted hover:text-text"
          onClick={() => set(finished ? 'planned' : 'done')}
        >
          {item.status === 'done' ? (
            <Check aria-hidden="true" size={18} className="text-success" />
          ) : item.status === 'skipped' ? (
            <SkipForward aria-hidden="true" size={18} />
          ) : (
            <Circle aria-hidden="true" size={18} />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn('font-medium', finished && 'text-muted line-through decoration-1')}>
            {item.title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Badge tone={kind.tone}>{kind.label}</Badge>
            <span>{item.minutes} min</span>
            {item.status === 'skipped' && <span>· skipped</span>}
          </p>
          <p className="mt-1 text-xs text-muted">{item.reason}</p>
        </div>
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap justify-end gap-1.5">
          {finished ? (
            <Button size="sm" variant="ghost" onClick={() => set('planned')}>
              <RotateCcw aria-hidden="true" size={14} /> Put back
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => set('skipped')}>
                <SkipForward aria-hidden="true" size={14} /> Skip
              </Button>
              <Open item={item} />
            </>
          )}
        </div>
      )}
    </li>
  );
}
