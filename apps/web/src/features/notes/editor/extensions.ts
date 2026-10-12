import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  temporarilySetTabFocusMode,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  MatchDecorator,
  placeholder,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { analyseNote } from '@skb/core/markdown';
import { frontmatterStyle } from './frontmatter';

/**
 * CodeMirror 6 set-up for notes (task 3.14, ADR-0009): Markdown with GFM and highlighted code
 * blocks, Obsidian wikilinks and tags, completions for `[[` and `#`, and a theme that follows the
 * app's colour tokens (light and dark).
 */

export interface CompletionData {
  /** Notes to offer after `[[` (name = file name without .md). */
  notes(): readonly { name: string; title: string; folder: string; aliases: readonly string[] }[];
  /** Attachments to offer after `![[`. */
  attachments(): readonly { name: string; folder: string }[];
  tags(): readonly string[];
}

export interface EditorCallbacks {
  onChange(text: string): void;
  onSave(): void;
  /** Ctrl/Cmd+click on a wikilink. */
  onFollowLink(target: string): void;
  /** Files pasted or dropped into the editor (attachments to upload). */
  onFiles(files: File[], at: number): void;
}

const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--skb-text)',
    backgroundColor: 'transparent',
    fontSize: '15px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--skb-font-sans)', lineHeight: '1.65', overflow: 'auto' },
  '.cm-content': {
    padding: '20px 0 40vh',
    maxWidth: '46rem',
    margin: '0 auto',
    // The caret takes the palette's accent, as the rest of the selection does.
    caretColor: 'var(--skb-accent)',
  },
  '.cm-line': { padding: '0 24px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--skb-accent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: 'var(--skb-accent-subtle)' },
  '.cm-activeLine': { backgroundColor: 'var(--skb-active-line)' },
  '.cm-wikilink': {
    color: 'var(--skb-accent)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
  '.cm-hashtag': {
    color: 'var(--skb-accent)',
    backgroundColor: 'var(--skb-accent-subtle)',
    borderRadius: '4px',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--skb-surface-raised)',
    color: 'var(--skb-text)',
    border: '1px solid var(--skb-border)',
    borderRadius: '6px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--skb-accent-subtle)',
    color: 'var(--skb-text)',
  },
  '.cm-completionDetail': {
    color: 'var(--skb-text-muted)',
    marginLeft: '0.75em',
    fontStyle: 'normal',
  },
  '.cm-panels': { backgroundColor: 'var(--skb-surface)', color: 'var(--skb-text)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--skb-border)' },
  '.cm-searchMatch': { backgroundColor: 'var(--skb-warning-subtle)' },
  '.cm-placeholder': { color: 'var(--skb-text-subtle)' },
});

const highlighting = HighlightStyle.define([
  { tag: t.heading1, fontSize: '1.6em', fontWeight: '700' },
  { tag: t.heading2, fontSize: '1.35em', fontWeight: '700' },
  { tag: t.heading3, fontSize: '1.15em', fontWeight: '650' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '650' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--skb-accent)' },
  { tag: t.quote, color: 'var(--skb-text-muted)' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--skb-text-subtle)' },
  { tag: t.monospace, fontFamily: 'var(--skb-font-mono)', fontSize: '0.9em' },
  { tag: [t.keyword, t.modifier], color: 'var(--skb-accent)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--skb-success)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--skb-warning)' },
  {
    tag: [t.comment, t.blockComment, t.lineComment],
    color: 'var(--skb-text-subtle)',
    fontStyle: 'italic',
  },
  { tag: [t.typeName, t.className], color: 'var(--skb-info)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--skb-info)' },
  { tag: t.invalid, color: 'var(--skb-danger)' },
]);

