import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only things the web page can ask the desktop shell for (tasks 18.05, 23.10): pick files or a
 * folder, show a path in the file manager or open it in its program, print the page to a PDF, colour
 * the title bar's buttons, and say which application this is. Every call is validated again in the
 * main process; nothing here gives the page Node or the file system.
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
});
