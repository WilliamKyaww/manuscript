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
  /** Web pages beside a note (Phase 26); missing in a shell older than this page. */
  web?: DesktopWebBridge;
}

/** What the page and the main process say about one web tab. */
export interface DesktopWebState {
  id: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** The student clicked into the page. */
  focused?: boolean;
}

export interface DesktopBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The web pane (Phase 26, ADR-0045): each web tab is a native view the main process lays over the
 * box the page keeps for it (CSS pixels of the window), hides when the box is null, and lets go of
 * when the tab closes. A snapshot hides the view and returns a picture of it, for the page to show
 * while a menu or dialogue would otherwise be covered by it.
 */
export interface DesktopWebBridge {
  open(id: string, url: string): Promise<boolean>;
  place(id: string, bounds: DesktopBox | null): Promise<void>;
  command(
    id: string,
    command: 'back' | 'forward' | 'reload' | 'stop' | 'load',
    url?: string,
  ): Promise<void>;
  snapshot(id: string): Promise<string | null>;
  release(id: string): Promise<void>;
  onState(listener: (state: DesktopWebState) => void): () => void;
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
