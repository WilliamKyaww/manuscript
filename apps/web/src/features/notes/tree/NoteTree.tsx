import { ChevronRight, FileText, Folder, FolderOpen, Paperclip } from 'lucide-react';
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../../../components/ContextMenu';
import { MenuEntries, type MenuEntry } from '../../../components/MenuEntries';
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
 * folders (or the empty area, for the vault root). Ctrl+click (⌘+click) or a middle click opens a
 * note in a new tab (task 23.09).
 */

export interface NoteTreeActions {
  onOpen(node: TreeNode): void;
  onOpenInNewTab(node: TreeNode): void;
  /** `name` is the new file name (without `.md` for notes). */
  onRename(node: TreeNode, name: string): void;
  onMove(node: TreeNode, folder: string): void;
  onDelete(node: TreeNode): void;
  /** The right-click menu for a row (or for the empty area, with `null`). */
  menuFor(node: TreeNode | null, startRename: () => void): MenuEntry[];
}

export interface NoteTreeProps extends NoteTreeActions {
  root: FolderNode;
  /** Path of the note open in the editor. */
  activePath: string | null;
}

const DRAG_TYPE = 'application/x-skb-vault-path';

/** "diagram.png" → "diagram" and "png" (no extension for "README" or ".hidden"). */
const stem = (name: string) =>
  name.lastIndexOf('.') > 0 ? name.slice(0, name.lastIndexOf('.')) : name;
const extension = (name: string) =>
  name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.') + 1) : '';

function iconFor(node: TreeNode, expanded: boolean) {
  if (node.kind === 'folder') return expanded ? <FolderOpen size={15} /> : <Folder size={15} />;
  if (node.kind === 'attachment') return <Paperclip size={15} />;
  return <FileText size={15} />;
}

export function NoteTree({ root, activePath, ...actions }: NoteTreeProps) {
  const expanded = useNotesUi((state) => state.expanded);
  const toggleFolder = useNotesUi((state) => state.toggleFolder);
  const revealRequest = useNotesUi((state) => state.revealRequest);
  const rows = useMemo(() => visibleNodes(root, expanded), [root, expanded]);
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<TreeNode | null>(null);
  const renamingFromMenu = useRef(false);
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

  // "Reveal file in navigation": its folders are open by now; scroll to it and focus it.
  useEffect(() => {
    if (!revealRequest) return;
    const { path } = revealRequest;
    setFocusedPath(path);
    const frame = requestAnimationFrame(() => {
      const row = containerRef.current?.querySelector<HTMLElement>(
        `[data-path="${CSS.escape(path)}"]`,
      );
      row?.scrollIntoView({ block: 'center' });
      row?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealRequest]);

  /** Ctrl+click, ⌘+click or a middle click: a note in a new tab. */
  const opensNewTab = (event: MouseEvent) => event.ctrlKey || event.metaKey || event.button === 1;

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
                  onClick={(event) => {
                    setFocusedPath(node.path);
                    if (node.kind === 'note' && opensNewTab(event)) actions.onOpenInNewTab(node);
                    else activate(node);
                  }}
                  onAuxClick={(event) => {
                    if (event.button !== 1 || node.kind !== 'note') return;
                    event.preventDefault();
                    actions.onOpenInNewTab(node);
                  }}
                  onMouseDown={(event) => {
                    if (event.button === 1) event.preventDefault();
                  }}
                  onKeyDown={(event) => onKeyDown(event, row)}
                  className={cn(
                    'relative flex h-7 cursor-default items-center gap-1.5 pr-2 outline-none select-none',
                    'pl-[calc(var(--tree-depth)*14px+6px)]',
                    'hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
                    // Simplified UI (Phase 24): compact rows inset as soft pills, quieter names.
                    'simplified:mx-1.5 simplified:h-[26px] simplified:gap-1 simplified:rounded-md simplified:pr-1.5',
                    'simplified:pl-[calc(var(--tree-depth)*16px+4px)] simplified:text-[0.8125rem] simplified:text-muted',
                    isActive && 'bg-accent-subtle font-medium text-text simplified:text-text',
                    dropTarget === node.path && 'bg-accent-subtle ring-1 ring-accent ring-inset',
                  )}
                  style={{ '--tree-depth': depth - 1 } as CSSProperties}
                >
                  {/* Indent guides, one per containing folder, joined from row to row. */}
                  {Array.from({ length: depth - 1 }, (_, level) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: one guide per level, never reordered.
                      key={level}
                      aria-hidden="true"
                      className="absolute inset-y-0 hidden w-px bg-divider simplified:block"
                      style={{ left: `${level * 16 + 11}px` }}
                    />
                  ))}
                  <ChevronRight
                    aria-hidden="true"
                    size={14}
                    className={cn(
                      'shrink-0 text-subtle transition-transform duration-(--skb-duration-fast)',
                      !isFolder && 'invisible',
                      isOpen && 'rotate-90',
                    )}
                  />
                  <span aria-hidden="true" className="flex shrink-0 text-muted simplified:hidden">
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
                  ) : node.kind === 'attachment' ? (
                    <>
                      <span className="truncate simplified:hidden" title={node.path}>
                        {node.name}
                      </span>
                      {/* Simplified: the name, then its file type as a small tag (as in Obsidian). */}
                      <span className="hidden truncate simplified:inline" title={node.path}>
                        {stem(node.name)}
                      </span>
                      {extension(node.name) && (
                        <span className="hidden shrink-0 rounded-sm bg-surface-sunken px-1 text-[0.625rem] leading-4 font-medium tracking-wide text-subtle uppercase simplified:inline">
                          {extension(node.name)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="truncate" title={node.path}>
                      {node.name}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(event) => {
          // The rename field has focus: the menu must not take it back to the tree.
          if (renamingFromMenu.current) event.preventDefault();
          renamingFromMenu.current = false;
        }}
      >
        <MenuEntries
          as="context"
          entries={actions.menuFor(menuTarget, () => {
            if (!menuTarget) return;
            renamingFromMenu.current = true;
            // Once the menu has closed: while it is open it keeps focus inside itself.
            const path = menuTarget.path;
            setTimeout(() => setRenaming(path), 0);
          })}
        />
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
