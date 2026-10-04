import { useLayoutStore } from './layout-store';
import { useShortcut } from './shortcuts/useShortcuts';

/** Application-wide shortcuts. Renders nothing. */
export function GlobalShortcuts() {
  const togglePalette = () => {
    const { commandPaletteOpen, setCommandPaletteOpen } = useLayoutStore.getState();
    setCommandPaletteOpen(!commandPaletteOpen);
  };
  const openShortcuts = () => useLayoutStore.getState().setShortcutsOpen(true);

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
