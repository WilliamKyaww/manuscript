import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithRouter } from '../../../test/renderWithRouter';
import { useNotesUi } from '../notes-store';
import { MarkdownPreview } from './MarkdownPreview';
import type { PreviewTarget } from './remark-obsidian';

/** The Markdown of Obsidian in the reading view (Phase 25): what each element is drawn as. */

const NOTE_ID = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7';
const OTHER_ID = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A8';

function resolve(target: string): PreviewTarget {
  if (target.toLowerCase() === 'raft') return { kind: 'note', id: OTHER_ID, path: 'Raft.md' };
  if (target === 'diagram.png')
    return { kind: 'attachment', path: 'Attachments/diagram.png', mediaType: 'image/png' };
  if (target === 'slides.pdf')
    return { kind: 'attachment', path: 'Sources/slides.pdf', mediaType: 'application/pdf' };
  return { kind: 'unresolved' };
}

/** The router mounts the page a moment after the first render, so wait for the body to appear. */
async function preview(content: string): Promise<HTMLElement> {
  const result = renderWithRouter(
    <MarkdownPreview content={content} resolve={resolve} noteId={NOTE_ID} />,
  );
  return await waitFor(() => {
    const body = result.container.querySelector<HTMLElement>('.markdown-body');
    if (!body) throw new Error('The preview has not rendered yet');
    return body;
  });
}

beforeEach(() => {
  localStorage.clear();
  useNotesUi.setState({ strictLineBreaks: false });
});

describe('line breaks', () => {
  it('shows a single line break as one, as Obsidian does by default', async () => {
    const body = await preview('first line\nsecond line\n\nnew paragraph');
    await waitFor(() => expect(body.querySelectorAll('p')).toHaveLength(2));
    expect(body.querySelectorAll('p')[0]?.querySelectorAll('br')).toHaveLength(1);
  });

  it('keeps standard Markdown when strict line breaks are on', async () => {
    useNotesUi.setState({ strictLineBreaks: true });
    const body = await preview('first line\nsecond line');
    await waitFor(() => expect(body.querySelector('p')).not.toBeNull());
    expect(body.querySelectorAll('br')).toHaveLength(0);
  });

  it('does not touch code', async () => {
    const body = await preview('```\none\ntwo\n```\n\n`a\nb`');
    await waitFor(() => expect(body.querySelector('pre')).not.toBeNull());
    expect(body.querySelector('pre code')?.textContent).toBe('one\ntwo\n');
  });
});

describe('callouts', () => {
  it('draws a type by its canonical name, with an alias, its label and its icon hook', async () => {
    const body = await preview(
      '> [!faq] Why?\n> Because.\n\n> [!hint]\n> Try it.\n\n> [!mystery]\n> ?',
    );
    await waitFor(() => expect(body.querySelectorAll('.callout')).toHaveLength(3));
    const kinds = [...body.querySelectorAll('.callout')].map((c) => c.getAttribute('data-callout'));
    expect(kinds).toEqual(['question', 'tip', 'note']);
    const titles = [...body.querySelectorAll('.callout-title')].map((t) => t.textContent);
    expect(titles).toEqual(['Why?', 'Hint', 'Mystery']);
  });

  it('folds a callout with + or -', async () => {
    const body = await preview('> [!tip]- Hidden\n> Inside\n\n> [!tip]+ Open\n> Inside');
    await waitFor(() => expect(body.querySelectorAll('details')).toHaveLength(2));
    const [closed, open] = [...body.querySelectorAll('details')];
    expect(closed?.hasAttribute('open')).toBe(false);
    expect(open?.hasAttribute('open')).toBe(true);
  });
});

