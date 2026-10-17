import { Copy, ExternalLink, FileText, Globe, Plus, X } from 'lucide-react';
import { type DragEvent, type ReactNode, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../../../components/ContextMenu';
import { IconButton } from '../../../components/IconButton';
import { MenuEntries, type MenuEntry } from '../../../components/MenuEntries';
import { cn } from '../../../lib/cn';
import { notifySuccess } from '../../../lib/notify';
import { openInBrowser } from '../links/external';
import { useWorkspace, type WorkspacePane, type WorkspaceTab } from './workspace-store';

/**
 * A pane's tabs (task 23.04). Each is a button that shows its note, with a close button beside it;
 * a middle click closes a tab too, a right click offers Close, Close others and the splits, and tabs
 * can be dragged into another order. The open tab is marked as the current page.
 */

const TAB_DRAG = 'application/x-skb-tab';

/** The row scrolls sideways, so a tab opened from the file tree could otherwise be out of sight. */
const showSelected = (tab: HTMLElement | null) =>
  tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });

export function TabBar({
  pane,
  active,
  titleOf,
  paneLabel,
  trailing,
}: {
  pane: WorkspacePane;
  /** Whether to mark this as the active pane (when there are two). */
  active: boolean;
  titleOf(tab: WorkspaceTab): { title: string; path: string | null };
  paneLabel: string;
  /** Page actions at the right end of the row (the Notes page's, in Simplified UI). */
  trailing?: ReactNode;
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
    ...(tab.url
      ? ([
          { kind: 'separator' },
          {
            label: 'Open in browser',
            icon: <ExternalLink size={14} />,
            onSelect: () => tab.url && openInBrowser(tab.url),
          },
          {
            label: 'Copy link',
            icon: <Copy size={14} />,
            onSelect: () =>
              void navigator.clipboard
                .writeText(tab.url ?? '')
                .then(() => notifySuccess('Link copied')),
          },
        ] satisfies MenuEntry[])
      : []),
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
    <div
      data-tab-bar
      data-active-pane={active}
      className={cn(
        // Simplified: as tall as the Files pane's header beside it, so the rows line up.
        'flex h-9 flex-none items-end border-b border-chrome-line bg-surface-sunken pt-1 simplified:h-10 simplified:bg-surface simplified:pt-2',
        active && 'shadow-[inset_0_2px_0_var(--skb-accent)]',
      )}
    >
      <nav
        aria-label={paneLabel}
        className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto px-1"
      >
        <ul className="flex min-w-0 items-end gap-0.5">
          {pane.tabs.map((tab, index) => {
            const { title, path } = titleOf(tab);
            const selected = tab.id === pane.activeTab;
            return (
              <li
                key={tab.id}
                ref={selected ? showSelected : undefined}
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
                    ? 'border-border bg-bg text-text simplified:border-transparent'
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
                      {tab.url ? (
                        <Globe aria-hidden="true" size={13} className="shrink-0 text-subtle" />
                      ) : (
                        <FileText aria-hidden="true" size={13} className="shrink-0 text-subtle" />
                      )}
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
      {trailing && (
        <div className="flex flex-none items-center gap-0.5 self-center pr-1.5 pb-1">
          {trailing}
        </div>
      )}
    </div>
  );
}
