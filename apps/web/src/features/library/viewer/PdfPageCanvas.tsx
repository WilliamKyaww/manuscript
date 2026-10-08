import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/cn';
import { type PdfDocument, TextLayer } from './pdfjs';
import './pdf-text-layer.css';

/**
 * One PDF page, rendered only while it is near the visible area of `root` (and released when it
 * leaves, so long documents do not hold hundreds of canvases). The text layer on top makes the
 * text selectable and readable by screen readers.
 */

export interface PageSize {
  width: number;
  height: number;
}

export function PdfPageCanvas({
  document,
  number,
  scale,
  estimate,
  root,
  textLayer = true,
  className,
}: {
  document: PdfDocument;
  number: number;
  scale: number;
  /** Size at scale 1 to reserve before the page itself has loaded. */
  estimate: PageSize;
  /** The scroll container (for deciding what is near the view). */
  root: Element | null;
  textLayer?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState<PageSize | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      {
        root,
        rootMargin: '150% 0px',
      },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const target = canvas.current;
    const layer = text.current;
    if (!near || !target) return;
    let cancelled = false;
    let render: { cancel(): void; promise: Promise<void> } | null = null;
    let textRender: TextLayer | null = null;
    void (async () => {
      const page = await document.getPage(number);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width / scale, height: viewport.height / scale });
      const ratio = window.devicePixelRatio || 1;
      target.width = Math.floor(viewport.width * ratio);
      target.height = Math.floor(viewport.height * ratio);
      render = page.render({
        canvas: target,
        viewport,
        ...(ratio !== 1 ? { transform: [ratio, 0, 0, ratio, 0, 0] } : {}),
      });
      await render.promise;
      if (cancelled || !textLayer || !layer) return;
      layer.replaceChildren();
      textRender = new TextLayer({
        textContentSource: page.streamTextContent(),
        container: layer,
        viewport,
      });
      await textRender.render();
    })().catch((error: unknown) => {
      const name = (error as { name?: string }).name;
      if (!cancelled && name !== 'RenderingCancelledException') setFailed(true);
    });
    return () => {
      cancelled = true;
      render?.cancel();
      textRender?.cancel();
      // Release the bitmap: a zero-sized canvas frees its memory.
      target.width = 0;
      target.height = 0;
      layer?.replaceChildren();
    };
  }, [near, document, number, scale, textLayer]);

  const current = size ?? estimate;
  const style = {
    width: Math.floor(current.width * scale),
    height: Math.floor(current.height * scale),
    '--total-scale-factor': scale,
  } as CSSProperties;
  return (
    <div
      ref={box}
      data-page-number={number}
      className={cn('skb-pdf-page relative overflow-hidden bg-white shadow-sm', className)}
      style={style}
    >
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {textLayer && <div ref={text} className="textLayer" />}
      {failed && (
        // The page is paper-white in both themes, so the message uses a fixed dark grey.
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-[#4a4a4a]">
          Page {number} could not be shown.
        </p>
      )}
    </div>
  );
}
