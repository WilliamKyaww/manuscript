import { useNavigate } from '@tanstack/react-router';
import { Command } from 'cmdk';
import { Keyboard, Monitor, Moon, PanelLeft, Sun } from 'lucide-react';
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui';
import type { ReactNode } from 'react';
import { useLayoutStore } from './layout-store';
import { sectionIcon } from './section-icons';
import { SECTIONS } from './sections';
import { type ThemePreference, useThemeStore } from './theme/theme';

const groupClasses =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-subtle';

const itemClasses =
  'flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm text-text select-none data-[selected=true]:bg-surface-hover';

/** Ctrl+K palette: jump to any section or run an application command (searches arrive in Phase 4). */
export function CommandPalette() {
  const open = useLayoutStore((state) => state.commandPaletteOpen);
  const setOpen = useLayoutStore((state) => state.setCommandPaletteOpen);
  const navigate = useNavigate();
  const setTheme = useThemeStore((state) => state.setPreference);

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
          <Command label="Command palette" loop>
            <Command.Input
              placeholder="Jump to a page or run a command…"
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
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
