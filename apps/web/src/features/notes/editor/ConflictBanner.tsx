import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { cn } from '../../../lib/cn';
import { type DiffLine, diffLines } from '../../../lib/diff';
import { notifyError } from '../../../lib/notify';
import type { Conflict } from './useNoteSession';

/**
 * Shown when the note changed (or disappeared) on disk while it had unsaved edits here. Nothing is
 * overwritten until the user chooses: reload the version on disk, keep theirs, or compare first.
 */
export function ConflictBanner({
  conflict,
  onReload,
  onKeepMine,
  onRecreate,
  loadTheirs,
  mine,
}: {
  conflict: NonNullable<Conflict>;
  onReload(): Promise<void>;
  onKeepMine(): Promise<void>;
  onRecreate(): void;
  loadTheirs(): Promise<{ content: string }>;
  mine(): string;
}) {
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<DiffLine[] | null>(null);
  const run = (action: () => Promise<void>) => {
    setBusy(true);
    action()
      .catch(notifyError)
      .finally(() => {
        setBusy(false);
        setDiff(null);
      });
  };

  if (conflict.kind === 'deleted') {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 border-b border-border bg-danger-subtle px-4 py-2 text-sm"
      >
        <TriangleAlert aria-hidden="true" size={16} className="text-danger" />
        <span className="flex-1">
          This note was deleted or moved outside the app. Your text is still here.
        </span>
        <Button size="sm" variant="primary" onClick={onRecreate}>
          Save as a new note
        </Button>
      </div>
    );
  }

  return (
    <>
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 border-b border-border bg-warning-subtle px-4 py-2 text-sm"
      >
        <TriangleAlert aria-hidden="true" size={16} className="text-warning" />
        <span className="flex-1">
          This note was changed outside the editor. Your unsaved changes have not been saved.
        </span>
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            loadTheirs()
              .then((theirs) => setDiff(diffLines(theirs.content, mine())))
              .catch(notifyError)
          }
        >
          Compare
        </Button>
        <Button size="sm" disabled={busy} onClick={() => run(onReload)}>
          Reload from disk
        </Button>
        <Button size="sm" variant="primary" loading={busy} onClick={() => run(onKeepMine)}>
          Keep my version
        </Button>
      </div>
      <Dialog
        open={diff !== null}
        onOpenChange={(open) => !open && setDiff(null)}
        title="Compare versions"
        description="Lines marked − are only on disk; lines marked + are only in your version."
        size="lg"
        footer={
          <>
            <Button onClick={() => run(onReload)}>Use the version on disk</Button>
            <Button variant="primary" onClick={() => run(onKeepMine)}>
              Keep my version
            </Button>
          </>
        }
      >
        <pre className="max-h-[50vh] overflow-auto rounded-md border border-border bg-surface-sunken p-2 font-mono text-xs leading-relaxed">
          {diff?.map((line, index) => (
            <div
              // Lines have no identity beyond their position in this read-only diff.
              // biome-ignore lint/suspicious/noArrayIndexKey: static list, never reordered.
              key={index}
              className={cn(
                line.kind === 'added' && 'bg-success-subtle',
                line.kind === 'removed' && 'bg-danger-subtle',
              )}
            >
              <span aria-hidden="true" className="select-none text-muted">
                {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
              </span>
              <span className="sr-only">
                {line.kind === 'added'
                  ? 'Only in yours: '
                  : line.kind === 'removed'
                    ? 'Only on disk: '
                    : ''}
              </span>
              {line.text || ' '}
            </div>
          ))}
        </pre>
      </Dialog>
    </>
  );
}
