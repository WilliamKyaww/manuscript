import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { editLinkAddress, linkInteraction } from './link-interaction';
import { linkAt } from './links';
import { liveItems, livePreview } from './live-preview';

/** Web links in the editor (Phase 26): finding them, drawing them, clicking them. */

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

function stateOf(doc: string) {
  const state = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] });
  ensureSyntaxTree(state, doc.length, 5_000);
  return state;
}

function viewOf(doc: string, cursor = doc.length, open = vi.fn()) {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [
      markdown({ base: markdownLanguage }),
      livePreview,
      linkInteraction(() => ({ openWebLink: open })),
    ],
  });
  ensureSyntaxTree(state, doc.length, 5_000);
  const view = new EditorView({ state, parent: document.body });
  views.push(view);
  return { view, open };
}

describe('finding links', () => {
  it('finds Markdown links, autolinks and bare addresses, not wikilinks', () => {
    const doc =
      '[Research paper](https://www.sciencedirect.com/x) <https://example.org> www.example.com [[Note]]';
    const state = stateOf(doc);
    const markdownLink = linkAt(state, 3);
    expect(markdownLink).toMatchObject({
      kind: 'markdown',
      href: 'https://www.sciencedirect.com/x',
      text: { from: 1, to: 15 },
    });
    expect(state.sliceDoc(markdownLink?.address.from, markdownLink?.address.to)).toBe(
      'https://www.sciencedirect.com/x',
    );
    expect(linkAt(state, doc.indexOf('example.org'))).toMatchObject({
      kind: 'autolink',
      href: 'https://example.org/',
    });
    expect(linkAt(state, doc.indexOf('www.example.com') + 2)).toMatchObject({
      kind: 'bare',
      href: 'https://www.example.com/',
    });
    expect(linkAt(state, doc.indexOf('Note'))).toBeNull();
    expect(linkAt(stateOf('[notes](Raft.md)'), 2)).toMatchObject({ href: null, url: 'Raft.md' });
  });
});

describe('drawing web links', () => {
  const widgets = (view: EditorView) =>
    liveItems(view).flatMap(({ deco }) => {
      const widget = (deco.spec as { widget?: { constructor: { name: string } } }).widget;
      return widget ? [widget.constructor.name] : [];
    });

  it('draws a link as its words with the external mark, until the cursor is in it', () => {
    const doc = 'Read [the paper](https://example.org/p) today.\n\nEnd';
    const { view } = viewOf(doc);
    expect(widgets(view)).toContain('ExternalMarkWidget');
    expect(view.contentDOM.querySelector('[data-href="https://example.org/p"]')?.textContent).toBe(
      'the paper',
    );
    const touched = viewOf(doc, doc.indexOf('paper')).view;
    expect(widgets(touched)).not.toContain('ExternalMarkWidget');
  });

  it('draws a GitHub address as a mention, and GitHub words with the mark before them', () => {
    const bare = viewOf(
      'GitHub repos: https://github.com/owner/plant-disease-detection\n\nEnd',
    ).view;
    expect(widgets(bare)).toContain('GitHubChipWidget');
    expect(bare.contentDOM.querySelector('.cm-github-chip')?.textContent).toBe(
      'plant-disease-detection',
    );
    const worded = viewOf('See [our code](https://github.com/owner/repo).\n\nEnd').view;
    expect(widgets(worded)).toContain('GitHubMarkWidget');
    expect(worded.contentDOM.querySelector('.cm-github-text')?.textContent).toBe('our code');
  });
});

describe('clicking web links', () => {
  const mousedown = (element: Element | null | undefined, init: MouseEventInit = {}) =>
    element?.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ...init }),
    );

  it('opens a drawn link beside the note, or in the browser with Ctrl', () => {
    const { view, open } = viewOf('Read [the paper](https://example.org/p).\n\nEnd');
    const link = view.contentDOM.querySelector('[data-href]');
    mousedown(link);
    expect(open).toHaveBeenLastCalledWith('https://example.org/p', false);
    mousedown(link, { ctrlKey: true });
    expect(open).toHaveBeenLastCalledWith('https://example.org/p', true);
  });

  it('Edit selects the address, which shows the source', () => {
    const doc = 'Read [the paper](https://example.org/p).\n\nEnd';
    const { view } = viewOf(doc);
    editLinkAddress(view, doc.indexOf('the'));
    const { from, to } = view.state.selection.main;
    expect(view.state.sliceDoc(from, to)).toBe('https://example.org/p');
  });
});
