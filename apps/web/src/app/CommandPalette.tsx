import { rankCandidates } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Command, defaultFilter } from 'cmdk';
import {
  FileText,
  Keyboard,
  Layers,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Sparkles,
  SquarePlus,
  Sun,
} from 'lucide-react';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useChat } from '../features/chat/chat-store';
import { treeQuery } from '../features/notes/api';
import { useQuickAdd } from '../features/review/quick-add';
import { useApi } from '../lib/api/context';
import { useLayoutStore } from './layout-store';
import { sectionIcon } from './section-icons';
import { SECTIONS } from './sections';
import { type ThemePreference, useThemeStore } from './theme/theme';

const groupClasses =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-subtle';

/**
 * Sections and commands rank as usual; notes and "search for" (already ranked by our own matcher)
 * always come after them, so typing a section's name and pressing Enter still goes there.
 */
function paletteFilter(value: string, search: string, keywords?: string[]): number {
  if (value.startsWith('note ') || value.startsWith('search for ')) return 0.001;
  return defaultFilter(value, search, keywords);
}

const itemClasses =
  'flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm text-text select-none data-[selected=true]:bg-surface-hover';

/**
 * Ctrl+K palette: jump to any section or run an application command; with two or more characters
 * typed it also offers the best-matching notes and a full-text search (task 4.08).
 */
export function CommandPalette() {
  const open = useLayoutStore((state) => state.commandPaletteOpen);
  const setOpen = useLayoutStore((state) => state.setCommandPaletteOpen);
  const navigate = useNavigate();
  const setTheme = useThemeStore((state) => state.setPreference);
  const api = useApi();
  const [search, setSearch] = useState('');
  const tree = useQuery({ ...treeQuery(api), enabled: open });
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);
  const trimmed = search.trim();
  const notes = useMemo(() => {
    if (trimmed.length < 2) return [];
    const candidates = (tree.data?.notes ?? []).map((note) => ({
      id: note.id,
      title: note.title,
      names: [
        note.path.slice(note.path.lastIndexOf('/') + 1).replace(/\.md$/i, ''),
        ...note.aliases,
      ],
      path: note.path,
    }));
    return rankCandidates(trimmed, candidates, { limit: 5 });
  }, [trimmed, tree.data]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  const themes: { value: ThemePreference; label: string; icon: ReactNode }[] = [
    { value: 'light', label: 'Use light theme', icon: <Sun size={16} /> },
    { value: 'dark', label: 'Use dark theme', icon: <Moon size={16} /> },
    { value: 'system', label: 'Match the system theme', icon: <Monitor size={16} /> },
  ];

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <RadixDialog.Content
          aria-describedby={undefined}
          data-command-palette
          className="fixed top-[14vh] left-1/2 z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface-raised shadow-lg"
        >
          <VisuallyHidden.Root>
            <RadixDialog.Title>Command palette</RadixDialog.Title>
          </VisuallyHidden.Root>
          <Command label="Command palette" loop filter={paletteFilter}>
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Jump to a page or a note, or run a command…"
              className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-text outline-none placeholder:text-subtle"
            />
            <Command.List className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
                No matching pages or commands.
              </Command.Empty>

              <Command.Group heading="Go to" className={groupClasses}>
                {SECTIONS.map((section) => {
                  const Icon = sectionIcon(section.id);
                  return (
                    <Command.Item
                      key={section.id}
                      value={`go ${section.label}`}
                      keywords={[section.id]}
                      onSelect={() => run(() => void navigate({ to: section.path }))}
                      className={itemClasses}
                    >
                      <Icon aria-hidden="true" size={16} className="text-muted" />
                      {section.label}
                    </Command.Item>
                  );
                })}
              </Command.Group>

              <Command.Group heading="Appearance" className={groupClasses}>
                {themes.map((theme) => (
                  <Command.Item
                    key={theme.value}
                    value={theme.label}
                    keywords={['theme', 'appearance', theme.value]}
                    onSelect={() => run(() => setTheme(theme.value))}
                    className={itemClasses}
                  >
                    <span aria-hidden="true" className="text-muted">
                      {theme.icon}
                    </span>
                    {theme.label}
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group heading="View" className={groupClasses}>
                <Command.Item
                  value="Collapse or expand the sidebar"
                  keywords={['sidebar', 'navigation']}
                  onSelect={() => run(() => useLayoutStore.getState().toggleSidebar())}
                  className={itemClasses}
                >
                  <PanelLeft aria-hidden="true" size={16} className="text-muted" />
                  Collapse or expand the sidebar
                </Command.Item>
                <Command.Item
                  value="Show keyboard shortcuts"
                  keywords={['help', 'keys', 'hotkeys']}
                  onSelect={() => run(() => useLayoutStore.getState().setShortcutsOpen(true))}
                  className={itemClasses}
                >
                  <Keyboard aria-hidden="true" size={16} className="text-muted" />
                  Show keyboard shortcuts
                </Command.Item>
              </Command.Group>
              <Command.Group heading="AI" className={groupClasses}>
                <Command.Item
                  value="Chat about your material"
                  keywords={['ai', 'question', 'explain', 'sources', 'ask', 'assistant']}
                  onSelect={() => run(() => useChat.getState().openPanel())}
                  className={itemClasses}
                >
                  <Sparkles aria-hidden="true" size={16} className="text-muted" />
                  Chat about your material
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Flashcards" className={groupClasses}>
                <Command.Item
                  value="New flashcard"
                  keywords={['card', 'add', 'anki']}
                  onSelect={() => run(() => useQuickAdd.getState().open())}
                  className={itemClasses}
                >
                  <SquarePlus aria-hidden="true" size={16} className="text-muted" />
                  New flashcard
                </Command.Item>
                <Command.Item
                  value="Review due cards"
                  keywords={['study', 'flashcards', 'spaced repetition']}
                  onSelect={() => run(() => void navigate({ to: '/review/session' }))}
                  className={itemClasses}
                >
                  <Layers aria-hidden="true" size={16} className="text-muted" />
                  Review due cards
                </Command.Item>
              </Command.Group>
              {trimmed.length >= 2 && (
                <Command.Group heading="Notes" className={groupClasses}>
                  {notes.map((match) => (
                    <Command.Item
                      key={match.candidate.id}
                      // Contains what was typed, so cmdk's own filter always keeps our ranked matches.
                      value={`note ${match.candidate.id} ${trimmed}`}
                      onSelect={() =>
                        run(
                          () =>
                            void navigate({
                              to: '/notes/$noteId',
                              params: { noteId: match.candidate.id },
                            }),
                        )
                      }
                      className={itemClasses}
                    >
                      <FileText aria-hidden="true" size={16} className="text-muted" />
                      <span className="truncate">{match.candidate.title}</span>
                    </Command.Item>
                  ))}
                  <Command.Item
                    value={`search for ${trimmed}`}
                    onSelect={() =>
                      run(() => void navigate({ to: '/search', search: { q: trimmed } }))
                    }
                    className={itemClasses}
                  >
                    <Search aria-hidden="true" size={16} className="text-muted" />
                    Search for “{trimmed}”
                  </Command.Item>
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
