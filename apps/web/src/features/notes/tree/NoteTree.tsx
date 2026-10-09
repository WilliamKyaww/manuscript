import {
  ChevronRight,
  Copy,
  ExternalLink,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Paperclip,
  Pencil,
  Trash2,
} from 'lucide-react';
import { type DragEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../../../components/ContextMenu';
import { cn } from '../../../lib/cn';
import { useNotesUi } from '../notes-store';
import {
  type FolderNode,
  parentOf,
  type TreeNode,
  type VisibleNode,
  visibleNodes,
} from './buildTree';

/**
 * Accessible file tree (WAI-ARIA tree pattern, flat rows with aria-level). Keyboard: arrows move and
 * open/close folders, Home/End jump, Enter opens, F2 renames, Delete moves to the trash, typing jumps
 * to a matching name; Shift+F10 or the Menu key opens the context menu. Rows can be dragged onto
 * folders (or the empty area, for the vault root).
 */

export interface NoteTreeActions {
  onOpen(node: TreeNode): void;
  onCreateNote(folder: string): void;
  onCreateFolder(parent: string): void;
  /** `name` is the new file name (without `.md` for notes). */
  onRename(node: TreeNode, name: string): void;
  onMove(node: TreeNode, folder: string): void;
  onDelete(node: TreeNode): void;
  onCopyLink(node: TreeNode): void;
}

export interface NoteTreeProps extends NoteTreeActions {
  root: FolderNode;
  /** Path of the note open in the editor. */
  activePath: string | null;
}

const DRAG_TYPE = 'application/x-skb-vault-path';

function iconFor(node: TreeNode, expanded: boolean) {
  if (node.kind === 'folder') return expanded ? <FolderOpen size={15} /> : <Folder size={15} />;
  if (node.kind === 'attachment') return <Paperclip size={15} />;
  return <FileText size={15} />;
}

export function NoteTree({ root, activePath, ...actions }: NoteTreeProps) {
  const expanded = useNotesUi((state) => state.expanded);
  const toggleFolder = useNotesUi((state) => state.toggleFolder);
  const rows = useMemo(() => visibleNodes(root, expanded), [root, expanded]);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<TreeNode | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const typeAhead = useRef({ text: '', at: 0 });

  const byPath = useMemo(() => new Map(rows.map((row) => [row.node.path, row])), [rows]);
  // Keep a valid roving focus target: the focused row, else the active note, else the first row.
  const tabStop =
    (focusedPath && byPath.has(focusedPath) && focusedPath) ||
    (activePath && byPath.has(activePath) && activePath) ||
    rows[0]?.node.path ||
    null;

  const focusRow = (path: string | undefined) => {
    if (!path) return;
    setFocusedPath(path);
    requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`)
        ?.focus();
    });
  };

  useEffect(() => {
    if (renaming && !byPath.has(renaming)) setRenaming(null);
  }, [renaming, byPath]);

  const activate = (node: TreeNode) => {
    if (node.kind === 'folder') toggleFolder(node.path);
    else actions.onOpen(node);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, row: VisibleNode) => {
    if (renaming) return;
    const index = rows.indexOf(row);
    const { node } = row;
    const isOpenFolder = node.kind === 'folder' && expanded.has(node.path);
    switch (event.key) {
      case 'ArrowDown':
        focusRow(rows[index + 1]?.node.path);
        break;
      case 'ArrowUp':
        focusRow(rows[index - 1]?.node.path);
        break;
      case 'Home':
        focusRow(rows[0]?.node.path);
        break;
      case 'End':
        focusRow(rows.at(-1)?.node.path);
        break;
      case 'ArrowRight':
        if (node.kind !== 'folder') return;
        if (!isOpenFolder) toggleFolder(node.path);
        else if (node.children.length > 0) focusRow(rows[index + 1]?.node.path);
        break;
      case 'ArrowLeft':
        if (isOpenFolder) toggleFolder(node.path);
        else if (parentOf(node.path) !== '') focusRow(parentOf(node.path));
        break;
      case 'Enter':
        activate(node);
        break;
      case 'F2':
        setRenaming(node.path);
        break;
      case 'Delete':
        actions.onDelete(node);
        break;
      default: {
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const now = Date.now();
        const text =
          (now - typeAhead.current.at < 600 ? typeAhead.current.text : '') +
          event.key.toLowerCase();
        typeAhead.current = { text, at: now };
        const ordered = [
          ...rows.slice(index + (text.length === 1 ? 1 : 0)),
          ...rows.slice(0, index),
        ];
        focusRow(
          ordered.find((candidate) => candidate.node.name.toLowerCase().startsWith(text))?.node
            .path,
        );
      }
    }
    event.preventDefault();
  };

  const canDrop = (event: DragEvent, folder: string) => {
    const from = draggedPath(event);
    return (
      from !== null &&
      from !== folder &&
      parentOf(from) !== folder &&
      !folder.startsWith(`${from}/`)
    );
  };
  const draggedPath = (event: DragEvent): string | null =>
    event.dataTransfer.types.includes(DRAG_TYPE) ? (dragging.current ?? null) : null;
  const dragging = useRef<string | null>(null);

  const dropProps = (folder: string) => ({
    onDragOver: (event: DragEvent) => {
      if (!canDrop(event, folder)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(folder);
    },
    onDragLeave: () => setDropTarget((current) => (current === folder ? null : current)),
    onDrop: (event: DragEvent) => {
      const from = draggedPath(event);
      setDropTarget(null);
      if (!from || !canDrop(event, folder)) return;
      event.preventDefault();
      event.stopPropagation();
      const row = byPath.get(from);
      if (row) actions.onMove(row.node, folder);
    },
  });

  const menuFolder = menuTarget
    ? menuTarget.kind === 'folder'
      ? menuTarget.path
      : parentOf(menuTarget.path)
    : '';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {rows.length === 0 ? (
          // A tree must contain tree items, so an empty vault is just its message (which still
          // opens the menu with New note and New folder).
          <p className="min-h-full px-3 py-3 text-sm text-muted">This vault has no notes yet.</p>
        ) : (
          <div
            ref={containerRef}
            role="tree"
            aria-label="Notes and folders"
            className={cn('min-h-full py-1 text-sm', dropTarget === '' && 'bg-accent-subtle')}
            onContextMenu={(event) => {
              const path = (event.target as HTMLElement).closest<HTMLElement>('[data-path]')
                ?.dataset.path;
              setMenuTarget((path && byPath.get(path)?.node) || null);
            }}
            {...dropProps('')}
          >
            {rows.map((row) => {
              const { node, depth } = row;
              const isFolder = node.kind === 'folder';
              const isOpen = isFolder && expanded.has(node.path);
              const isActive = node.path === activePath;
              return (
                <div
                  key={node.path}
                  role="treeitem"
                  data-path={node.path}
                  aria-level={depth}
                  aria-posinset={row.position}
                  aria-setsize={row.siblings}
                  aria-expanded={isFolder ? isOpen : undefined}
                  aria-selected={isActive}
                  aria-label={
                    node.kind === 'note' && node.title !== node.name
                      ? `${node.name} (${node.title})`
                      : node.name
                  }
                  tabIndex={node.path === tabStop ? 0 : -1}
                  draggable={renaming !== node.path}
                  onDragStart={(event) => {
                    dragging.current = node.path;
                    event.dataTransfer.setData(DRAG_TYPE, node.path);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    dragging.current = null;
                    setDropTarget(null);
                  }}
                  {...(isFolder ? dropProps(node.path) : {})}
                  onFocus={() => setFocusedPath(node.path)}
                  onClick={() => {
                    setFocusedPath(node.path);
                    activate(node);
                  }}
                  onKeyDown={(event) => onKeyDown(event, row)}
                  className={cn(
                    'flex h-7 cursor-default items-center gap-1.5 pr-2 outline-none select-none',
                    'hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
                    isActive && 'bg-accent-subtle font-medium text-text',
                    dropTarget === node.path && 'bg-accent-subtle ring-1 ring-accent ring-inset',
                  )}
                  style={{ paddingLeft: `${(depth - 1) * 14 + 6}px` }}
                >
                  <ChevronRight
                    aria-hidden="true"
                    size={14}
                    className={cn(
                      'shrink-0 text-subtle transition-transform',
                      !isFolder && 'invisible',
                      isOpen && 'rotate-90',
                    )}
                  />
                  <span aria-hidden="true" className="flex shrink-0 text-muted">
                    {iconFor(node, isOpen)}
                  </span>
                  {renaming === node.path ? (
                    <RenameInput
                      initial={node.name}
                      onDone={(name) => {
                        setRenaming(null);
                        focusRow(node.path);
                        if (name && name !== node.name) actions.onRename(node, name);
                      }}
                    />
                  ) : (
                    <span className="truncate">{node.name}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {(menuTarget === null || menuTarget.kind === 'folder') && (
          <>
            <ContextMenuItem
              icon={<FilePlus size={15} />}
              onSelect={() => actions.onCreateNote(menuFolder)}
            >
              New note{menuTarget ? ' here' : ''}
            </ContextMenuItem>
            <ContextMenuItem
              icon={<FolderPlus size={15} />}
              onSelect={() => actions.onCreateFolder(menuFolder)}
            >
              New folder{menuTarget ? ' here' : ''}
            </ContextMenuItem>
          </>
        )}
        {menuTarget && menuTarget.kind !== 'folder' && (
          <ContextMenuItem
            icon={<ExternalLink size={15} />}
            onSelect={() => actions.onOpen(menuTarget)}
          >
            Open
          </ContextMenuItem>
        )}
        {menuTarget && (
          <>
            {menuTarget.kind !== 'folder' && (
              <ContextMenuItem
                icon={<Copy size={15} />}
                onSelect={() => actions.onCopyLink(menuTarget)}
              >
                {menuTarget.kind === 'note' ? 'Copy link' : 'Copy embed'}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              icon={<Pencil size={15} />}
              shortcut="F2"
              onSelect={() => setRenaming(menuTarget.path)}
            >
              Rename
            </ContextMenuItem>
            <ContextMenuItem
              icon={<Trash2 size={15} />}
              tone="danger"
              shortcut="Del"
              onSelect={() => actions.onDelete(menuTarget)}
            >
              Move to trash
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone(name: string | null): void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name?.trim() || null);
  };
  return (
    <input
      ref={ref}
      aria-label="New name"
      defaultValue={initial}
      className="min-w-0 flex-1 rounded-sm border border-accent bg-surface px-1 text-sm outline-none"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') finish(event.currentTarget.value);
        if (event.key === 'Escape') finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}
