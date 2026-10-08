import { useNavigate } from '@tanstack/react-router';
import { SEARCH_INPUT_ID } from '../features/search/search-ids';
import { useLayoutStore } from './layout-store';
import { useShortcut } from './shortcuts/useShortcuts';

/** Application-wide shortcuts. Renders nothing. */
export function GlobalShortcuts() {
  const togglePalette = () => {
    const { commandPaletteOpen, setCommandPaletteOpen } = useLayoutStore.getState();
    setCommandPaletteOpen(!commandPaletteOpen);
  };
  const openShortcuts = () => useLayoutStore.getState().setShortcutsOpen(true);
  const navigate = useNavigate();

  useShortcut({
    id: 'app.quick-switcher',
    keys: 'mod+o',
    description: 'Open a note by name',
    group: 'Navigation',
    allowInInputs: true,
    handler: () => {
      const { quickSwitcherOpen, setQuickSwitcherOpen } = useLayoutStore.getState();
      setQuickSwitcherOpen(!quickSwitcherOpen);
    },
  });
  useShortcut({
    id: 'app.search',
    keys: 'mod+shift+f',
    description: 'Search notes',
    group: 'Navigation',
    allowInInputs: true,
    handler: () => {
      void navigate({ to: '/search' }).then(() =>
        document.getElementById(SEARCH_INPUT_ID)?.focus(),
      );
    },
  });

  useShortcut({
    id: 'app.command-palette',
    keys: 'mod+k',
    description: 'Open the command palette',
    group: 'General',
    allowInInputs: true,
    handler: togglePalette,
  });
  useShortcut({
    id: 'app.toggle-sidebar',
    keys: 'mod+\\',
    description: 'Collapse or expand the sidebar',
    group: 'View',
    handler: () => useLayoutStore.getState().toggleSidebar(),
  });
  useShortcut({
    id: 'app.shortcuts',
    keys: '?',
    description: 'Show keyboard shortcuts',
    group: 'General',
    handler: openShortcuts,
  });
  useShortcut({
    id: 'app.shortcuts-alt',
    keys: 'mod+/',
    description: 'Show keyboard shortcuts',
    group: 'General',
    allowInInputs: true,
    handler: openShortcuts,
  });
  return null;
}
