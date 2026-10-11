import path from 'node:path';

/**
 * The desktop shell's rules, as pure functions so that they can be tested without Electron
 * (architecture.md §8, §11): which addresses the window may show, which may be opened outside the
 * application, which paths the renderer may ask to have revealed, and what a file picker may be
 * asked for. The renderer is treated as untrusted: it is a web page, and a page it shows could be
 * compromised.
 */

/** Whether an address is part of the application (the server's own origin). */
export function isAppUrl(candidate: string, origin: string): boolean {
  try {
    return new URL(candidate).origin === new URL(origin).origin;
  } catch {
    return false;
  }
}

/**
 * The address to hand to the system browser, or null. Only plain http(s) links are opened: no
 * `file:`, no `javascript:`, no custom protocols (which can start other programs), and no
 * credentials in the address.
 */
export function externalUrl(candidate: string): string | null {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.hostname === '') return null;
  return url.toString();
}

const normalise = (value: string) => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

/** Whether `target` is one of `roots` or inside one: the only places "show in folder" may point. */
export function isRevealable(target: unknown, roots: readonly string[]): target is string {
  if (typeof target !== 'string' || target === '' || target.includes('\0')) return false;
  if (!path.isAbsolute(target)) return false;
  const candidate = normalise(target);
  return roots.some((root) => {
    const base = normalise(root);
    return candidate === base || candidate.startsWith(`${base}${path.sep}`);
  });
}

export interface PickOptions {
  title?: string;
  /** Extensions without the dot, per filter name. */
  filters?: { name: string; extensions: string[] }[];
  multiple?: boolean;
}

const EXTENSION = /^[A-Za-z0-9]{1,12}$/u;

/** What the renderer asked a picker for, cut down to what a picker takes. */
export function sanitisePick(options: unknown): PickOptions {
  const result: PickOptions = {};
  if (typeof options !== 'object' || options === null) return result;
  const given = options as Record<string, unknown>;
  if (typeof given.title === 'string') result.title = given.title.slice(0, 100);
  if (given.multiple === true) result.multiple = true;
  if (Array.isArray(given.filters)) {
    const filters: NonNullable<PickOptions['filters']> = [];
    for (const entry of given.filters.slice(0, 8)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { name, extensions } = entry as { name?: unknown; extensions?: unknown };
      if (typeof name !== 'string' || !Array.isArray(extensions)) continue;
      const clean = extensions
        .filter((value): value is string => typeof value === 'string' && EXTENSION.test(value))
        .slice(0, 20);
      if (clean.length > 0) filters.push({ name: name.slice(0, 60), extensions: clean });
    }
    if (filters.length > 0) result.filters = filters;
  }
  return result;
}

/**
 * Whether `window.open` may open this address in a window of its own (task 23.10): a note of the
 * application, as "Open in new window" asks for (`/notes/<id>?window=note`). Anything else opened
 * by a page is refused (or goes to the system browser).
 */
export function isNoteWindowUrl(candidate: string, origin: string): boolean {
  if (!isAppUrl(candidate, origin)) return false;
  const url = new URL(candidate);
  return (
    /^\/notes\/note_[0-9A-HJKMNP-TV-Z]{26}$/u.test(url.pathname) &&
    url.searchParams.get('window') === 'note'
  );
}

/** A colour for the window's buttons, as the page sends it: `#rgb`, `#rrggbb` or `#rrggbbaa`. */
export function titleBarColour(value: unknown): string | null {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(value)
    ? value
    : null;
}

/** A file name for a note printed to PDF: its title without what Windows forbids, kept short. */
export function pdfFileName(title: unknown): string {
  const clean =
    typeof title === 'string'
      ? title
          // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is being removed.
          .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, ' ')
          .replace(/\s+/gu, ' ')
          .replace(/[. ]+$/u, '')
          .trim()
          .slice(0, 120)
      : '';
  return `${clean || 'Note'}.pdf`;
}

/** Whether a message to the main process came from a page of the application. */
export function senderAllowed(frameUrl: string | undefined | null, origin: string | null): boolean {
  return origin !== null && typeof frameUrl === 'string' && isAppUrl(frameUrl, origin);
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximised: boolean;
}

export const DEFAULT_WINDOW: WindowState = { width: 1360, height: 860, maximised: false };
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;

/** A saved window position that is still on a display; otherwise only the size is kept. */
export function restoreWindowState(saved: unknown, displays: readonly Bounds[]): WindowState {
  if (typeof saved !== 'object' || saved === null) return { ...DEFAULT_WINDOW };
  const given = saved as Record<string, unknown>;
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined;
  const widest = Math.max(1, ...displays.map((display) => display.width));
  const tallest = Math.max(1, ...displays.map((display) => display.height));
  const width = Math.min(
    Math.max(number(given.width) ?? DEFAULT_WINDOW.width, MIN_WIDTH),
    Math.max(widest, MIN_WIDTH),
  );
  const height = Math.min(
    Math.max(number(given.height) ?? DEFAULT_WINDOW.height, MIN_HEIGHT),
    Math.max(tallest, MIN_HEIGHT),
  );
  const state: WindowState = { width, height, maximised: given.maximised === true };
  const x = number(given.x);
  const y = number(given.y);
  if (x !== undefined && y !== undefined) {
    // Enough of the title bar must be on a display to be grabbed, or the window would be lost.
    const visible = displays.some(
      (display) =>
        x + width > display.x + 100 &&
        x < display.x + display.width - 100 &&
        y >= display.y - 10 &&
        y < display.y + display.height - 50,
    );
    if (visible) {
      state.x = x;
      state.y = y;
    }
  }
  return state;
}
