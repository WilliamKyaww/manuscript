import type { NoteVersion } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { EmptyState, ErrorState, LoadingState } from '../../../components/States';
import { useApi } from '../../../lib/api/context';
import { cn } from '../../../lib/cn';
import { diffLines } from '../../../lib/diff';
import { noteQuery } from '../api';
import { versionQuery, versionsQuery } from '../files-api';

/**
 * "Open version history" (task 23.07): the kept versions of a note, newest first; each can be read
 * whole or as its changes against the note as it is now, and restored (which keeps the current
 * text as a version first, so a restore can itself be undone).
 */

const REASONS: Record<NoteVersion['reason'], string> = {
  save: 'Before a save',
  merge: 'Before a merge into it',
  restore: 'Before a restore',
};

const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function VersionHistoryDialog({
  noteId,
  title,
  onClose,
  onRestore,
  restoring,
}: {
  noteId: string | null;
  title: string;
  onClose(): void;
  onRestore(content: string): void;
  restoring: boolean;
}) {
  const api = useApi();
  const open = noteId !== null;
  const list = useQuery({ ...versionsQuery(api, noteId ?? ''), enabled: open });
  const current = useQuery({ ...noteQuery(api, noteId ?? ''), enabled: open });
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'text' | 'changes'>('text');
  const versions = list.data?.versions ?? [];
  const chosen = selected ?? versions[0]?.id ?? null;
  const version = useQuery({
    ...versionQuery(api, noteId ?? '', chosen ?? ''),
    enabled: open && chosen !== null,
  });

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setView('text');
    }
  }, [open]);

  const diff = useMemo(
    () =>
      view === 'changes' && version.data && current.data
        ? diffLines(version.data.content, current.data.content.replace(/^﻿/, ''))
        : null,
    [view, version.data, current.data],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={`Version history of “${title}”`}
      description={`A version is kept when a save replaces the text (at most every five minutes), for ${list.data?.retentionDays ?? 30} days.`}
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            disabled={!version.data}
            loading={restoring}
            onClick={() => version.data && onRestore(version.data.content)}
          >
            Restore this version
          </Button>
        </>
      }
    >
      {list.isPending && <LoadingState label="Loading versions" />}
      {list.isError && (
        <ErrorState message="The versions could not be loaded." onRetry={() => list.refetch()} />
      )}
      {list.isSuccess && versions.length === 0 && (
        <EmptyState
          title="No earlier versions yet"
          description="Versions are kept from the first time the note is saved in Manuscript; edits made in other programs are not kept."
        />
      )}
      {versions.length > 0 && (
        <div className="grid min-h-0 gap-3 sm:grid-cols-[13rem_1fr]">
          <ul aria-label="Versions" className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {versions.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-pressed={entry.id === chosen}
                  onClick={() => setSelected(entry.id)}
                  className={cn(
                    'w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-hover',
                    entry.id === chosen && 'bg-accent-subtle font-medium',
                  )}
                >
                  <span className="block">{when.format(new Date(entry.savedAt))}</span>
                  <span className="block text-xs text-muted">
                    {REASONS[entry.reason]} · {formatSize(entry.sizeBytes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-w-0 space-y-2">
            <fieldset className="flex gap-1">
              <legend className="sr-only">Show</legend>
              {(
                [
                  ['text', 'This version'],
                  ['changes', 'Changes since'],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={view === value ? 'secondary' : 'ghost'}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </Button>
              ))}
            </fieldset>
            {version.isPending && <LoadingState label="Loading the version" />}
            {version.data && (
              <section
                data-scroll-region
                // biome-ignore lint/a11y/noNoninteractiveTabindex: the text scrolls, so it must be reachable by keyboard.
                tabIndex={0}
                aria-label={
                  view === 'text' ? 'The text of this version' : 'Changes since this version'
                }
                className="max-h-[50vh] overflow-auto rounded-md border border-border bg-surface-sunken"
              >
                <pre className="p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {view === 'text'
                    ? version.data.content || ' '
                    : diff?.map((line, index) => (
                        <div
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
                              ? 'Added since: '
                              : line.kind === 'removed'
                                ? 'Only in this version: '
                                : ''}
                          </span>
                          {line.text || ' '}
                        </div>
                      ))}
                </pre>
              </section>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
