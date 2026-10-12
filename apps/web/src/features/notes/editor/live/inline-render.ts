/**
 * Inline Markdown as DOM, for the cells of a table drawn in live preview (Phase 25). Not a full
 * Markdown parser: the constructs that appear in table cells — emphasis, code, highlights, links,
 * wikilinks, `<br>` — and nothing is ever inserted as HTML, so a cell cannot inject markup.
 * Everything else is text.
 */

type Maker = (tag: string, className?: string) => HTMLElement;

const make =
  (document_: Document): Maker =>
  (tag, className) => {
    const element = document_.createElement(tag);
    if (className) element.className = className;
    return element;
  };

/** The index of `close` at or after `from`, not preceded by a backslash; -1 when there is none. */
function closing(text: string, close: string, from: number): number {
  for (
    let index = text.indexOf(close, from);
    index !== -1;
    index = text.indexOf(close, index + 1)
  ) {
    if (text[index - 1] !== '\\') return index;
  }
  return -1;
}

/** Pairs of marks that wrap text: the mark, the element, and its class. */
const PAIRS: readonly (readonly [string, string, string | undefined])[] = [
  ['**', 'strong', undefined],
  ['__', 'strong', undefined],
  ['~~', 'del', undefined],
  ['==', 'mark', 'cm-highlight'],
];

const COLOUR_EMOJI: Record<string, string> = {
  '🔴': 'red',
  '🟠': 'orange',
  '🟡': 'yellow',
  '🟢': 'green',
  '🔵': 'blue',
  '🟣': 'purple',
};

export function renderInline(text: string, document_: Document = document): DocumentFragment {
  const create = make(document_);
  const fragment = document_.createDocumentFragment();
  let buffer = '';
  const flush = () => {
    if (buffer) fragment.append(document_.createTextNode(buffer));
    buffer = '';
  };
  const wrap = (tag: string, inner: string, className?: string) => {
    flush();
    const element = create(tag, className);
    element.append(renderInline(inner, document_));
    fragment.append(element);
  };

  let index = 0;
  while (index < text.length) {
    const char = text[index] ?? '';
    const rest = text.slice(index);

    if (char === '\\' && index + 1 < text.length) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }
    if (rest.startsWith('<br>') || rest.startsWith('<br/>') || rest.startsWith('<br />')) {
      flush();
      fragment.append(create('br'));
      index += rest.indexOf('>') + 1;
      continue;
    }
    if (char === '`') {
      const run = /^`+/u.exec(rest)?.[0] ?? '`';
      const end = text.indexOf(run, index + run.length);
      if (end !== -1) {
        flush();
        const code = create('code');
        code.textContent = text.slice(index + run.length, end).trim();
        fragment.append(code);
        index = end + run.length;
        continue;
      }
    }
    if (rest.startsWith('![[') || rest.startsWith('[[')) {
      const embed = rest.startsWith('!');
      const open = embed ? 3 : 2;
      const end = text.indexOf(']]', index + open);
      if (end !== -1) {
        const inner = text.slice(index + open, end);
        const pipe = inner.search(/\\?\|/u);
        const target = (pipe === -1 ? inner : inner.slice(0, pipe)).replace(/\\$/u, '');
        const alias =
          pipe === -1
            ? null
            : inner
                .slice(pipe)
                .replace(/^\\?\|/u, '')
                .trim();
        const shown = alias || target.replace('#', ' › ').replace(/^ › /u, '').trim();
        flush();
        const link = create('span', embed ? 'cm-cell-embed' : 'cm-cell-link');
        link.textContent = embed ? `📎 ${shown}` : shown;
        fragment.append(link);
        index = end + 2;
        continue;
      }
    }
    if (char === '[') {
      const mid = text.indexOf('](', index + 1);
      const end = mid === -1 ? -1 : text.indexOf(')', mid + 2);
      if (mid !== -1 && end !== -1 && !text.slice(index + 1, mid).includes('[')) {
        flush();
        const link = create('span', 'cm-cell-link');
        link.append(renderInline(text.slice(index + 1, mid), document_));
        fragment.append(link);
        index = end + 1;
        continue;
      }
    }
    const paired = PAIRS.find(([open]) => rest.startsWith(open));
    if (paired) {
      const [open, tag, className] = paired;
      const end = closing(text, open, index + 2);
      if (end > index + 2) {
        let inner = text.slice(index + 2, end);
        let classes = className;
        if (open === '==') {
          const first = [...inner][0] ?? '';
          const colour = COLOUR_EMOJI[first];
          if (colour) {
            classes = `${className} cm-hl-${colour}`;
            inner = inner.slice(first.length);
          }
        }
        wrap(tag, inner, classes);
        index = end + 2;
        continue;
      }
    }
    if ((char === '*' || char === '_') && text[index + 1] !== char) {
      const end = closing(text, char, index + 1);
      const insideWord = char === '_' && /[\p{L}\p{N}]/u.test(text[index - 1] ?? '');
      if (end > index + 1 && !insideWord) {
        wrap('em', text.slice(index + 1, end));
        index = end + 1;
        continue;
      }
    }
    buffer += char;
    index += 1;
  }
  flush();
  return fragment;
}
