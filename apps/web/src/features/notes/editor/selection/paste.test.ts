import { describe, expect, it } from 'vitest';
import { suggestTitle } from './ExtractDialog';
import { fromCodeEditor, htmlToMarkdown } from './paste';

/** Pasting rich text as Markdown (Phase 26), and the title an extracted note is offered. */

describe('pasting HTML', () => {
  it('keeps headings, emphasis, links, lists and code as Markdown', () => {
    const html =
      '<h2>Results</h2><p>Models are <strong>accurate</strong> on <em>lab</em> photos, see <a href="https://example.org/p">the paper</a>.</p><ul><li>CNN</li><li>ViT</li></ul><pre><code>train()</code></pre>';
    expect(htmlToMarkdown(html, 'Results Models are accurate…')).toBe(
      [
        '## Results',
        '',
        'Models are **accurate** on *lab* photos, see [the paper](https://example.org/p).',
        '',
        '- CNN',
        '- ViT',
        '',
        '```',
        'train()',
        '```',
      ].join('\n'),
    );
  });

  it('writes nested and numbered lists and tasks as Obsidian does', () => {
    expect(
      htmlToMarkdown(
        '<ol start="3"><li>Three<ul><li>Sub</li></ul></li><li>Four</li></ol><ul><li><input type="checkbox" checked> Done</li></ul>',
        '',
      ),
    ).toBe('3. Three\n   - Sub\n4. Four\n\n- [x] Done');
  });

  it('turns tables into GFM tables, marks into highlights, and keeps underline', () => {
    const table =
      '<table><thead><tr><th>Model</th><th>Accuracy</th></tr></thead><tbody><tr><td>CNN</td><td>99%</td></tr></tbody></table>';
    expect(htmlToMarkdown(table, '')).toBe('| Model | Accuracy |\n| --- | --- |\n| CNN | 99% |');
    expect(htmlToMarkdown('<p><mark>key</mark> and <u>this</u></p>', 'key and this')).toBe(
      '==key== and <u>this</u>',
    );
  });

  it('leaves plain pastes alone, and does not make a Google Docs copy bold', () => {
    expect(htmlToMarkdown('<span style="color:red">just text</span>', 'just text')).toBeNull();
    expect(htmlToMarkdown('<p>same</p>', 'same')).toBeNull();
    expect(
      htmlToMarkdown(
        '<b style="font-weight:normal;" id="docs-internal-guid-1"><p>One</p><p>Two</p></b>',
        'One\nTwo',
      ),
    ).toBe('One\n\nTwo');
    expect(htmlToMarkdown('<script>alert(1)</script><p>Safe <b>bold</b></p>', 'Safe bold')).toBe(
      'Safe **bold**',
    );
  });

  it('recognises a code editor’s copy, which stays plain text', () => {
    expect(fromCodeEditor(['text/plain', 'text/html', 'vscode-editor-data'])).toBe(true);
    expect(fromCodeEditor(['text/plain', 'text/html'])).toBe(false);
  });
});

describe('extracting a selection', () => {
  it('offers its heading, or its first words, as the new note’s title', () => {
    expect(suggestTitle('## Grad-CAM\nShows where the model looks.')).toBe('Grad-CAM');
    expect(suggestTitle('Monte Carlo dropout flags predictions the model is unsure about.')).toBe(
      'Monte Carlo dropout flags predictions the',
    );
    expect(suggestTitle('**  **')).toBe('Extracted note');
  });
});
