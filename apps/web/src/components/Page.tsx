import { APP_NAME } from '@skb/core';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useId } from 'react';
import { cn } from '../lib/cn';

/**
 * Page layout implementing the permanent sticky-header rule (ui.md §2):
 *
 *   <Page>            flex column filling the main area
 *     <header>        flex: none — OUTSIDE the scroll container, so it can never scroll away
 *     <PageBody>      flex: 1; overflow-y: auto — the page's only scroll container
 *
 * Every route renders exactly one <Page>. Secondary headers inside the body use <StickySection>.
 *
 * With `layout="panes"` the body does not scroll itself: it holds side-by-side <Pane>s (see
 * Pane.tsx), each with its own fixed header and its own scroll container — the same rule, per pane.
 */

export interface Breadcrumb {
  label: string;
  to?: string;
}

export type PageWidth = 'default' | 'wide' | 'full';
export type PageLayout = 'scroll' | 'panes';

export interface PageProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** Second header row for tabs or filters — part of the fixed header. */
  toolbar?: ReactNode;
  width?: PageWidth;
  /** `panes`: the body is a row of independently scrolling panes instead of one scroll container. */
  layout?: PageLayout;
  children: ReactNode;
  bodyClassName?: string;
}

const WIDTHS: Record<PageWidth, string> = {
  default: 'max-w-5xl',
  wide: 'max-w-7xl',
  full: 'max-w-none',
};

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title === APP_NAME ? APP_NAME : `${title} · ${APP_NAME}`;
  }, [title]);
}

export function Page({
  title,
  description,
  actions,
  breadcrumbs,
  toolbar,
  width = 'default',
  layout = 'scroll',
  children,
  bodyClassName,
}: PageProps) {
  useDocumentTitle(title);
  return (
    <div data-page className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        data-page-header
        className={cn('flex-none border-b border-border bg-surface px-6 pt-4', !toolbar && 'pb-4')}
      >
        {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1
              data-page-title
              tabIndex={-1}
              className="truncate text-xl font-semibold tracking-tight focus:outline-none"
            >
              {title}
            </h1>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {toolbar && (
          <div data-page-toolbar className="mt-3">
            {toolbar}
          </div>
        )}
      </header>
      {layout === 'panes' ? (
        <div
          data-page-body
          data-layout="panes"
          className={cn('flex min-h-0 flex-1 overflow-hidden', bodyClassName)}
        >
          {children}
        </div>
      ) : (
        <div data-page-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className={cn('mx-auto w-full px-6 py-6', WIDTHS[width], bodyClassName)}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {items.map((item, index) => (
          <li key={`${item.to ?? ''}|${item.label}`} className="flex items-center gap-1">
            {index > 0 && <ChevronRight aria-hidden="true" size={12} />}
            {item.to ? (
              <Link to={item.to} className="hover:text-text hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface StickySectionProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A section whose header sticks to the top of the page body while its content scrolls beneath. */
export function StickySection({
  title,
  description,
  actions,
  children,
  className,
}: StickySectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn('mb-8', className)}>
      <div
        data-sticky-header
        className="sticky top-0 z-10 -mx-6 flex items-center justify-between gap-4 border-b border-border bg-bg px-6 py-2"
      >
        <div className="min-w-0">
          <h2 id={headingId} className="text-sm font-semibold">
            {title}
          </h2>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}
