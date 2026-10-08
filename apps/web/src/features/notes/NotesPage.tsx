import type { IndexStatus } from '@skb/core';
import { folderOf, LinkResolver } from '@skb/core/markdown';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { ChevronsDownUp, FilePlus, FileSearch, FolderPlus, Paperclip, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Page } from '../../components/Page';
import { Pane } from '../../components/Pane';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { ApiError } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { onServerEvent } from '../../lib/events';
import { conceptsQuery } from '../concepts/api';
import { recordOpened } from '../search/api';
import { noteQuery, treeQuery } from './api';
import { TrashView } from './dialogs/TrashView';
import { NoteWorkspace } from './NoteWorkspace';
import { useNotesUi } from './notes-store';
import { ancestorsOf, buildTree } from './tree/buildTree';
import { NoteTree } from './tree/NoteTree';
import { useVaultActions } from './useVaultActions';

/**
 * The Notes section (task 3.13): file tree, editor/preview and details in resizable panes. Each pane
 * keeps its header fixed above its own scroll area (the sticky-header rule, ui.md §2).
 */
export function NotesPage() {
  const api = useApi();
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const noteId = typeof params.noteId === 'string' ? params.noteId : undefined;
  const line = typeof search.line === 'number' ? search.line : undefined;

  const tree = useQuery(treeQuery(api));
  const note = useQuery({ ...noteQuery(api, noteId ?? ''), enabled: noteId !== undefined });
  const showAttachments = useNotesUi((state) => state.showAttachments);
  const setShowAttachments = useNotesUi((state) => state.setShowAttachments);
  const expandFolders = useNotesUi((state) => state.expandFolders);
  const collapseAll = useNotesUi((state) => state.collapseAll);
  const indexStatus = useIndexStatus(tree.data?.index);
  const [trashOpen, setTrashOpen] = useState(false);

  const root = useMemo(
    () => (tree.data ? buildTree(tree.data, { attachments: showAttachments }) : null),
    [tree.data, showAttachments],
  );
  const concepts = useQuery(conceptsQuery(api));
  const resolver = useMemo(
    () =>
      new LinkResolver(
        tree.data?.notes ?? [],
        tree.data?.attachments ?? [],
        concepts.data?.concepts ?? [],
      ),
    [tree.data, concepts.data],
  );
  const current = noteId !== undefined && note.data?.id === noteId ? note.data : undefined;
  const activePath = current?.path ?? null;
  const folder = activePath ? folderOf(activePath) : '';
  const actions = useVaultActions(tree.data, activePath);
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'skb-notes-layout',
    storage: localStorage,
  });

  useEffect(() => {
    if (activePath) expandFolders(ancestorsOf(activePath));
  }, [activePath, expandFolders]);

  // Remembered for the quick switcher's "recently opened" list.
  const currentId = current?.id;
  useEffect(() => {
    if (currentId) recordOpened(api, currentId);
  }, [api, currentId]);

  const missing = note.error instanceof ApiError && note.error.status === 404;

  return (
    <Page
      title={current?.title ?? 'Notes'}
      description={current ? current.path : 'Markdown notes stored as files in your vault.'}
      breadcrumbs={
        current
          ? [
              { label: 'Notes', to: '/notes' },
              ...ancestorsOf(current.path).map((path) => ({
                label: path.slice(path.lastIndexOf('/') + 1),
              })),
            ]
          : undefined
      }
      layout="panes"
      actions={
        <Button variant="primary" size="sm" onClick={() => actions.openNewNote(folder)}>
          <FilePlus aria-hidden="true" size={15} />
          New note
        </Button>
      }
    >
      <Group
        orientation="horizontal"
        id="skb-notes-layout"
        className="min-w-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <Panel
          id="notes-files"
          defaultSize="22"
          minSize="12"
          collapsible
          collapsedSize="0"
          className="min-w-0"
        >
          <Pane
            title="Files"
            actions={
              <>
                <IconButton
                  label="New note"
                  size="sm"
                  icon={<FilePlus size={15} />}
                  onClick={() => actions.openNewNote(folder)}
                />
                <IconButton
                  label="New folder"
                  size="sm"
                  icon={<FolderPlus size={15} />}
                  onClick={() => actions.openNewFolder(folder)}
                />
                <IconButton
                  label={showAttachments ? 'Hide attachments' : 'Show attachments'}
                  size="sm"
                  icon={<Paperclip size={15} />}
                  aria-pressed={showAttachments}
                  onClick={() => setShowAttachments(!showAttachments)}
                />
                <IconButton
                  label="Collapse all folders"
                  size="sm"
                  icon={<ChevronsDownUp size={15} />}
                  onClick={collapseAll}
                />
                <IconButton
                  label="Trash"
                  size="sm"
                  icon={<Trash2 size={15} />}
                  onClick={() => setTrashOpen(true)}
                />
              </>
            }
          >
            {tree.isPending && <LoadingState label="Loading notes" />}
            {tree.isError && (
              <ErrorState
                message="The notes could not be loaded."
                onRetry={() => void tree.refetch()}
              />
            )}
            {root && (
              <NoteTree
                root={root}
                activePath={activePath}
                onOpen={actions.open}
                onCreateNote={(path) => actions.openNewNote(path)}
                onCreateFolder={actions.openNewFolder}
                onRename={actions.rename}
                onMove={actions.move}
                onDelete={actions.remove}
                onCopyLink={actions.copyLink}
              />
            )}
            {indexStatus?.state === 'scanning' && (
              <p role="status" className="border-t border-border px-3 py-2 text-xs text-muted">
                Indexing the vault… {indexStatus.processed} of {indexStatus.total}
              </p>
            )}
          </Pane>
        </Panel>
        <Separator className="w-px bg-border outline-none hover:bg-accent focus-visible:bg-focus data-[separator=active]:bg-accent" />
        <Panel id="notes-workspace" minSize="40" className="flex min-w-0">
          {noteId === undefined && (
            <Pane title="Note">
              <EmptyState
                icon={<FileSearch size={22} />}
                title="Open a note"
                description="Choose a note in the file tree, or create a new one. Notes are plain Markdown files you can also edit in other programs."
                action={
                  <Button variant="primary" onClick={() => actions.openNewNote('')}>
                    New note
                  </Button>
                }
              />
            </Pane>
          )}
          {noteId !== undefined && !current && (
            <Pane title="Note">
              {note.isPending && <LoadingState label="Opening note" />}
              {missing && (
                <EmptyState
                  title="This note no longer exists"
                  description="It may have been deleted, or renamed outside the app before it was indexed."
                  action={
                    <Button asChild>
                      <Link to="/notes">Back to notes</Link>
                    </Button>
                  }
                />
              )}
              {note.isError && !missing && (
                <ErrorState
                  message="The note could not be opened."
                  onRetry={() => void note.refetch()}
                />
              )}
            </Pane>
          )}
          {current && (
            <NoteWorkspace
              key={current.id}
              note={current}
              tree={tree.data}
              resolver={resolver}
              line={line}
              onCreateFromLink={actions.createNoteNow}
            />
          )}
        </Panel>
      </Group>
      {actions.elements}
      <TrashView open={trashOpen} onOpenChange={setTrashOpen} />
    </Page>
  );
}

/** Index progress: starts from the tree's snapshot and follows live events while scanning. */
function useIndexStatus(initial: IndexStatus | undefined): IndexStatus | undefined {
  const [live, setLive] = useState<IndexStatus | undefined>(undefined);
  useEffect(
    () =>
      onServerEvent((event) => {
        if (event.type === 'index.status') setLive(event.status);
      }),
    [],
  );
  return live ?? initial;
}
