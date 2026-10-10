import { type ReactNode, useId } from 'react';
import { cn } from '../lib/cn';

/**
 * One column of a `<Page layout="panes">`. Like a page, a pane's header sits outside its scroll
 * container, so it never scrolls away (the sticky-header rule, ui.md §2).
 */
export interface PaneProps {
  title: string;
  /** Visually hide the title (it still labels the pane for assistive technology). */
  hideTitle?: boolean;
  actions?: ReactNode;
  /** A second header row (tabs, filters), also fixed. */
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Pane({
  title,
  hideTitle,
  actions,
  toolbar,
  children,
  className,
  bodyClassName,
}: PaneProps) {
  const headingId = useId();
  return (
    <section
      data-pane
      aria-labelledby={headingId}
      className={cn('flex h-full min-h-0 min-w-0 flex-col bg-bg', className)}
    >
      <div
        data-pane-header
        className="flex h-10 flex-none items-center justify-between gap-2 border-b border-border bg-surface px-3"
      >
        <h2 id={headingId} className={cn('eyebrow truncate', hideTitle && 'sr-only')}>
          {title}
        </h2>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {toolbar && (
        <div data-pane-toolbar className="flex-none border-b border-border bg-surface px-3 py-1.5">
          {toolbar}
        </div>
      )}
      <div
        data-pane-body
        className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}
