import { app, Menu, type MenuItemConstructorOptions, shell } from 'electron';

/**
 * The application menu (task 18.07). The web page already has its own shortcuts (the command
 * palette, the quick switcher, the cheat sheet on `?`), so this menu only adds what a window of
 * any application has — edit commands, zoom, full screen — and where the files are. Accelerators
 * that the page uses are not claimed here.
 */

export interface MenuHooks {
  /** The vault and data folders, once the server has said where they are. */
  folders(): { vault: string | null; data: string | null };
  /** Developer tools are for development builds only. */
  devTools: boolean;
}

export function buildMenu(hooks: MenuHooks): Menu {
  const reveal = (which: 'vault' | 'data') => () => {
    const target = hooks.folders()[which];
    if (target) void shell.openPath(target);
  };
  const template: MenuItemConstructorOptions[] = [
    {
      label: '&File',
      submenu: [
        { label: 'Show the vault folder', click: reveal('vault') },
        { label: 'Show the data folder', click: reveal('data') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit Manuscript' },
      ],
    },
    {
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(hooks.devTools
          ? ([{ type: 'separator' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    { label: '&Window', submenu: [{ role: 'minimize' }, { role: 'close' }] },
    {
      label: '&Help',
      submenu: [{ label: `Manuscript ${app.getVersion()}`, enabled: false }],
    },
  ];
  return Menu.buildFromTemplate(template);
}
