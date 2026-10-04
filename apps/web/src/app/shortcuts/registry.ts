/**
 * Keyboard shortcut registry (ui.md §6). Shortcuts are written like `mod+k`, `mod+shift+f`, `?` or
 * `mod+\`. `mod` is Ctrl on Windows/Linux and ⌘ on Apple platforms.
 */

export type ShortcutGroup = 'General' | 'Navigation' | 'View' | 'Editor' | 'Review';

export interface ShortcutDefinition {
  id: string;
  keys: string;
  description: string;
  group: ShortcutGroup;
  /** Fire even while typing in an input, textarea or editor (e.g. Ctrl+K). */
  allowInInputs?: boolean;
  handler: (event: KeyboardEvent) => void;
}

const MODIFIER_ORDER = ['mod', 'ctrl', 'alt', 'shift'] as const;
type Modifier = (typeof MODIFIER_ORDER)[number];

function isModifier(token: string): token is Modifier {
  return (MODIFIER_ORDER as readonly string[]).includes(token);
}

/** Printable symbols already include the effect of Shift (e.g. `?` is Shift+/), so Shift is ignored for them. */
function isShiftedSymbol(key: string): boolean {
  return key.length === 1 && !/[a-z0-9]/i.test(key);
}

/** Canonical form: modifiers in a fixed order, then the key, all lower case. */
export function normaliseKeys(keys: string): string {
  const tokens = keys
    .toLowerCase()
    .split('+')
    .map((token) => token.trim());
  // Support the "+" key itself, written as "mod++".
  const key = keys.endsWith('++') ? '+' : (tokens.at(-1) ?? '');
  const modifiers = new Set(tokens.slice(0, keys.endsWith('++') ? -2 : -1).filter(isModifier));
  if (isShiftedSymbol(key)) modifiers.delete('shift');
  const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
  return [...ordered, key].join('+');
}

export function eventToKeys(
  event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
  apple: boolean,
): string {
  const key = event.key.toLowerCase();
  const modifiers: Modifier[] = [];
  if (apple ? event.metaKey : event.ctrlKey) modifiers.push('mod');
  if (apple && event.ctrlKey) modifiers.push('ctrl');
  if (event.altKey) modifiers.push('alt');
  if (event.shiftKey && !isShiftedSymbol(key)) modifiers.push('shift');
  return [...modifiers, key].join('+');
}

const KEY_LABELS: Record<string, string> = {
  escape: 'Esc',
  enter: 'Enter',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  ' ': 'Space',
  space: 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  tab: 'Tab',
};

/** Human-readable key caps, e.g. `["Ctrl", "Shift", "F"]`. */
export function keyLabels(keys: string, apple: boolean): string[] {
  return normaliseKeys(keys)
    .split('+')
    .map((token) => {
      if (token === 'mod') return apple ? '⌘' : 'Ctrl';
      if (token === 'ctrl') return apple ? '⌃' : 'Ctrl';
      if (token === 'alt') return apple ? '⌥' : 'Alt';
      if (token === 'shift') return apple ? '⇧' : 'Shift';
      return KEY_LABELS[token] ?? (token.length === 1 ? token.toUpperCase() : token);
    });
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor',
    ),
  );
}

export class ShortcutRegistry {
  readonly #entries = new Map<string, ShortcutDefinition>();

  /** Registers a shortcut; returns a function that removes it. */
  register(definition: ShortcutDefinition): () => void {
    this.#entries.set(definition.id, definition);
    return () => {
      if (this.#entries.get(definition.id) === definition) this.#entries.delete(definition.id);
    };
  }

  list(): ShortcutDefinition[] {
    return [...this.#entries.values()];
  }

  /** Key combinations claimed by more than one shortcut. */
  conflicts(): string[] {
    const seen = new Map<string, number>();
    for (const entry of this.#entries.values()) {
      const keys = normaliseKeys(entry.keys);
      seen.set(keys, (seen.get(keys) ?? 0) + 1);
    }
    return [...seen.entries()].filter(([, count]) => count > 1).map(([keys]) => keys);
  }

  /** Runs the matching shortcut, if any. Returns true when the event was handled. */
  handle(event: KeyboardEvent, apple: boolean): boolean {
    if (event.defaultPrevented || event.isComposing || event.repeat) return false;
    const pressed = eventToKeys(event, apple);
    const editable = isEditableTarget(event.target);
    // Most recently registered wins, so a page can temporarily override a global shortcut.
    const candidates = this.list().reverse();
    for (const entry of candidates) {
      if (normaliseKeys(entry.keys) !== pressed) continue;
      if (editable && !entry.allowInInputs) continue;
      event.preventDefault();
      entry.handler(event);
      return true;
    }
    return false;
  }
}

export const shortcutRegistry = new ShortcutRegistry();
