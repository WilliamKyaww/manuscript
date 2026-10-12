import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { liveBlocksField } from './live/blocks';
import { contextFromAttachments, livePreviewContext } from './live/context';
import { liveItems, livePreview } from './live-preview';

/** What live preview draws (Phase 25): the decorations for each Markdown element. */

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

function viewOf(doc: string, cursor = doc.length): EditorView {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [
      markdown({ base: markdownLanguage }),
      livePreviewContext.of(
        contextFromAttachments(() => [{ name: 'diagram.png', folder: 'Attachments' }]),
      ),
      livePreview,
    ],
  });
  ensureSyntaxTree(state, doc.length, 5_000);
  const view = new EditorView({ state, parent: document.body });
  views.push(view);
  return view;
}

interface Drawn {
  at: string;
  kind: 'hide' | 'widget' | 'mark' | 'line';
  detail: string;
}

/** The decorations as plain facts: what is under them, and what they do. */
function drawn(doc: string, cursor = doc.length): Drawn[] {
  return liveItems(viewOf(doc, cursor)).map(({ from, to, deco }) => {
    const spec = deco.spec as {
      class?: string;
      attributes?: Record<string, string>;
      widget?: { constructor: { name: string } };
    };
    const at = doc.slice(from, to);
    if (spec.widget) return { at, kind: 'widget', detail: spec.widget.constructor.name };
    if (spec.attributes) return { at, kind: 'line', detail: spec.attributes.class ?? '' };
    if (spec.class) return { at, kind: 'mark', detail: spec.class };
    return { at, kind: 'hide', detail: '' };
  });
}

const has = (list: Drawn[], kind: Drawn['kind'], detail: string, at?: string) =>
  list.some(
    (item) => item.kind === kind && item.detail === detail && (at === undefined || item.at === at),
  );

const click = (element: Element | null | undefined) =>
  element?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

describe('lists', () => {
  it('draw bullets and numbers, indent nested items and hide the leading spaces', () => {
    const result = drawn('- one\n  - two\n1. first\n\nEnd');
    expect(result.filter((item) => item.detail === 'ListMarkerWidget')).toHaveLength(3);
    expect(has(result, 'hide', '', '  ')).toBe(true);
    expect(result.filter((item) => item.detail === 'cm-list-line')).toHaveLength(3);
  });

  it('show the source of the line the cursor is on', () => {
    const doc = '- one\n- two';
    const result = drawn(doc, doc.indexOf('two'));
    expect(result.filter((item) => item.detail === 'ListMarkerWidget')).toHaveLength(1);
  });
});

describe('tasks', () => {
  it('draw a checkbox in place of the marker, and a done task muted', () => {
    const result = drawn('- [ ] open\n- [x] done\n- [-] dropped\n\nEnd');
    expect(result.filter((item) => item.detail === 'CheckboxWidget')).toHaveLength(3);
    expect(has(result, 'mark', 'cm-task-done', ' done')).toBe(true);
    expect(result.filter((item) => item.detail === 'cm-task-done')).toHaveLength(1);
  });

  it('toggle with a click on the checkbox, changing only the character in the brackets', () => {
    const view = viewOf('- [ ] open\n\nEnd');
    click(view.dom.querySelector('.cm-task-box'));
    expect(view.state.doc.toString()).toBe('- [x] open\n\nEnd');
    click(view.dom.querySelector('.cm-task-box'));
    expect(view.state.doc.toString()).toBe('- [ ] open\n\nEnd');
  });
});

describe('quotes and callouts', () => {
  it('draw a quote with a bar, its marks hidden away from the cursor', () => {
    const doc = '> quoted\n> more\n\nEnd';
    const result = drawn(doc);
    expect(result.filter((item) => item.detail === 'cm-quote')).toHaveLength(2);
    expect(result.filter((item) => item.kind === 'hide' && item.at === '> ')).toHaveLength(2);
    expect(drawn(doc, 3).filter((item) => item.kind === 'hide' && item.at === '> ')).toHaveLength(
      1,
    );
  });

  it('draw a callout with its type, icon and title', () => {
    const doc = '> [!warning] Careful\n> It bites.\n\nEnd';
    const result = drawn(doc);
    expect(result.filter((item) => item.detail === 'cm-callout')).toHaveLength(2);
    expect(has(result, 'widget', 'CalloutTitleWidget', '[!warning] ')).toBe(true);
    expect(has(result, 'mark', 'cm-callout-title', 'Careful')).toBe(true);
    const view = viewOf(doc);
    expect(view.dom.querySelectorAll('.cm-callout[data-callout="warning"]')).toHaveLength(2);
    expect(view.dom.querySelector('.cm-callout-icon svg')).not.toBeNull();
  });

  it('name an untitled callout by its type, and treat an alias as its type', () => {
    const view = viewOf('> [!faq]\n> Because.\n\nEnd');
    expect(view.dom.querySelector('.cm-callout[data-callout="question"]')).not.toBeNull();
    expect(view.dom.querySelector('.cm-callout-label')?.textContent).toBe('Faq');
  });
});

