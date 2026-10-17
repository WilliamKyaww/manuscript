import type { IndexStatus, NoteTree as NoteTreeData } from '@skb/core';
import {
  ArrowUpDown,
  ChevronsDownUp,
  ChevronsUpDown,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../../components/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '../../../components/DropdownMenu';
import { IconButton } from '../../../components/IconButton';
import { MenuEntries } from '../../../components/MenuEntries';
import { Pane } from '../../../components/Pane';
import { ErrorState, LoadingState } from '../../../components/States';
import { treeMenu } from '../menus/file-menu';
import { useNotesUi } from '../notes-store';
import { buildTree, SORT_ORDERS, type SortOrder } from '../tree/buildTree';
import { NoteTree } from '../tree/NoteTree';
import type { FileActions } from '../useFileActions';
import { useVaultDialog } from '../vault/OpenVaultDialog';
import { VaultSwitcher } from '../vault/VaultSwitcher';
import { Bookmarks } from './Bookmarks';

/**
 * The Files pane (tasks 3.13, 23.02–23.03): Obsidian's toolbar — new note, new folder, sort order,
 * attachments, expand or collapse all — then bookmarks, the tree, and the open vault at the foot.
 */
export function FilesPane({
  tree,
  isPending,
  isError,
  onRetry,
  indexStatus,
  activePath,
  folder,
  actions,
  onOpenTrash,
}: {
  tree: NoteTreeData | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry(): void;
  indexStatus: IndexStatus | undefined;
  activePath: string | null;
  /** Where "New note" creates a note: the active note's folder. */
  folder: string;
  actions: FileActions;
  onOpenTrash(): void;
}) {
  const showAttachments = useNotesUi((state) => state.showAttachments);
  const setShowAttachments = useNotesUi((state) => state.setShowAttachments);
  const sort = useNotesUi((state) => state.sort);
  const setSort = useNotesUi((state) => state.setSort);
  const expanded = useNotesUi((state) => state.expanded);
  const expandFolders = useNotesUi((state) => state.expandFolders);
  const collapseAll = useNotesUi((state) => state.collapseAll);

  const root = useMemo(
    () => (tree ? buildTree(tree, { attachments: showAttachments, sort }) : null),
    [tree, showAttachments, sort],
  );
  // As in Obsidian: "Collapse all" while any folder is open, "Expand all" once none is.
  const folders = tree?.folders ?? [];
  const anyOpen = folders.some((path) => expanded.has(path));
  const empty =
    tree !== undefined &&
    tree.notes.length === 0 &&
    tree.folders.length === 0 &&
    tree.attachments.length === 0;
  const hasAttachments = (tree?.attachments.length ?? 0) > 0;

  return (
    <Pane
      title="Files"
      // As in Obsidian, the toolbar is the header; the name is for assistive technology.
      hideTitle
      // Simplified UI: on the sidebar's surface, so the change of surface separates it from the note.
      className="simplified:bg-surface"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Change sort order" size="sm" icon={<ArrowUpDown size={15} />} />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-56">
              <MenuEntries
                as="dropdown"
                entries={[
                  {
                    kind: 'radio',
                    label: 'Sort by',
                    value: sort,
                    options: SORT_ORDERS.slice(0, 2),
                    onValueChange: (value) => setSort(value as SortOrder),
                  },
                  { kind: 'separator' },
                  {
                    kind: 'radio',
                    value: sort,
                    options: SORT_ORDERS.slice(2, 4),
                    onValueChange: (value) => setSort(value as SortOrder),
                  },
                  { kind: 'separator' },
                  {
                    kind: 'radio',
                    value: sort,
                    options: SORT_ORDERS.slice(4),
                    onValueChange: (value) => setSort(value as SortOrder),
                  },
                ]}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <IconButton
            label={showAttachments ? 'Hide attachments' : 'Show attachments'}
            size="sm"
            icon={<Paperclip size={15} />}
            aria-pressed={showAttachments}
            disabled={!hasAttachments && !showAttachments}
            onClick={() => setShowAttachments(!showAttachments)}
          />
          <IconButton
            label={anyOpen ? 'Collapse all' : 'Expand all'}
            size="sm"
            icon={anyOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
            disabled={folders.length === 0}
            onClick={() => (anyOpen ? collapseAll() : expandFolders(folders))}
          />
          <IconButton label="Trash" size="sm" icon={<Trash2 size={15} />} onClick={onOpenTrash} />
        </>
      }
      footer={
        <>
          {indexStatus?.state === 'scanning' && (
            <p role="status" className="border-t border-chrome-line px-3 py-2 text-xs text-muted">
              Indexing the vault… {indexStatus.processed} of {indexStatus.total}
            </p>
          )}
          <VaultSwitcher />
        </>
      }
    >
      {isPending && <LoadingState label="Loading notes" />}
      {isError && <ErrorState message="The notes could not be loaded." onRetry={onRetry} />}
      {tree && <Bookmarks tree={tree} actions={actions} />}
      {empty && (
        <div className="space-y-3 px-3 py-4 text-sm">
          <p className="text-muted">No notes or folders yet.</p>
          <div className="flex flex-col gap-1.5">
            <Button size="sm" variant="primary" onClick={() => actions.openNewNote('')}>
              <FilePlus aria-hidden="true" size={14} />
              New note
            </Button>
            <Button size="sm" onClick={() => useVaultDialog.getState().setOpen(true)}>
              <FolderOpen aria-hidden="true" size={14} />
              Open another vault…
            </Button>
          </div>
        </div>
      )}
      {root && !empty && (
        <NoteTree
          root={root}
          activePath={activePath}
          onOpen={actions.open}
          onOpenInNewTab={actions.openInNewTab}
          onRename={actions.rename}
          onMove={actions.move}
          onDelete={actions.remove}
          menuFor={(node, startRename) => treeMenu(node, actions, startRename)}
        />
      )}
    </Pane>
  );
}
