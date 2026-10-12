import { Decoration } from '@codemirror/view';
import { INLINE_MATH } from '@skb/core/markdown';
import { MathWidget } from './math';
import { ImageWidget } from './widgets';

/**
 * The rules of live preview that read one line of text (Phase 25): `==highlights==` (with Obsidian's
 * colour emoji), `[[wikilinks]]` and their aliases, `![[image]]` embeds, `$maths$`, footnote
 * references, `^[inline footnotes]` and `^block-ids`. Each yields decorations for the line; the marks
 * of an element are hidden only while the cursor is away from it.
 */

export interface Item {
  from: number;
  to: number;
  deco: Decoration;
  /** A mark hidden outright (what `hiddenRanges` reports). */
  hide?: boolean;
  /** The decoration replaces its range (so it must not overlap another that does). */
  replace?: boolean;
}

export interface LineContext {
  text: string;
  /** Document offset of the line's first character. */
  offset: number;
  touched(from: number, to: number): boolean;
  /** Whether a position is inside code or a comment, where nothing is drawn. */
  skipped(position: number): boolean;
  imageUrl(target: string): string | null;
}

const hidden = Decoration.replace({});
const mark = (className: string) => Decoration.mark({ class: className });

const HIGHLIGHT = /==(?=\S)([^=\n]*?\S)==/gu;
const WIKILINK = /(!?)\[\[([^[\]\n]+?)\]\]/gu;
const FOOTNOTE_REF = /\[\^([^\]\s]+)\](?!:)/gu;
const FOOTNOTE_DEFINITION = /^\[\^[^\]\s]+\]:/u;
const INLINE_FOOTNOTE = /\^\[([^\]\n]+)\]/gu;
const BLOCK_ID = /(?<=^|\s)\^[A-Za-z0-9-]+\s*$/u;
const IMAGE_SIZE = /^(\d+)(?:x(\d+))?$/u;

const COLOURS: Record<string, string> = {
  '🔴': 'red',
  '🟠': 'orange',
  '🟡': 'yellow',
  '🟢': 'green',
  '🔵': 'blue',
  '🟣': 'purple',
};

export function scanLine(context: LineContext): Item[] {
  const { text, offset, touched, skipped } = context;
  const items: Item[] = [];
  const hide = (from: number, to: number) => {
    if (to > from) items.push({ from, to, deco: hidden, hide: true, replace: true });
  };
  const add = (from: number, to: number, className: string) => {
    if (to > from) items.push({ from, to, deco: mark(className) });
  };

  for (const match of text.matchAll(HIGHLIGHT)) {
    const from = offset + (match.index ?? 0);
    const to = from + match[0].length;
    if (skipped(from)) continue;
    const inner = match[1] ?? '';
    const emoji = [...inner][0] ?? '';
    const colour = COLOURS[emoji];
    const start = from + 2 + (colour ? emoji.length : 0);
    add(start, to - 2, `cm-highlight${colour ? ` cm-hl-${colour}` : ''}`);
    if (!touched(from, to)) {
      hide(from, start);
      hide(to - 2, to);
    }
  }

  for (const match of text.matchAll(WIKILINK)) {
    const from = offset + (match.index ?? 0);
    const to = from + match[0].length;
    if (skipped(from)) continue;
    const embed = match[1] === '!';
    const inner = match[2] ?? '';
    const pipe = inner.search(/\\?\|/u);
    const target =
      (pipe === -1 ? inner : inner.slice(0, pipe)).replace(/\\$/u, '').split('#')[0] ?? '';
    const alias =
      pipe === -1
        ? null
        : inner
            .slice(pipe)
            .replace(/^\\?\|/u, '')
            .trim();
    if (embed) {
      const url = context.imageUrl(target.trim());
      if (url && !touched(from, to)) {
        const size = alias ? IMAGE_SIZE.exec(alias) : null;
        const widget = new ImageWidget(
          url,
          alias && !size ? alias : target.trim(),
          size ? Number(size[1]) : null,
          size?.[2] ? Number(size[2]) : null,
        );
        items.push({ from, to, deco: Decoration.replace({ widget }), replace: true });
      } else {
        add(from, to, 'cm-embed');
      }
      continue;
    }
    if (touched(from, to)) continue;
    // [[target|alias]] is drawn as its alias, [[target]] as its target: the brackets (and the
    // target and pipe, when there is an alias) are hidden.
    hide(from, from + 2 + (alias !== null ? pipe + (inner[pipe] === '\\' ? 2 : 1) : 0));
    hide(to - 2, to);
  }

  for (const match of text.matchAll(INLINE_MATH)) {
    const from = offset + (match.index ?? 0);
    const to = from + match[0].length;
    if (skipped(from)) continue;
    if (touched(from, to)) {
      add(from, to, 'cm-math-source');
      continue;
    }
    const widget = new MathWidget(match[0].slice(1, -1), false);
    items.push({ from, to, deco: Decoration.replace({ widget }), replace: true });
  }

  for (const match of text.matchAll(FOOTNOTE_REF)) {
    const from = offset + (match.index ?? 0);
    const to = from + match[0].length;
    if (skipped(from) || (from === offset && FOOTNOTE_DEFINITION.test(text))) continue;
    add(from + 2, to - 1, 'cm-footnote-ref');
    if (!touched(from, to)) {
      hide(from, from + 2);
      hide(to - 1, to);
    } else {
      add(from, from + 2, 'cm-footnote-ref');
      add(to - 1, to, 'cm-footnote-ref');
    }
  }
  const definition = FOOTNOTE_DEFINITION.exec(text);
  if (definition && !skipped(offset))
    add(offset, offset + definition[0].length, 'cm-footnote-label');

  for (const match of text.matchAll(INLINE_FOOTNOTE)) {
    const from = offset + (match.index ?? 0);
    if (!skipped(from)) add(from, from + match[0].length, 'cm-inline-footnote');
  }

  const blockId = BLOCK_ID.exec(text);
  if (blockId?.index !== undefined && !skipped(offset + blockId.index))
    add(
      offset + blockId.index,
      offset + blockId.index + blockId[0].trimEnd().length,
      'cm-block-id',
    );

  return items;
}
