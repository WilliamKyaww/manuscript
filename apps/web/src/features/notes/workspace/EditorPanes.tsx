import type { NoteTree } from '@skb/core';
import type { LinkResolver } from '@skb/core/markdown';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Button } from '../../../components/Button';
import { EmptyState, ErrorState, LoadingState } from '../../../components/States';
import { ApiError } from '../../../lib/api/client';
import { useApi } from '../../../lib/api/context';
import { noteQuery } from '../api';
import { NoteWorkspace } from '../NoteWorkspace';
import { baseName } from '../tree/buildTree';
import type { FileActions } from '../useFileActions';
import { useVaultDialog } from '../vault/OpenVaultDialog';
import { EmptyTab } from './EmptyTab';
import { TabBar } from './TabBar';
import {
  activeTabOf,
  useWorkspace,
  type WorkspacePane,
  type WorkspaceTab,
} from './workspace-store';

/**
 * The note panes (task 23.04): one, or two side by side or one above the other, each with its tab
 * bar and the note of its active tab. Only the active tab of each pane is mounted; a tab that closes
 * saves what was typed in it as it goes (useNoteSession).
 */

interface Shared {
  tree: NoteTree | undefined;
  resolver: LinkResolver;
  actions: FileActions;
  /** The note and line in the address, for the active pane. */
  routeNoteId: string | undefined;
  line: number | undefined;
  vaultName: string | null;
  /** The page's own actions, at the end of the top-right tab row (Simplified UI). */
  trailing?: ReactNode;
}

const SEPARATOR =
  'bg-divider outline-none hover:bg-accent focus-visible:bg-focus data-[separator=active]:bg-accent';

export function EditorPanes(props: Shared) {
  const panes = useWorkspace((state) => state.panes);
  const direction = useWorkspace((state) => state.direction);
  const activePane = useWorkspace((state) => state.activePane);
  const { tree } = props;
  const files = useMemo(
    () => new Map<string, string>((tree?.notes ?? []).map((note) => [note.id, note.path])),
    [tree],
  );
  const titleOf = (tab: WorkspaceTab) => {
    if (tab.noteId === null) return { title: 'New tab', path: null };
    const path = files.get(tab.noteId);
    return path
      ? { title: baseName(path).replace(/\.md$/i, ''), path }
      : { title: 'Opening…', path: null };
  };

  const [first, second] = panes;
  if (!first) return null;
  if (!second)
    return (
      <EditorPane
        {...props}
        pane={first}
        active
        multiple={false}
        label="Open notes"
        titleOf={titleOf}
        trailing={props.trailing}
      />
    );
  return (
    <Group
      orientation={direction === 'right' ? 'horizontal' : 'vertical'}
      id={`skb-panes-${direction}`}
      className="min-h-0 min-w-0 flex-1"
    >
      <Panel id="pane-first" minSize="20" className="flex min-h-0 min-w-0">
        <EditorPane
          {...props}
          pane={first}
          active={activePane === first.id}
          multiple
          label="Open notes in the first pane"
          titleOf={titleOf}
          trailing={direction === 'down' ? props.trailing : undefined}
        />
      </Panel>
      <Separator className={direction === 'right' ? `w-px ${SEPARATOR}` : `h-px ${SEPARATOR}`} />
      <Panel id="pane-second" minSize="20" className="flex min-h-0 min-w-0">
        <EditorPane
          {...props}
          pane={second}
          active={activePane === second.id}
          multiple
          label={
            direction === 'right'
              ? 'Open notes in the pane on the right'
              : 'Open notes in the pane below'
          }
          titleOf={titleOf}
          trailing={direction === 'right' ? props.trailing : undefined}
        />
      </Panel>
    </Group>
  );
}

function EditorPane({
  pane,
  active,
  multiple,
  label,
  titleOf,
  trailing,
  ...shared
}: Shared & {
  pane: WorkspacePane;
  active: boolean;
  multiple: boolean;
  label: string;
  titleOf(tab: WorkspaceTab): { title: string; path: string | null };
}) {
  const tab = activeTabOf(pane);
  const close = () => useWorkspace.getState().closeTab(pane.id, tab.id);
  const panesCount = useWorkspace((state) => state.panes.length);
  return (
    <div data-editor-pane data-active={active} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <TabBar
        pane={pane}
        active={active && multiple}
        titleOf={titleOf}
        paneLabel={label}
        trailing={trailing}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        {tab.noteId ? (
          <NoteTab
            key={tab.noteId}
            noteId={tab.noteId}
            paneId={pane.id}
            active={active}
            onClose={close}
            {...shared}
            line={active && shared.routeNoteId === tab.noteId ? shared.line : undefined}
          />
        ) : (
          <div
            className="flex min-h-0 min-w-0 flex-1 overflow-y-auto"
            onPointerDownCapture={() => useWorkspace.getState().focusPane(pane.id)}
          >
            <EmptyTab
              vaultName={shared.vaultName}
              vaultEmpty={shared.tree !== undefined && shared.tree.notes.length === 0}
              canClose={pane.tabs.length > 1 || panesCount > 1}
              onNewNote={() => shared.actions.openNewNote('')}
              onOpenVault={() => useVaultDialog.getState().setOpen(true)}
              onClose={close}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function NoteTab({
  noteId,
  paneId,
  active,
  onClose,
  tree,
  resolver,
  actions,
  line,
}: Shared & { noteId: string; paneId: string; active: boolean; onClose(): void }) {
  const api = useApi();
  const note = useQuery(noteQuery(api, noteId));
  const missing = note.error instanceof ApiError && note.error.status === 404;
  if (note.data)
    return (
      <NoteWorkspace
        key={note.data.id}
        note={note.data}
        tree={tree}
        resolver={resolver}
        line={line}
        onCreateFromLink={actions.createNoteNow}
        actions={actions}
        paneId={paneId}
        active={active}
      />
    );
  return (
    <div className="flex-1 overflow-y-auto">
      {note.isPending && (
        <div className="p-6">
          <LoadingState label="Opening note" />
        </div>
      )}
      {missing && (
        <EmptyState
          title="This note no longer exists"
          description="It may have been deleted, or renamed outside the app before it was indexed."
          action={<Button onClick={onClose}>Close this tab</Button>}
        />
      )}
      {note.isError && !missing && (
        <ErrorState message="The note could not be opened." onRetry={() => void note.refetch()} />
      )}
    </div>
  );
}