function decorationPlugin(regexp: RegExp, className: string): Extension {
  const decorator = new MatchDecorator({
    regexp,
    decoration: Decoration.mark({ class: className }),
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

const WIKILINK = /!?\[\[[^[\]\n]+\]\]/g;
const HASHTAG = /(?<=^|[\s([{,;:!?"'])#[\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*/gmu;

/** The wikilink target under a document position, if any. */
function wikilinkAt(view: EditorView, pos: number): string | null {
  const line = view.state.doc.lineAt(pos);
  for (const match of line.text.matchAll(WIKILINK)) {
    const start = line.from + (match.index ?? 0);
    if (pos >= start && pos <= start + match[0].length) {
      const inner = match[0].replace(/^!?\[\[|\]\]$/g, '');
      return inner.split(/\\?\|/)[0]?.trim() ?? null;
    }
  }
  return null;
}

function completionSource(data: CompletionData) {
  return (context: CompletionContext): CompletionResult | null => {
    const link = context.matchBefore(/(!?)\[\[([^[\]|\n]*)$/);
    if (link) {
      const embed = link.text.startsWith('!');
      const query = link.text.slice(embed ? 3 : 2);
      const from = link.to - query.length;
      const closing = context.state.sliceDoc(context.pos, context.pos + 2) === ']]' ? '' : ']]';
      if (query.startsWith('#')) {
        const headings = analyseNote(context.state.doc.toString()).headings;
        return {
          from: from + 1,
          options: headings.map((heading) => ({
            label: heading.text,
            type: 'text',
            apply: `${heading.text}${closing}`,
          })),
        };
      }
      const options: Completion[] = [];
      for (const note of data.notes()) {
        options.push({
          label: note.name,
          detail: note.folder || undefined,
          info: note.title !== note.name ? note.title : undefined,
          type: 'class',
          apply: `${note.name}${closing}`,
        });
        for (const alias of note.aliases) {
          options.push({
            label: alias,
            detail: `→ ${note.name}`,
            type: 'variable',
            apply: `${note.name}|${alias}${closing}`,
          });
        }
      }
      if (embed) {
        for (const file of data.attachments()) {
          options.push({
            label: file.name,
            detail: file.folder || undefined,
            type: 'constant',
            apply: `${file.name}${closing}`,
          });
        }
      }
      return { from, options, validFor: /^[^[\]|\n]*$/ };
    }
    const tag = context.matchBefore(/(?<=^|[\s([{,;:!?"'])#[\p{L}\p{N}_\-/]*$/u);
    if (tag && (tag.text.length > 1 || context.explicit)) {
      const known = new Set([...data.tags(), ...analyseNote(context.state.doc.toString()).tags]);
      return {
        from: tag.from + 1,
        options: [...known].map((name) => ({ label: name, type: 'keyword' })),
        validFor: /^[\p{L}\p{N}_\-/]*$/u,
      };
    }
    return null;
  };
}

export interface EditorSetup {
  data: CompletionData;
  callbacks: () => EditorCallbacks;
  readOnly: boolean;
  /** `'\r\n'` keeps Windows line endings when saving; `null` uses `\n`. */
  lineSeparator: '\r\n' | null;
  /** Extensions the host reconfigures later (live preview), kept in their own compartment. */
  extra?: Extension[];
}

export function createExtensions({
  data,
  callbacks,
  readOnly,
  lineSeparator,
  extra = [],
}: EditorSetup): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
    syntaxHighlighting(highlighting),
    frontmatterStyle,
    ...extra,
    decorationPlugin(WIKILINK, 'cm-wikilink'),
    decorationPlugin(HASHTAG, 'cm-hashtag'),
    autocompletion({ override: [completionSource(data)], icons: false }),
    placeholder('Start writing… Use [[ to link a note and # for tags.'),
    theme,
    keymap.of([
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          callbacks().onSave();
          return true;
        },
      },
      {
        // Replace, as in Obsidian (task 23.08): the find bar with the cursor in its replace field.
        key: 'Mod-h',
        preventDefault: true,
        run: (view) => {
          openSearchPanel(view);
          view.dom.querySelector<HTMLInputElement>('.cm-search input[name="replace"]')?.focus();
          return true;
        },
      },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...completionKeymap,
      indentWithTab,
      // Escape then Tab leaves the editor, so keyboard users are never trapped (WCAG 2.1.2).
      { key: 'Escape', run: temporarilySetTabFocusMode },
    ]),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    ...(lineSeparator ? [EditorState.lineSeparator.of(lineSeparator)] : []),
    EditorView.contentAttributes.of({
      'aria-label': 'Note text',
      // Focusable even when read-only, so that its scroller can be scrolled from the keyboard.
      tabindex: '0',
      spellcheck: 'true',
      autocorrect: 'on',
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) callbacks().onChange(update.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (!(event.ctrlKey || event.metaKey) || event.button !== 0) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        const target = pos === null ? null : wikilinkAt(view, pos);
        if (target === null) return false;
        event.preventDefault();
        callbacks().onFollowLink(target);
        return true;
      },
      paste(event, view) {
        const files = [...(event.clipboardData?.files ?? [])];
        if (files.length === 0 || readOnly) return false;
        event.preventDefault();
        callbacks().onFiles(files, view.state.selection.main.head);
        return true;
      },
      drop(event, view) {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (files.length === 0 || readOnly) return false;
        event.preventDefault();
        const pos =
          view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
          view.state.selection.main.head;
        callbacks().onFiles(files, pos);
        return true;
      },
    }),
  ];
}
