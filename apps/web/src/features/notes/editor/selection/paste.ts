import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { useEditorPrefs } from '../editor-prefs';

/**
 * Pasting rich text (Phase 26), as Obsidian does: text copied from a web page, a document or the
 * reading view keeps its headings, lists, links, emphasis, code and tables as Markdown. Ctrl+Shift+V
 * pastes plain text. Text from a code editor (VS Code) or with nothing worth keeping stays as it was.
 */

/** Tags that make converting worth it: without any of these, the plain text says it all. */
const RICH =
  /<(?:p|h[1-6]|ul|ol|li|a|strong|b|em|i|u|s|del|table|blockquote|pre|code|img|hr)[\s>]/iu;

let service: TurndownService | null = null;

function turndown(): TurndownService {
  if (service) return service;
  service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    hr: '---',
    linkStyle: 'inlined',
  });
  service.use(gfm);
  service.remove(['script', 'style', 'noscript', 'title', 'meta', 'link', 'template']);
  // Google Docs wraps a whole copy in <b style="font-weight:normal">: that is not bold.
  service.addRule('not-bold', {
    filter: (node) =>
      node.nodeName === 'B' && /font-weight:\s*normal/iu.test(node.getAttribute('style') ?? ''),
    replacement: (content) => content,
  });
  // List items as Obsidian writes them: `- item` and `1. item`, nested by the marker's width.
  service.addRule('list-item', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as Element | null;
      let prefix = `${options.bulletListMarker ?? '-'} `;
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') ?? '1') || 1;
        prefix = `${start + Array.prototype.indexOf.call(parent.children, node)}. `;
      }
      const body = content
        .replace(/^\n+/u, '')
        // A task's box and a space after it, however many spaces the page had.
        .replace(/^\[([ xX])\]\s+/u, '[$1] ')
        .replace(/\n+$/u, '\n')
        .replace(/\n/gmu, `\n${' '.repeat(prefix.length)}`);
      return prefix + body + (node.nextSibling && !body.endsWith('\n') ? '\n' : '');
    },
  });
  // Obsidian's highlight for <mark>, and underline kept as the HTML Obsidian uses.
  service.addRule('mark', { filter: ['mark'], replacement: (content) => `==${content}==` });
  service.addRule('underline', {
    filter: ['u', 'ins'],
    replacement: (content) => `<u>${content}</u>`,
  });
  return service;
}

/** Markdown for pasted HTML, or null when the plain text is the better paste. */
export function htmlToMarkdown(html: string, plain: string): string | null {
  if (!RICH.test(html)) return null;
  const markdown = turndown()
    .turndown(html)
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (markdown === '') return null;
  // A single line pasted without formatting reads the same either way: keep the text as copied.
  if (markdown === plain.trim()) return null;
  return markdown;
}

/** Whether a paste came from a code editor, whose HTML is colours and spans around plain text. */
export function fromCodeEditor(types: readonly string[]): boolean {
  return types.includes('vscode-editor-data') || types.includes('application/x-vnd.jetbrains');
}

/** The next paste is plain text (Ctrl+Shift+V, or "Paste as plain text"). */
let plainNext = false;

export function insertText(view: EditorView, text: string): void {
  const insert = view.state.toText(text.replace(/\r\n?/gu, '\n'));
  view.dispatch(view.state.replaceSelection(insert), {
    scrollIntoView: true,
    userEvent: 'input.paste',
  });
}

export function pasteHandling(): Extension {
  return [
    keymap.of([
      {
        key: 'Mod-Shift-v',
        // The browser's own paste follows; this only says that it is to be plain.
        run: () => {
          plainNext = true;
          return false;
        },
      },
    ]),
    EditorView.domEventHandlers({
      paste(event, view) {
        const plain = plainNext;
        plainNext = false;
        const data = event.clipboardData;
        if (!data || plain || data.files.length > 0 || view.state.readOnly) return false;
        if (!useEditorPrefs.getState().convertPastedHtml || fromCodeEditor([...data.types]))
          return false;
        const html = data.getData('text/html');
        if (!html) return false;
        const markdown = htmlToMarkdown(html, data.getData('text/plain'));
        if (markdown === null) return false;
        event.preventDefault();
        insertText(view, markdown);
        return true;
      },
    }),
  ];
}
