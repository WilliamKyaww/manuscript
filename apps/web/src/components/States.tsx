import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

/**
 * Shared state components (ui.md §5). Every data view uses these for its empty, error and loading
 * states so they look and behave the same everywhere.
 */

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent-subtle text-accent"
        >
          {icon}
        </div>
      )}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <div className="mt-2 text-sm text-muted">{description}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  /** Technical details, shown in a disclosure (never the default view). */
  details?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  details,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="mb-4 flex size-12 items-center justify-center rounded-full bg-danger-subtle text-danger"
      >
        <TriangleAlert size={22} />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
      {details && (
        <details className="mt-5 w-full text-left text-xs text-muted">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-surface-sunken p-3 font-mono whitespace-pre-wrap">
            {details}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * A failed request inside a card, widget or panel, where the full ErrorState would be too big: one
 * line saying what could not be loaded, and Try again. Never a blank or a zero in its place.
 */
export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-wrap items-center gap-2 text-sm', className)}>
      <TriangleAlert aria-hidden="true" size={16} className="shrink-0 text-danger" />
      <span className="text-muted">{message}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Placeholder block shaped like the content that is loading. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse rounded-md bg-surface-sunken motion-reduce:animate-none',
        className,
      )}
    />
  );
}

/** Accessible loading region: announces once, shows skeleton children. */
export function LoadingState({
  label = 'Loading',
  children,
}: {
  label?: string;
  children?: ReactNode;
}) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      {children ?? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
    </div>
  );
}
