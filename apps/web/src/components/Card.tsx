import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-surface shadow-sm', className)}
      {...props}
    />
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Heading level for the title (defaults to h2; pages own the h1). */
  as?: 'h2' | 'h3';
}

export function CardHeader({ title, description, actions, as: Heading = 'h2' }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-4">
      <div className="min-w-0">
        <Heading className="text-base font-semibold">{title}</Heading>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}
