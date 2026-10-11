/**
 * The desktop shell's bridge (Phase 18, task 18.05; Phase 23). In the browser there is none, and
 * every use of it has a fallback; under Electron the preload script exposes exactly these calls,
 * and the main process checks each one again.
 */

export interface DesktopInfo {
  version: string;
  electron: string;
  platform: string;
  /** Whether AI keys are encrypted with the operating system's protection, or only kept in a file. */
  secrets: 'encrypted' | 'file';
}

export interface DesktopBridge {
  pickFiles(options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
    multiple?: boolean;
  }): Promise<string[]>;
  pickFolder(options?: { title?: string }): Promise<string | null>;
  revealInExplorer(path: string): Promise<boolean>;
  appInfo(): Promise<DesktopInfo | null>;
  /** Opens a file of the vault in the program the system uses for it (task 23.10). */
  openPath(path: string): Promise<boolean>;
  /** Prints the page (with its print styles) to a PDF the student chooses where to save. */
  printToPdf(options: { title: string }): Promise<string | null>;
  /** Colours of the slim title bar's window controls, to follow the theme. */
  setTitleBarColours(colours: { background: string; symbols: string }): Promise<void>;
}

declare global {
  interface Window {
    skbDesktop?: DesktopBridge;
  }
}

/** The bridge, or null in a browser. */
export function desktopBridge(): DesktopBridge | null {
  return typeof window !== 'undefined' && window.skbDesktop ? window.skbDesktop : null;
}
