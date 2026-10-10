/**
 * The desktop shell's bridge (Phase 18, task 18.05). In the browser there is none, and every use of
 * it has a fallback; under Electron the preload script exposes exactly these four calls.
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
