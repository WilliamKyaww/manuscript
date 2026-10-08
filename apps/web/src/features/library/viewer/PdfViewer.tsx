import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { IconButton } from '../../../components/IconButton';
import { Pane } from '../../../components/Pane';
import { ErrorState, LoadingState } from '../../../components/States';
import { cn } from '../../../lib/cn';
import { type PageSize, PdfPageCanvas } from './PdfPageCanvas';
import { openPdf, type PdfDocument } from './pdfjs';

/**
 * The PDF view of a source (task 5.18): page thumbnails, the pages themselves (fitted to the width,
 * zoomable, text selectable) and page navigation. `page` comes from the address and is scrolled to
 * whenever it changes, so search results and citations land on their page.
 */

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];
const THUMBNAIL_WIDTH = 112;
const GAP = 16;

export default function PdfViewer({
  url,
  page,
  onNavigate,
}: {
  url: string;
  page: number | undefined;
  onNavigate(page: number): void;
}) {
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [estimate, setEstimate] = useState<PageSize | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(page ?? 1);
  const [pagesRoot, setPagesRoot] = useState<HTMLElement | null>(null);
  const [thumbsRoot, setThumbsRoot] = useState<HTMLElement | null>(null);
  const pagesBox = useRef<HTMLDivElement>(null);
  const pageInputId = useId();

  useEffect(() => {
    const task = openPdf(url);
    let cancelled = false;
    task.promise
      .then(async (loaded) => {
        const first = await loaded.getPage(1);
        if (cancelled) return;
        const viewport = first.getViewport({ scale: 1 });
        setEstimate({ width: viewport.width, height: viewport.height });
        setDocument(loaded);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [url]);

  // The scroll containers are the panes' bodies; pages are rendered when near them.
  const pagesRef = useCallback((element: HTMLDivElement | null) => {
    pagesBox.current = element;
    setPagesRoot(element?.closest<HTMLElement>('[data-pane-body]') ?? null);
  }, []);
  const thumbsRef = useCallback((element: HTMLDivElement | null) => {
    setThumbsRoot(element?.closest<HTMLElement>('[data-pane-body]') ?? null);
  }, []);

  useEffect(() => {
    if (!pagesRoot) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(pagesRoot);
    return () => observer.disconnect();
  }, [pagesRoot]);

  const pageCount = document?.numPages ?? 0;
  const fit = estimate && width > 0 ? Math.max(0.25, (width - 2 * GAP) / estimate.width) : 1;
  const scale = Math.min(6, fit * zoom);

  const scrollToPage = useCallback((number: number, behavior: ScrollBehavior = 'auto') => {
    pagesBox.current
      ?.querySelector(`[data-page-number="${number}"]`)
      ?.scrollIntoView({ block: 'start', behavior });
  }, []);

  // Land on the requested page once the pages exist, and whenever the address changes it.
  const ready = document !== null && width > 0;
  useEffect(() => {
    if (ready && page) scrollToPage(page);
  }, [ready, page, scrollToPage]);

  // The page shown in the indicator: the last one whose top has passed the upper third of the view.
  useEffect(() => {
    const root = pagesRoot;
    const box = pagesBox.current;
    if (!root || !box || pageCount === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const pages = box.querySelectorAll<HTMLElement>('[data-page-number]');
      const view = root.getBoundingClientRect();
      const line = view.top + view.height / 3;
      // Pages are in order, so a binary search needs only a dozen measurements.
      let low = 0;
      let high = pages.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if ((pages[middle]?.getBoundingClientRect().top ?? 0) <= line) low = middle;
        else high = middle - 1;
      }
      setVisible(low + 1);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pagesRoot, pageCount]);

  // Keep the current page's thumbnail in view.
  // (Runs again once the document has loaded: the thumbnails do not exist before that.)
  useEffect(() => {
    if (!document) return;
    thumbsRoot
      ?.querySelector(`[data-thumbnail="${visible}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [thumbsRoot, visible, document]);

  const goTo = (number: number) => {
    const target = Math.min(Math.max(1, number), pageCount);
    onNavigate(target);
    scrollToPage(target);
  };
  const zoomBy = (direction: 1 | -1) => {
    const index = ZOOM_STEPS.findIndex((step) => step >= zoom - 0.001);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))];
    if (next) setZoom(next);
  };

  if (error) {
    return (
      <Pane title="Pages" className="flex-1">
        <ErrorState
          title="The PDF could not be shown"
          message="The file may be damaged or protected. You can still open the original."
          details={error}
        />
      </Pane>
    );
  }

  const thumbScale = estimate ? THUMBNAIL_WIDTH / estimate.width : 0.15;
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  return (
    <>
      <Pane title="Thumbnails" className="hidden w-44 flex-none border-r border-border md:flex">
        <div ref={thumbsRef}>
          <ol aria-label="Pages" className="space-y-3 p-3">
            {document &&
              estimate &&
              pages.map((number) => (
                <li key={number}>
                  <button
                    type="button"
                    onClick={() => goTo(number)}
                    aria-label={`Page ${number}`}
                    data-thumbnail={number}
                    aria-current={number === visible ? 'page' : undefined}
                    className={cn(
                      'group flex w-full flex-col items-center gap-1 rounded-md p-1 text-xs text-muted',
                      'hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus',
                      number === visible && 'bg-accent-subtle text-text',
                    )}
                  >
                    <PdfPageCanvas
                      document={document}
                      number={number}
                      scale={thumbScale}
                      estimate={estimate}
                      root={thumbsRoot}
                      textLayer={false}
                    />
                    <span aria-hidden="true">{number}</span>
                  </button>
                </li>
              ))}
          </ol>
        </div>
      </Pane>
      <Pane
        title="Pages"
        hideTitle
        className="min-w-0 flex-1"
        bodyClassName="bg-surface-sunken"
        actions={
          <div className="flex items-center gap-1">
            <IconButton
              label="Previous page"
              icon={<ChevronUp size={16} />}
              size="sm"
              disabled={visible <= 1}
              onClick={() => goTo(visible - 1)}
            />
            <label htmlFor={pageInputId} className="sr-only">
              Page number
            </label>
            <input
              key={visible}
              id={pageInputId}
              defaultValue={visible}
              inputMode="numeric"
              className="h-7 w-12 rounded-md border border-border-strong bg-surface text-center text-xs tabular-nums"
              onKeyDown={(event) => {
                if (event.key === 'Enter') goTo(Number(event.currentTarget.value) || visible);
              }}
            />
            <span className="text-xs text-muted tabular-nums">of {pageCount || '…'}</span>
            <IconButton
              label="Next page"
              icon={<ChevronDown size={16} />}
              size="sm"
              disabled={visible >= pageCount}
              onClick={() => goTo(visible + 1)}
            />
            <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
            <IconButton
              label="Zoom out"
              icon={<Minus size={16} />}
              size="sm"
              onClick={() => zoomBy(-1)}
            />
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="h-7 rounded-md px-2 text-xs text-muted tabular-nums hover:bg-surface-hover hover:text-text"
              aria-label="Fit to width"
            >
              {Math.round(zoom * 100)} %
            </button>
            <IconButton
              label="Zoom in"
              icon={<Plus size={16} />}
              size="sm"
              onClick={() => zoomBy(1)}
            />
          </div>
        }
      >
        <div ref={pagesRef} className="flex flex-col items-center gap-4 p-4">
          {!document && <LoadingState label="Opening the PDF" />}
          {document &&
            estimate &&
            width > 0 &&
            pages.map((number) => (
              <section key={number} aria-label={`Page ${number}`}>
                <PdfPageCanvas
                  document={document}
                  number={number}
                  scale={scale}
                  estimate={estimate}
                  root={pagesRoot}
                />
              </section>
            ))}
        </div>
      </Pane>
    </>
  );
}
