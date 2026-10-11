import { lazy, Suspense, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { create } from 'zustand';
import { desktopBridge } from '../../../lib/desktop';
import { notifyError } from '../../../lib/notify';
import type { PreviewTarget } from '../preview/remark-obsidian';

/**
 * "Export to PDF…" (task 23.08): the note is rendered once more, as the reading view shows it, in a
 * print-only copy in the light theme. The desktop app prints that page to a PDF file the student
 * chooses; a browser opens its print dialogue, where "Save as PDF" is one of the printers.
 */

export interface PrintJob {
  noteId: string;
  title: string;
  content: string;
  resolve(target: string): PreviewTarget;
}

export const usePrintJob = create<{
  job: PrintJob | null;
  start(job: PrintJob): void;
  done(): void;
}>((set) => ({
  job: null,
  start: (job) => set({ job }),
  done: () => set({ job: null }),
}));

export function exportToPdf(job: PrintJob): void {
  usePrintJob.getState().start(job);
}

const MarkdownPreview = lazy(() =>
  import('../preview/MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })),
);

/** Time for diagrams and maths to finish drawing after the preview has rendered. */
const SETTLE_MS = 400;

function Printer({ job }: { job: PrintJob }) {
  const done = usePrintJob((state) => state.done);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    document.body.classList.add('skb-printing');
    let cancelled = false;
    const finish = () => {
      document.body.classList.remove('skb-printing');
      done();
    };
    const run = async () => {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      await document.fonts?.ready;
      if (cancelled) return;
      const bridge = desktopBridge();
      if (bridge) {
        try {
          const saved = await bridge.printToPdf({ title: job.title });
          if (saved)
            toast.success('Saved as PDF', {
              description: saved,
              action: {
                label: 'Show in folder',
                onClick: () => void bridge.revealInExplorer(saved),
              },
            });
        } catch (error) {
          notifyError(error);
        }
        finish();
      } else {
        window.addEventListener('afterprint', finish, { once: true });
        window.print();
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [done, job]);

  return (
    <article>
      <h1 className="mb-4 text-2xl font-semibold">{job.title}</h1>
      <Suspense fallback={null}>
        <MarkdownPreview content={job.content} resolve={job.resolve} noteId={job.noteId} />
      </Suspense>
    </article>
  );
}

/** Rendered once on the Notes page; holds the print-only copy while a job runs. */
export function PrintHost() {
  const job = usePrintJob((state) => state.job);
  if (!job) return null;
  return createPortal(
    <div id="skb-print-root" data-theme="light" aria-hidden="true">
      <Printer key={job.noteId + job.title} job={job} />
    </div>,
    document.body,
  );
}
