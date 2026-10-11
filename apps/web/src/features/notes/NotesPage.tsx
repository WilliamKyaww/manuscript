import type { IndexStatus } from '@skb/core';
import { folderOf, LinkResolver } from '@skb/core/markdown';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { FilePlus, PanelRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Group,
  Panel,
  type PanelImperativeHandle,
  Separator,
  useDefaultLayout,
} from 'react-resizable-panels';
import { useShortcut } from '../../app/shortcuts/useShortcuts';
import { Button } from '../../components/Button';
import { IconButton } from '../../components/IconButton';
import { Page } from '../../components/Page';
import { useApi } from '../../lib/api/context';
import { onServerEvent } from '../../lib/events';
import { conceptsQuery } from '../concepts/api';
import { recordOpened } from '../search/api';
import { noteQuery, treeQuery } from './api';
import { TrashView } from './dialogs/TrashView';
import { PrintHost } from './export/PrintHost';
import { FilesPane } from './files/FilesPane';
import { useNotesUi } from './notes-store';
import { ancestorsOf } from './tree/buildTree';
import { useFileActions } from './useFileActions';
import { useCurrentVault } from './vault/current-vault';
import { OpenVaultDialog } from './vault/OpenVaultDialog';
import { DetailsPanel } from './workspace/DetailsPanel';
import { EditorPanes } from './workspace/EditorPanes';
import { useRouteSync } from './workspace/route-sync';
import { POPOUT_WINDOW, selectActiveNoteId, useWorkspace } from './workspace/workspace-store';

/**
 * The Notes section (tasks 3.13, 23.02–23.05): the Files pane, one or two panes of tabbed notes, and
 * the Details panel for the active note, side by side and resizable. Each pane keeps its header
 * fixed above its own scroll area (the sticky-header rule, ui.md §2). A pop-out window shows the
 * note panes only.
 */

const SEPARATOR =
  'w-px bg-border outline-none hover:bg-accent focus-visible:bg-focus data-[separator=active]:bg-accent';

export function NotesPage() {
  const api = useApi();
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const routeNoteId = typeof params.noteId === 'string' ? params.noteId : undefined;
  const line = typeof search.line === 'number' ? search.line : undefined;

  const tree = useQuery(treeQuery(api));
  const indexStatus = useIndexStatus(tree.data?.index);
  const [trashOpen, setTrashOpen] = useState(false);
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

  useRouteSync(routeNoteId);
  const activeNoteId = useWorkspace(selectActiveNoteId);
  const active = useQuery({
    ...noteQuery(api, activeNoteId ?? ''),
    enabled: activeNoteId !== null,
  });
  const current = active.data?.id === activeNoteId ? active.data : undefined;
  const activePath = current?.path ?? null;
  const folder = activePath ? folderOf(activePath) : '';
  const actions = useFileActions(tree.data);
  const vault = useCurrentVault();

  const detailsOpen = useNotesUi((state) => state.detailsOpen);
  const setDetailsOpen = useNotesUi((state) => state.setDetailsOpen);
  const expandFolders = useNotesUi((state) => state.expandFolders);
  const mode = useNotesUi((state) => state.mode);
  const setMode = useNotesUi((state) => state.setMode);
  const revealRequest = useNotesUi((state) => state.revealRequest);
  const files = useRef<PanelImperativeHandle | null>(null);

  const panelIds = [
    ...(POPOUT_WINDOW ? [] : ['notes-files']),
    'notes-workspace',
    ...(detailsOpen ? ['notes-details'] : []),
  ];
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'skb-notes-workspace',
    panelIds,
    storage: localStorage,
  });

  useEffect(() => {
    if (activePath) expandFolders(ancestorsOf(activePath));
  }, [activePath, expandFolders]);
  // "Reveal file in navigation" needs the Files pane open.
  useEffect(() => {
    if (revealRequest && files.current?.isCollapsed()) files.current.expand();
  }, [revealRequest]);

  // Tabs left from another vault, or notes deleted while the app was closed, close on arrival.
  const pruned = useRef(false);
  useEffect(() => {
    if (pruned.current || !tree.data) return;
    pruned.current = true;
    const existing = new Set<string>(tree.data.notes.map((note) => note.id));
    // The note in the address stays, to say if it is gone.
    if (routeNoteId) existing.add(routeNoteId);
    useWorkspace.getState().prune(existing);
  }, [tree.data, routeNoteId]);

  // Remembered for the quick switcher's "recently opened" list.
  const currentId = current?.id;
  useEffect(() => {
    if (currentId) recordOpened(api, currentId);
  }, [api, currentId]);

  useShortcut({
    id: 'notes.reading-view',
    keys: 'mod+e',
    description: 'Switch between reading and editing the note',
    group: 'Editor',
    allowInInputs: true,
    handler: () => setMode(mode === 'preview' ? 'edit' : 'preview'),
  });

  return (
    <Page
      title={current?.title ?? 'Notes'}
      layout="panes"
      density="compact"
      actions={
        <>
          <IconButton
            label={detailsOpen ? 'Hide details' : 'Show details'}
            icon={<PanelRight size={16} />}
            size="sm"
            aria-pressed={detailsOpen}
            onClick={() => setDetailsOpen(!detailsOpen)}
          />
          {!POPOUT_WINDOW && (
            <Button variant="primary" size="sm" onClick={() => actions.openNewNote(folder)}>
              <FilePlus aria-hidden="true" size={15} />
              New note
            </Button>
          )}
        </>
      }
    >
      <Group
        orientation="horizontal"
        id="skb-notes-workspace"
        className="min-w-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        {!POPOUT_WINDOW && (
          <>
            <Panel
              id="notes-files"
              panelRef={files}
              defaultSize="20"
              minSize="12"
              collapsible
              collapsedSize="0"
              className="min-w-0"
            >
              <FilesPane
                tree={tree.data}
                isPending={tree.isPending}
                isError={tree.isError}
                onRetry={() => void tree.refetch()}
                indexStatus={indexStatus}
                activePath={activePath}
                folder={folder}
                actions={actions}
                onOpenTrash={() => setTrashOpen(true)}
              />
            </Panel>
            <Separator className={SEPARATOR} />
          </>
        )}
        <Panel id="notes-workspace" minSize="30" className="flex min-w-0">
          <EditorPanes
            tree={tree.data}
            resolver={resolver}
            actions={actions}
            routeNoteId={routeNoteId}
            line={line}
            vaultName={vault.vault?.name ?? null}
          />
        </Panel>
        {detailsOpen && (
          <>
            <Separator className={SEPARATOR} />
            <Panel id="notes-details" defaultSize="24" minSize="16" className="min-w-0">
              <DetailsPanel />
            </Panel>
          </>
        )}
      </Group>
      {actions.elements}
      <TrashView open={trashOpen} onOpenChange={setTrashOpen} />
      <OpenVaultDialog />
      <PrintHost />
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
