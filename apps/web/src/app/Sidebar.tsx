import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PanelLeftClose, PanelLeftOpen, Search, Sparkles } from 'lucide-react';
import { useEffect } from 'react';
import { IconButton } from '../components/IconButton';
import { Kbd } from '../components/Kbd';
import { Tooltip } from '../components/Tooltip';
import { useChat } from '../features/chat/chat-store';
import { inboxCountsQuery } from '../features/inbox/api';
import { useApi } from '../lib/api/context';
import { cn } from '../lib/cn';
import { isApplePlatform } from '../lib/platform';
import { NARROW_QUERY, selectSidebarCollapsed, useLayoutStore } from './layout-store';
import { sectionIcon } from './section-icons';
import { GROUP_LABELS, SECTIONS, type Section, type SectionGroup } from './sections';
import { keyLabels } from './shortcuts/registry';

const NAV_GROUPS: SectionGroup[] = ['home', 'knowledge', 'learning', 'assistant'];

/** Follows the window's width, so that the sidebar becomes a rail in a narrow window. */
function useNarrowWindow() {
  const setNarrow = useLayoutStore((state) => state.setNarrow);
  useEffect(() => {
    const query = window.matchMedia?.(NARROW_QUERY);
    if (!query) return;
    setNarrow(query.matches);
    const changed = (event: MediaQueryListEvent) => setNarrow(event.matches);
    query.addEventListener('change', changed);
    return () => query.removeEventListener('change', changed);
  }, [setNarrow]);
}

export function Sidebar() {
  useNarrowWindow();
  const collapsed = useLayoutStore(selectSidebarCollapsed);
  const toggleSidebar = useLayoutStore((state) => state.toggleSidebar);
  const openPalette = useLayoutStore((state) => state.setCommandPaletteOpen);
  const settings = SECTIONS.find((section) => section.id === 'settings');

  return (
    <nav
      id="sidebar"
      aria-label="Main"
      data-sidebar
      data-collapsed={collapsed}
      className={cn(
        'flex h-full flex-none flex-col border-r border-border bg-surface',
        'transition-[width] duration-(--skb-duration-normal) ease-(--skb-ease)',
        collapsed ? 'w-(--skb-sidebar-width-collapsed)' : 'w-(--skb-sidebar-width)',
      )}
    >
      <div
        className={cn('flex h-14 flex-none items-center gap-2 px-3', collapsed && 'justify-center')}
      >
        {!collapsed && (
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 rounded-md font-semibold">
            <img src="/favicon.svg" alt="" className="size-7" />
            <span className="truncate text-sm">Manuscript</span>
          </Link>
        )}
        <IconButton
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          icon={collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          shortcut="mod+\"
          tooltipSide="right"
          aria-expanded={!collapsed}
          aria-controls="sidebar"
          onClick={toggleSidebar}
        />
      </div>

      <div className="flex-none px-3 pb-2">
        <SidebarSearchButton collapsed={collapsed} onClick={() => openPalette(true)} />
        <SidebarChatButton collapsed={collapsed} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {NAV_GROUPS.map((group) => {
          const items = SECTIONS.filter((section) => section.group === group);
          const label = GROUP_LABELS[group];
          return (
            <div key={group} className="mt-3 first:mt-1">
              {label && !collapsed && (
                <p className="px-2 pb-1 text-xs font-medium tracking-wide text-subtle uppercase">
                  {label}
                </p>
              )}
              {label && collapsed && (
                <div aria-hidden="true" className="mx-2 mb-2 h-px bg-border" />
              )}
              <ul className="space-y-0.5">
                {items.map((section) => (
                  <li key={section.id}>
                    <SidebarLink section={section} collapsed={collapsed} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {settings && (
        <div className="flex-none border-t border-border px-3 py-2">
          <SidebarLink section={settings} collapsed={collapsed} />
        </div>
      )}
    </nav>
  );
}

function SidebarLink({ section, collapsed }: { section: Section; collapsed: boolean }) {
  const Icon = sectionIcon(section.id);
  const link = (
    <Link
      to={section.path}
      activeOptions={{ exact: section.path === '/' }}
      className={cn(
        'flex h-9 items-center gap-3 rounded-md px-2 text-sm text-muted',
        'transition-colors duration-(--skb-duration-fast) hover:bg-surface-hover hover:text-text',
        'data-[status=active]:bg-accent-subtle data-[status=active]:font-medium data-[status=active]:text-text',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon aria-hidden="true" size={18} className="shrink-0" />
      <span className={collapsed ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{section.label}</span>
      {section.id === 'inbox' && <InboxCount collapsed={collapsed} />}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={section.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

/** How many drafts and suggestions wait in the Inbox (nothing when none do). */
function InboxCount({ collapsed }: { collapsed: boolean }) {
  const api = useApi();
  const counts = useQuery(inboxCountsQuery(api));
  const total = (counts.data?.drafts ?? 0) + (counts.data?.proposals ?? 0);
  if (total === 0) return null;
  const text = total > 99 ? '99+' : String(total);
  return collapsed ? (
    <span className="sr-only">, {total} waiting</span>
  ) : (
    <span className="rounded-full bg-accent-subtle px-1.5 text-xs font-medium text-text tabular-nums">
      <span aria-hidden="true">{text}</span>
      <span className="sr-only">, {total} waiting</span>
    </span>
  );
}

function SidebarChatButton({ collapsed }: { collapsed: boolean }) {
  const open = () => useChat.getState().openPanel();
  if (collapsed)
    return (
      <IconButton
        label="Chat about your material"
        icon={<Sparkles size={18} />}
        shortcut="mod+j"
        tooltipSide="right"
        className="mt-1 w-full"
        onClick={open}
      />
    );
  return (
    <button
      type="button"
      onClick={open}
      className="mt-1 flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-sm text-muted hover:bg-surface-hover hover:text-text"
    >
      <Sparkles aria-hidden="true" size={16} />
      <span className="min-w-0 flex-1 truncate text-left">Chat…</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {keyLabels('mod+j', isApplePlatform()).map((label) => (
          <Kbd key={label}>{label}</Kbd>
        ))}
      </span>
    </button>
  );
}

function SidebarSearchButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  if (collapsed) {
    return (
      <IconButton
        label="Search or run a command"
        icon={<Search size={18} />}
        shortcut="mod+k"
        tooltipSide="right"
        className="w-full"
        onClick={onClick}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface-sunken px-2.5 text-sm text-muted hover:border-border-strong"
    >
      <Search aria-hidden="true" size={16} />
      <span className="min-w-0 flex-1 truncate text-left">Jump to…</span>
      <span className="flex gap-0.5" aria-hidden="true">
        {keyLabels('mod+k', isApplePlatform()).map((label) => (
          <Kbd key={label}>{label}</Kbd>
        ))}
      </span>
    </button>
  );
}
