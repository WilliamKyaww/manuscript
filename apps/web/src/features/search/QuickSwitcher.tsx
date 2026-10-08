import { rankCandidates, type SwitcherCandidate } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { Clock, FilePlus, FileText } from 'lucide-react';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import { useEffect, useMemo, useState } from 'react';
import { useLayoutStore } from '../../app/layout-store';
import { Highlighted } from '../../components/Highlighted';
import { Kbd } from '../../components/Kbd';
import { useApi } from '../../lib/api/context';
import { treeQuery, useCreateNote } from '../notes/api';
import { recentQuery } from './api';

/**
 * Quick switcher (Ctrl+O, task 4.06): jump to a note by its name, title or an alias. With nothing
 * typed it lists recently opened notes. Enter opens; Shift+Enter (or the last row) creates a note
 * with the typed name when none matches exactly.
 */

interface NoteCandidate extends SwitcherCandidate {
  folder: string;
}

const itemClasses =
  'flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm text-text select-none data-[selected=true]:bg-surface-hover';

function folderOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function QuickSwitcher() {
  const open = useLayoutStore((state) => state.quickSwitcherOpen);
  const setOpen = useLayoutStore((state) => state.setQuickSwitcherOpen);
  const api = useApi();
  const navigate = useNavigate();
  const tree = useQuery({ ...treeQuery(api), enabled: open });
  const recent = useQuery({ ...recentQuery(api), enabled: open });
  const create = useCreateNote();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const candidates = useMemo<NoteCandidate[]>(
    () =>
      (tree.data?.notes ?? []).map((note) => ({
        id: note.id,
        title: note.title,
        names: [
          note.path.slice(note.path.lastIndexOf('/') + 1).replace(/\.md$/i, ''),
          ...note.aliases,
        ],
        path: note.path,
        folder: folderOf(note.path),
      })),
    [tree.data],
  );
  const recentIds = useMemo(
    () => (recent.data?.items ?? []).map((item) => item.note.id),
    [recent.data],
  );
  const matches = useMemo(
    () => rankCandidates(query, candidates, { limit: 30, recent: recentIds }),
    [query, candidates, recentIds],
  );
  const trimmed = query.trim();
  const exact = matches.some((match) => match.score >= 1000);
  const canCreate = trimmed !== '' && !exact;

  const openNote = (id: string) => {
    setOpen(false);
    void navigate({ to: '/notes/$noteId', params: { noteId: id } });
  };
  const createNote = () => {
    if (!trimmed) return;
    create.mutate(
      { title: trimmed },
      {
        onSuccess: (note) => openNote(note.id),
      },
    );
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content
          aria-describedby={undefined}
          data-quick-switcher
          className="fixed top-[14vh] left-1/2 z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg"
        >
          <VisuallyHidden.Root>
            <RadixDialog.Title>Open a note</RadixDialog.Title>
          </VisuallyHidden.Root>
          <Command
            label="Open a note"
            shouldFilter={false}
            loop
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.shiftKey && canCreate) {
                event.preventDefault();
                createNote();
              }
            }}
          >
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Type a note's name…"
              className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-text outline-none placeholder:text-subtle"
            />
            <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
              {tree.isPending && <Command.Loading>Loading notes…</Command.Loading>}
              {!tree.isPending && matches.length === 0 && !canCreate && (
                <p className="px-3 py-6 text-center text-sm text-muted">
                  {trimmed
                    ? 'No matching notes.'
                    : 'Notes you open appear here. Start typing to find any note.'}
                </p>
              )}
              {matches.length > 0 && (
                <Command.Group
                  heading={trimmed ? 'Notes' : 'Recently opened'}
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-subtle"
                >
                  {matches.map((match) => {
                    const note = match.candidate;
                    const viaOtherName = match.label !== note.title;
                    return (
                      <Command.Item
                        key={note.id}
                        value={note.id}
                        onSelect={() => openNote(note.id)}
                        className={itemClasses}
                      >
                        {trimmed ? (
                          <FileText aria-hidden="true" size={16} className="shrink-0 text-muted" />
                        ) : (
                          <Clock aria-hidden="true" size={16} className="shrink-0 text-muted" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            <Highlighted text={match.label} ranges={match.ranges} />
                            {viaOtherName && <span className="text-muted"> → {note.title}</span>}
                          </span>
                          {note.folder && (
                            <span className="block truncate text-xs text-muted">{note.folder}</span>
                          )}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              )}
              {canCreate && (
                <Command.Item value="create-note" onSelect={createNote} className={itemClasses}>
                  <FilePlus aria-hidden="true" size={16} className="shrink-0 text-muted" />
                  <span className="flex-1">Create note “{trimmed}”</span>
                  <span className="flex gap-1 text-xs text-muted">
                    <Kbd>Shift</Kbd>
                    <Kbd>Enter</Kbd>
                  </span>
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
