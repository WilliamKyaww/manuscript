import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter } from '../../../test/renderWithRouter';
import { MarkdownPreview } from './MarkdownPreview';
import type { PreviewTarget } from './remark-obsidian';

const NOTE_ID = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7';
const OTHER_ID = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A8';

function resolve(target: string): PreviewTarget {
  if (target.toLowerCase().replace(/\.md$/, '') === 'raft')
    return { kind: 'note', id: OTHER_ID, path: 'Raft.md' };
  if (target === 'diagram.png')
    return { kind: 'attachment', path: 'Attachments/diagram.png', mediaType: 'image/png' };
  if (target === 'slides.pdf')
    return { kind: 'attachment', path: 'Sources/slides.pdf', mediaType: 'application/pdf' };
  return { kind: 'unresolved' };
}

function renderPreview(content: string, onCreateNote = vi.fn()) {
  const result = renderWithRouter(
    <MarkdownPreview
      content={content}
      resolve={resolve}
      noteId={NOTE_ID}
      onCreateNote={onCreateNote}
    />,
  );
  return { ...result, onCreateNote };
}

describe('MarkdownPreview', () => {
  it('renders wikilinks to notes, files and missing notes', async () => {
    const user = userEvent.setup();
    const { onCreateNote, router } = renderPreview(
      'See [[Raft#Safety|safety]], [[slides.pdf]] and [[Byzantine]].',
    );
    const resolved = await screen.findByRole('link', { name: 'safety' });
    expect(resolved).toHaveAttribute('href', `/notes/${OTHER_ID}#safety`);
    expect(screen.getByRole('link', { name: 'slides.pdf' })).toHaveAttribute(
      'href',
      '/api/files/Sources/slides.pdf',
    );
    const missing = screen.getByRole('button', { name: 'Byzantine' });
    expect(missing).toHaveClass('wikilink-unresolved');
    await user.click(missing);
    expect(onCreateNote).toHaveBeenCalledWith('Byzantine');
    await user.click(resolved);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/notes/${OTHER_ID}`));
  });

  it('embeds images and files and resolves relative Markdown links', async () => {
    renderPreview(
      '![[diagram.png|300]]\n\n![[slides.pdf#page=3]]\n\n[raft notes](Raft.md) and ![alt](diagram.png)',
    );
    const images = await screen.findAllByRole('img');
    expect(images[0]).toHaveAttribute('src', '/api/files/Attachments/diagram.png');
    expect(images[0]).toHaveAttribute('width', '300');
    expect(screen.getByTitle('PDF: slides.pdf')).toHaveAttribute(
      'src',
      '/api/files/Sources/slides.pdf#page=3',
    );
    expect(screen.getByRole('link', { name: 'raft notes' })).toHaveAttribute(
      'href',
      `/notes/${OTHER_ID}`,
    );
    expect(images[1]).toHaveAttribute('src', '/api/files/Attachments/diagram.png');
  });

  it('renders callouts, highlights, tags and maths but not comments or currency', async () => {
    const { container } = renderPreview(
      '> [!warning] Exam tip\n> Revise **Paxos**.\n\n==important== #exam\n\nArea $\\pi r^2$ costs $5 and $6. %% secret %%\n\n$$\nx^2\n$$',
    );
    await screen.findByText('Exam tip');
    expect(container.querySelector('.callout.callout-warning .callout-title')).toHaveTextContent(
      'Exam tip',
    );
    expect(container.querySelector('.callout-content')).toHaveTextContent('Revise Paxos.');
    expect(container.querySelector('mark')).toHaveTextContent('important');
    expect(container.querySelector('.tag')).toHaveTextContent('#exam');
    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('.katex-display')).not.toBeNull();
    expect(container.textContent).toContain('costs $5 and $6.');
    expect(container.textContent).not.toContain('secret');
  });

  it('renders foldable callouts as details', async () => {
    const { container } = renderPreview('> [!faq]- Why?\n> Because.');
    await screen.findByText('Why?');
    const details = container.querySelector('details.callout');
    expect(details).not.toBeNull();
    expect(details?.querySelector('summary')).toHaveTextContent('Why?');
    expect(details?.hasAttribute('open')).toBe(false);
  });

  it('highlights code and gives headings anchor ids', async () => {
    const { container } = renderPreview('# Leader election\n\n```ts\nconst x = 1;\n```');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Leader election' }),
    ).toHaveAttribute('id', 'leader-election');
    expect(container.querySelector('code.language-ts .hljs-keyword')).toHaveTextContent('const');
  });

  it('sanitises raw HTML and blocks external images', async () => {
    const { container } = renderPreview(
      '<script>window.hacked = true</script><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">bad</a><iframe src="https://example.com"></iframe>\n\n![remote](https://example.com/pixel.png)\n\n<details><summary>More</summary>Hidden</details>',
    );
    await screen.findByText('More');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(screen.getByText('bad').getAttribute('href') ?? '').not.toContain('javascript');
    expect(screen.getByText(/External image not loaded/)).toBeInTheDocument();
    expect(container.querySelector('img[src^="https://"]')).toBeNull();
    expect((window as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it('renders GFM tables, task lists and footnotes', async () => {
    const { container } = renderPreview(
      '| A | B |\n|---|---|\n| [[Raft\\|R]] | 2 |\n\n- [x] done\n- [ ] todo\n\nText[^1]\n\n[^1]: Note.',
    );
    await screen.findByRole('table');
    expect(screen.getByRole('link', { name: 'R' })).toHaveAttribute('href', `/notes/${OTHER_ID}`);
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    expect(container.querySelector('.footnotes')).not.toBeNull();
  });
});
