import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';

/**
 * The only things the web page can ask the desktop shell for (tasks 18.05, 23.10, Phase 26): pick
 * files or a folder, show a path in the file manager or open it in its program, print the page to a
 * PDF, colour the title bar's buttons, say which application this is, and show web pages beside a
 * note. Every call is validated again in the main process; nothing here gives the page Node or the
 * file system.
 */

interface WebState {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  issue?: { kind: 'http' | 'load' | 'crash'; code: number } | null;
  focused?: boolean;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PickOptions {
  title?: string;
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
}

contextBridge.exposeInMainWorld('skbDesktop', {
  pickFiles: (options?: PickOptions): Promise<string[]> =>
    ipcRenderer.invoke('skb:pick-files', options ?? {}),
  pickFolder: (options?: { title?: string }): Promise<string | null> =>
    ipcRenderer.invoke('skb:pick-folder', options ?? {}),
  revealInExplorer: (target: string): Promise<boolean> => ipcRenderer.invoke('skb:reveal', target),
  openPath: (target: string): Promise<boolean> => ipcRenderer.invoke('skb:open-path', target),
  printToPdf: (options: { title: string }): Promise<string | null> =>
    ipcRenderer.invoke('skb:print-pdf', options),
  setTitleBarColours: (colours: { background: string; symbols: string }): Promise<void> =>
    ipcRenderer.invoke('skb:title-bar', colours),
  appInfo: (): Promise<{
    version: string;
    electron: string;
    platform: string;
    secrets: 'encrypted' | 'file';
  }> => ipcRenderer.invoke('skb:app-info'),
  web: {
    open: (id: string, url: string): Promise<boolean> =>
      ipcRenderer.invoke('skb:web-open', { id, url }),
    place: (id: string, bounds: Box | null): Promise<void> =>
      ipcRenderer.invoke('skb:web-place', { id, bounds }),
    command: (
      id: string,
      command: 'back' | 'forward' | 'reload' | 'stop' | 'load',
      url?: string,
    ): Promise<void> => ipcRenderer.invoke('skb:web-command', { id, command, url }),
    snapshot: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('skb:web-snapshot', { id }),
    release: (id: string): Promise<void> => ipcRenderer.invoke('skb:web-release', { id }),
    onState: (listener: (state: WebState) => void): (() => void) => {
      const handler = (_event: IpcRendererEvent, state: WebState) => listener(state);
      ipcRenderer.on('skb:web-state', handler);
      return () => ipcRenderer.removeListener('skb:web-state', handler);
    },
  },
});
