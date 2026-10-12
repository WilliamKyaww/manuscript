/**
 * Callout types (Phase 25): `> [!type]` in Obsidian, and `> [!NOTE]` alerts on GitHub. Thirteen built-in
 * types, several with aliases; the type is case-insensitive and an unknown one is drawn as a note.
 * Shared by the editor's live preview and the reading view so that both draw the same callout.
 */

export const CALLOUT_TYPES = [
  'note',
  'abstract',
  'info',
  'todo',
  'tip',
  'success',
  'question',
  'warning',
  'failure',
  'danger',
  'bug',
  'example',
  'quote',
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

const ALIASES: Record<string, CalloutType> = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
};

/** The built-in type a callout's name stands for; names that are not built in are notes. */
export function canonicalCallout(name: string): CalloutType {
  const key = name.trim().toLowerCase();
  if ((CALLOUT_TYPES as readonly string[]).includes(key)) return key as CalloutType;
  return ALIASES[key] ?? 'note';
}

/** The first line of a callout, after `>`: `[!type]`, an optional `+` or `-`, then its title. */
const CALLOUT_HEAD = /^\[!([A-Za-z][\w-]*)\]([+-])?([ \t]*)(.*)$/u;

export interface CalloutHead {
  /** The name as written (any case). */
  name: string;
  type: CalloutType;
  /** `+` expanded, `-` collapsed, null when it cannot be folded. */
  fold: '+' | '-' | null;
  /** The title as written (empty: the type's name is shown). */
  title: string;
  /** Length of `[!type]` with its fold mark and the spaces after, within the line's text. */
  markerLength: number;
}

export function parseCalloutHead(text: string): CalloutHead | null {
  const match = CALLOUT_HEAD.exec(text);
  if (!match?.[1]) return null;
  const [, name, fold, , rest = ''] = match;
  return {
    name,
    type: canonicalCallout(name),
    fold: fold === '+' || fold === '-' ? fold : null,
    title: rest.trim(),
    markerLength: text.length - rest.length,
  };
}

/** What a callout is called when it has no title of its own: "Tip", "Question"… */
export function calloutLabel(name: string): string {
  const key = name.trim().toLowerCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}