describe('inline elements', () => {
  it('draw highlights, with the colour emoji of Obsidian, hiding the marks', () => {
    const result = drawn('A ==plain== and ==🟢green== word.\n\nEnd');
    expect(has(result, 'mark', 'cm-highlight', 'plain')).toBe(true);
    expect(has(result, 'mark', 'cm-highlight cm-hl-green', 'green')).toBe(true);
    expect(result.filter((item) => item.kind === 'hide' && item.at === '==')).toHaveLength(3);
    expect(result.some((item) => item.kind === 'hide' && item.at === '==🟢')).toBe(true);
  });

  it('draw a wikilink as its alias and an embedded vault image as the image', () => {
    const link = drawn('See [[Paxos Made Simple|the paper]].\n\nEnd');
    expect(has(link, 'hide', '', '[[Paxos Made Simple|')).toBe(true);
    expect(has(link, 'hide', '', ']]')).toBe(true);
    const image = drawn('![[diagram.png|120]]\n\nEnd');
    expect(has(image, 'widget', 'ImageWidget')).toBe(true);
    // An embed that is not a known image stays as text, styled.
    expect(has(drawn('![[Missing.png]]\n\nEnd'), 'mark', 'cm-embed')).toBe(true);
  });

  it('draw inline maths as a formula, except where the cursor is', () => {
    const doc = 'We have $e^{i\\pi}+1=0$ here.\n\nEnd';
    expect(has(drawn(doc), 'widget', 'MathWidget')).toBe(true);
    expect(has(drawn(doc, doc.indexOf('pi')), 'mark', 'cm-math-source')).toBe(true);
    // "$5 and $6" is money, not maths.
    expect(has(drawn('Costs $5 and $6 today.\n\nEnd'), 'widget', 'MathWidget')).toBe(false);
  });

  it('style footnotes, inline footnotes, block ids and comments', () => {
    const doc =
      'Claim[^1] and^[an aside] here ^quote-1\n\n[^1]: Source.\n\n%% hidden\nnote %%\n\nEnd';
    const result = drawn(doc);
    expect(has(result, 'mark', 'cm-footnote-ref', '1')).toBe(true);
    expect(has(result, 'mark', 'cm-inline-footnote', '^[an aside]')).toBe(true);
    expect(has(result, 'mark', 'cm-block-id', '^quote-1')).toBe(true);
    expect(has(result, 'mark', 'cm-footnote-label', '[^1]:')).toBe(true);
    expect(
      result.some((item) => item.detail === 'cm-comment' && item.at.startsWith('%% hidden')),
    ).toBe(true);
  });

  it('draw a rule as a line and a code block as a well, leaving what is inside code alone', () => {
    expect(has(drawn('Above\n\n---\n\nBelow\n\nEnd'), 'line', 'cm-hr')).toBe(true);
    const code = drawn('```md\n==not highlighted== and [[not a link]]\n```\n\nEnd');
    expect(code.filter((item) => item.detail.startsWith('cm-codeblock'))).toHaveLength(3);
    expect(code.some((item) => item.detail.startsWith('cm-highlight'))).toBe(false);
    expect(code.some((item) => item.kind === 'hide')).toBe(false);
  });
});

describe('tables and display maths', () => {
  const table = '| Crop | Classes |\n|---|---|\n| Bell pepper | 2 |\n| Potato | 3 |';
  const decorations = (view: EditorView) => {
    const found: { from: number; to: number; name: string }[] = [];
    view.state.field(liveBlocksField).between(0, view.state.doc.length, (from, to, deco) => {
      const widget = (deco.spec as { widget?: { constructor: { name: string } } }).widget;
      found.push({ from, to, name: widget?.constructor.name ?? '' });
    });
    return found;
  };

  it('draws a table as a table while the cursor is elsewhere', () => {
    const doc = `Before\n\n${table}\n\nAfter`;
    const view = viewOf(doc);
    expect(decorations(view)).toEqual([
      { from: doc.indexOf('| Crop'), to: doc.indexOf('\n\nAfter'), name: 'TableWidget' },
    ]);
    const cells = [...view.dom.querySelectorAll('.cm-table-widget tbody td')].map(
      (cell) => cell.textContent,
    );
    expect(cells).toEqual(['Bell pepper', '2', 'Potato', '3']);
    const heads = [...view.dom.querySelectorAll('.cm-table-widget th')].map((c) => c.textContent);
    expect(heads).toEqual(['Crop', 'Classes']);
  });

  it('shows the source of the table the cursor is in, and a click goes to the clicked row', () => {
    const doc = `Before\n\n${table}\n\nAfter`;
    expect(decorations(viewOf(doc, doc.indexOf('Potato')))).toEqual([]);
    const view = viewOf(doc);
    click(view.dom.querySelectorAll('.cm-table-widget tbody tr')[1]);
    expect(view.state.selection.main.head).toBe(doc.indexOf('| Potato'));
  });

  it('draws display maths filling its lines, and not maths in a sentence', () => {
    const doc = 'Intro\n\n$$\n\\frac{a}{b}\n$$\n\nEnd';
    expect(decorations(viewOf(doc)).map((entry) => entry.name)).toEqual(['MathWidget']);
    expect(decorations(viewOf('Inline $$x$$ here\n\nEnd'))).toEqual([]);
  });

  it('leaves tables in quotes and lists as source', () => {
    const quoted = table
      .split('\n')
      .map((row) => `> ${row}`)
      .join('\n');
    expect(decorations(viewOf(`${quoted}\n\nEnd`))).toEqual([]);
  });
});
