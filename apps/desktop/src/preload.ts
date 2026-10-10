import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only things the web page can ask the desktop shell for (task 18.05): pick files or a folder,
 * show a path in the file manager, and say which application this is. Every call is validated again
 * in the main process; nothing here gives the page Node or the file system.
 */

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
  appInfo: (): Promise<{
    version: string;
    electron: string;
    platform: string;
    secrets: 'encrypted' | 'file';
  }> => ipcRenderer.invoke('skb:app-info'),
});
