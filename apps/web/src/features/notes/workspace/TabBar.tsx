import { FileText, Plus, X } from 'lucide-react';
import { type DragEvent, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../../../components/ContextMenu';
import { IconButton } from '../../../components/IconButton';
import { MenuEntries, type MenuEntry } from '../../../components/MenuEntries';
import { cn } from '../../../lib/cn';
import { useWorkspace, type WorkspacePane, type WorkspaceTab } from './workspace-store';

/**
 * A pane's tabs (task 23.04). Each is a button that shows its note, with a close button beside it;
 * a middle click closes a tab too, a right click offers Close, Close others and the splits, and tabs
 * can be dragged into another order. The open tab is marked as the current page.
 */

const TAB_DRAG = 'application/x-skb-tab';

export function TabBar({
  pane,
  active,
  titleOf,
  paneLabel,
}: {
  pane: WorkspacePane;
  /** Whether to mark this as the active pane (when there are two). */
  active: boolean;
  titleOf(tab: WorkspaceTab): { title: string; path: string | null };
  paneLabel: string;
}) {
  const store = useWorkspace;
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const menuFor = (tab: WorkspaceTab): MenuEntry[] => [
    { label: 'Close', onSelect: () => store.getState().closeTab(pane.id, tab.id) },
    {
      label: 'Close others',
      disabled: pane.tabs.length === 1,
      onSelect: () => store.getState().closeOtherTabs(pane.id, tab.id),
    },
    ...(tab.noteId
      ? ([
          { kind: 'separator' },
          {
            label: 'Split right',
            onSelect: () => tab.noteId && store.getState().openInOtherPane(tab.noteId, 'right'),
          },
          {
            label: 'Split down',
            onSelect: () => tab.noteId && store.getState().openInOtherPane(tab.noteId, 'down'),
          },
        ] satisfies MenuEntry[])
      : []),
  ];

  const onDrop = (event: DragEvent, index: number) => {
    const id = event.dataTransfer.getData(TAB_DRAG);
    setDropIndex(null);
    if (!id) return;
    event.preventDefault();
    const from = pane.tabs.findIndex((tab) => tab.id === id);
    if (from === -1) return;
    store.getState().moveTab(pane.id, id, from < index ? index - 1 : index);
  };

  return (
    <nav
      aria-label={paneLabel}
      data-tab-bar
      data-active-pane={active}
      className={cn(
        'flex h-9 flex-none items-end gap-0.5 overflow-x-auto border-b border-border bg-surface-sunken px-1 pt-1',
        active && 'shadow-[inset_0_2px_0_var(--skb-accent)]',
      )}
    >
      <ul className="flex min-w-0 items-end gap-0.5">
        {pane.tabs.map((tab, index) => {
          const { title, path } = titleOf(tab);
          const selected = tab.id === pane.activeTab;
          return (
            <li
              key={tab.id}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(TAB_DRAG)) return;
                event.preventDefault();
                setDropIndex(index);
              }}
              onDragLeave={() => setDropIndex((current) => (current === index ? null : current))}
              onDrop={(event) => onDrop(event, index)}
              className={cn(
                'group relative flex h-8 max-w-52 min-w-24 items-center rounded-t-md border border-b-0 text-sm',
                selected
                  ? 'border-border bg-bg text-text'
                  : 'border-transparent text-muted hover:bg-surface-hover hover:text-text',
                dropIndex === index &&
                  'before:absolute before:inset-y-1 before:-left-0.5 before:w-0.5 before:bg-accent',
              )}
            >
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    draggable
                    aria-current={selected ? 'page' : undefined}
                    title={path ?? title}
                    onDragStart={(event) => {
                      event.dataTransfer.setData(TAB_DRAG, tab.id);
                      event.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => store.getState().activateTab(pane.id, tab.id)}
                    onAuxClick={(event) => {
                      if (event.button !== 1) return;
                      event.preventDefault();
                      store.getState().closeTab(pane.id, tab.id);
                    }}
                    onMouseDown={(event) => {
                      // A middle click would otherwise start scrolling the page.
                      if (event.button === 1) event.preventDefault();
                    }}
                    className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-t-md pr-1 pl-2.5 outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
                  >
                    <FileText aria-hidden="true" size={13} className="shrink-0 text-subtle" />
                    <span className="truncate">{title}</span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <MenuEntries entries={menuFor(tab)} as="context" />
                </ContextMenuContent>
              </ContextMenu>
              <button
                type="button"
                aria-label={`Close ${title}`}
                title="Close"
                onClick={() => store.getState().closeTab(pane.id, tab.id)}
                className={cn(
                  'mr-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-subtle hover:bg-surface-hover hover:text-text',
                  'focus-visible:opacity-100',
                  selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
              >
                <X aria-hidden="true" size={13} />
              </button>
            </li>
          );
        })}
      </ul>
      <IconButton
        label="New tab"
        icon={<Plus size={15} />}
        size="sm"
        className="mb-0.5 ml-0.5 size-7"
        onClick={() => {
          store.getState().focusPane(pane.id);
          store.getState().openInNewTab(null);
        }}
      />
    </nav>
  );
}
