import type { SourceSection } from '@skb/core';
import { MessageSquareText } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Pane } from '../../../components/Pane';
import { cn } from '../../../lib/cn';

/**
 * Slides as text (task 5.18): every slide's title, body and speaker notes, with a slide list. The
 * slide design itself is not rendered — the original opens in PowerPoint for that — but this is
 * what search and (later) citations point at, so `?slide=3&notes=1` lands on the notes of slide 3.
 */

function slideParts(section: SourceSection): { title: string | null; body: string } {
  const title = section.headingPath[0] ?? null;
  const lines = section.text.split('\n');
  return { title, body: title && lines[0] === title ? lines.slice(1).join('\n') : section.text };
}

export function SlidesViewer({
  sections,
  slide,
  notes,
  onNavigate,
}: {
  sections: readonly SourceSection[];
  slide: number | undefined;
  notes: boolean;
  onNavigate(slide: number): void;
}) {
  const main = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slide) return;
    const selector = notes ? `[data-slide="${slide}"] [data-notes]` : `[data-slide="${slide}"]`;
    main.current?.querySelector(selector)?.scrollIntoView({ block: notes ? 'center' : 'start' });
  }, [slide, notes]);

  const numberOf = (section: SourceSection) =>
    section.locator.kind === 'slides' ? section.locator.slide : section.ordinal + 1;

  return (
    <>
      <Pane title="Slides" className="hidden w-60 flex-none border-r border-border md:flex">
        <ol aria-label="Slides" className="space-y-0.5 p-2">
          {sections.map((section) => {
            const number = numberOf(section);
            const { title } = slideParts(section);
            return (
              <li key={section.ordinal}>
                <button
                  type="button"
                  onClick={() => onNavigate(number)}
                  aria-current={number === slide ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    'hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus',
                    number === slide && 'bg-accent-subtle',
                  )}
                >
                  <span className="w-6 shrink-0 text-right text-xs text-muted tabular-nums">
                    {number}
                  </span>
                  <span className={cn('truncate', !title && 'text-muted italic')}>
                    {title ?? 'Untitled slide'}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </Pane>
      <Pane title="Slides as text" className="min-w-0 flex-1">
        <div ref={main} className="mx-auto max-w-3xl space-y-4 p-6">
          <p className="text-xs text-muted">
            Slides are shown as text with their speaker notes. Open the original file to see the
            slide design.
          </p>
          {sections.map((section) => {
            const number = numberOf(section);
            const { title, body } = slideParts(section);
            const targeted = number === slide;
            return (
              <article
                key={section.ordinal}
                data-slide={number}
                aria-label={`Slide ${number}${title ? `: ${title}` : ''}`}
                className={cn(
                  'scroll-mt-4 rounded-lg border bg-surface p-5',
                  targeted && !notes ? 'border-accent ring-2 ring-accent/30' : 'border-border',
                )}
              >
                <p className="eyebrow">Slide {number}</p>
                <h2 className={cn('mt-1 text-lg font-semibold', !title && 'text-muted italic')}>
                  {title ?? 'Untitled slide'}
                </h2>
                {body.trim() && (
                  <div className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{body}</div>
                )}
                {!body.trim() && !section.notes && (
                  <p className="mt-3 text-sm text-muted">
                    No text on this slide (it may be a picture).
                  </p>
                )}
                {section.notes && (
                  <aside
                    data-notes
                    aria-label={`Speaker notes for slide ${number}`}
                    className={cn(
                      'mt-4 rounded-md border-l-4 bg-surface-sunken p-3 text-sm leading-relaxed whitespace-pre-wrap',
                      targeted && notes
                        ? 'border-accent ring-2 ring-accent/30'
                        : 'border-border-strong',
                    )}
                  >
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
                      <MessageSquareText aria-hidden="true" size={13} />
                      Speaker notes
                    </p>
                    {section.notes}
                  </aside>
                )}
              </article>
            );
          })}
        </div>
      </Pane>
    </>
  );
}