describe('highlights, footnotes, tasks and block ids', () => {
  it('colours a highlight by the emoji after its opening marks', async () => {
    const body = await preview('==plain== ==🟢green== ==🟣purple==');
    await waitFor(() => expect(body.querySelectorAll('mark')).toHaveLength(3));
    const marks = [...body.querySelectorAll('mark')];
    expect(marks.map((m) => m.textContent)).toEqual(['plain', 'green', 'purple']);
    expect(marks.map((m) => m.className)).toEqual(['', 'hl-green', 'hl-purple']);
  });

  it('numbers inline footnotes and lists them at the end', async () => {
    const body = await preview('A claim^[first aside] and another^[second aside].');
    await waitFor(() => expect(body.querySelectorAll('sup.inline-footnote')).toHaveLength(2));
    expect([...body.querySelectorAll('sup.inline-footnote')].map((s) => s.textContent)).toEqual([
      '1',
      '2',
    ]);
    const items = body.querySelectorAll('section.inline-footnotes li');
    expect([...items].map((item) => item.textContent?.trim())).toEqual([
      'first aside',
      'second aside',
    ]);
  });

  it('numbers inline footnotes after the ordinary footnotes', async () => {
    const body = await preview('One[^a] and two^[inline].\n\n[^a]: Defined.');
    await waitFor(() => expect(body.querySelector('sup.inline-footnote')).not.toBeNull());
    expect(body.querySelector('sup.inline-footnote')?.textContent).toBe('2');
    expect(body.querySelector('section.inline-footnotes ol')?.getAttribute('start')).toBe('2');
  });

  it('draws the footnotes of GFM, tasks, and a status other than done or open', async () => {
    const body = await preview(
      'Text[^1]\n\n[^1]: The note.\n\n- [ ] open\n- [x] done\n- [?] unsure\n- [-] dropped',
    );
    await waitFor(() => expect(body.querySelectorAll('li.task-list-item').length).toBe(4));
    expect(body.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    const marks = [...body.querySelectorAll('.task-mark')];
    expect(marks.map((m) => m.getAttribute('data-task'))).toEqual(['?', '-']);
    expect(body.querySelector('section.footnotes')).not.toBeNull();
  });

  it('hides a block id and gives the block that id, also when it is on a line of its own', async () => {
    const body = await preview('A quoted paragraph. ^quote-1\n\n- one\n- two\n\n^my-list\n\nEnd');
    await waitFor(() => expect(body.querySelector('[id="^quote-1"]')).not.toBeNull());
    expect(body.textContent).not.toContain('^quote-1');
    expect(body.textContent).not.toContain('^my-list');
    expect(body.querySelector('[id="^my-list"]')?.tagName).toBe('UL');
  });
});

describe('links, images and embeds', () => {
  it('links to the innermost heading of a nested heading link, and to a block', async () => {
    await preview('[[Raft#Safety#Election safety]] and [[Raft#^quote-1|the quote]]');
    const heading = await screen.findByRole('link', { name: 'Raft › Election safety' });
    expect(heading).toHaveAttribute('href', `/notes/${OTHER_ID}#election-safety`);
    // The router encodes the caret in the address and decodes it again before it looks for the block.
    const block = screen.getByRole('link', { name: 'the quote' });
    expect(decodeURIComponent(block.getAttribute('href') ?? '')).toBe(
      `/notes/${OTHER_ID}#^quote-1`,
    );
  });

  it('sizes a Markdown image with |width or |widthxheight in its text', async () => {
    const body = await preview('![diagram|300](diagram.png) ![small|40x30](diagram.png)');
    await waitFor(() => expect(body.querySelectorAll('img')).toHaveLength(2));
    const [wide, small] = [...body.querySelectorAll('img')];
    expect(wide?.getAttribute('width')).toBe('300');
    expect(wide?.getAttribute('alt')).toBe('diagram');
    expect(small?.getAttribute('width')).toBe('40');
    expect(small?.getAttribute('height')).toBe('30');
  });

  it('opens an embedded PDF at its page and sets the frame’s height', async () => {
    await preview('![[slides.pdf#page=3&height=400]]');
    const frame = await screen.findByTitle('PDF: slides.pdf');
    expect(frame).toHaveAttribute('src', '/api/files/Sources/slides.pdf#page=3');
    expect((frame as HTMLElement).style.height).toBe('400px');
  });
});

describe('tables, maths and the rest of GFM', () => {
  it('draws a table with its alignment, wikilinks and inline formatting', async () => {
    const body = await preview(
      '| Left | Right |\n|:-----|------:|\n| **bold** | [[Raft]] |\n| `code` | ==mark== |',
    );
    await waitFor(() => expect(body.querySelector('table')).not.toBeNull());
    const heads = [...body.querySelectorAll<HTMLElement>('th')];
    expect(heads.map((h) => h.style.textAlign)).toEqual(['left', 'right']);
    expect(body.querySelector('td strong')?.textContent).toBe('bold');
    expect(body.querySelector('td a.wikilink')).not.toBeNull();
    expect(body.querySelector('td mark')?.textContent).toBe('mark');
  });

  it('draws maths, strikethrough, autolinks and horizontal rules', async () => {
    const body = await preview(
      'Euler: $e^{i\\pi}+1=0$ and ~~old~~ <https://example.org>\n\n---\n\n$$x^2$$',
    );
    await waitFor(() => expect(body.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2));
    expect(body.querySelector('del')?.textContent).toBe('old');
    expect(body.querySelector('a[href="https://example.org"]')).not.toBeNull();
    expect(body.querySelector('hr')).not.toBeNull();
  });
});
