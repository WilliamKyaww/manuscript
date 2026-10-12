import type { EditorView } from '@codemirror/view';
import type { WritingAction } from '@skb/core';
import {
  Bold,
  Code,
  Copy,
  FileOutput,
  Footprints,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareText,
  Minus,
  Pilcrow,
  Quote,
  Radical,
  RemoveFormatting,
  Scissors,
  Search,
  Sigma,
  Sparkles,
  SquareCode,
  SquarePlus,
  Strikethrough,
  Table,
  TextSelect,
  Underline,
  WandSparkles,
} from 'lucide-react';
import { keyLabels } from '../../../../app/shortcuts/registry';
import type { MenuEntry } from '../../../../components/MenuEntries';
import { isApplePlatform } from '../../../../lib/platform';
import {
  type Command,
  clearFormatting,
  type InlineFormat,
  setHighlight,
  toggleInline,
} from '../format';
import { type BlockKind, setBlock } from '../format-blocks';
import { insertSnippet, type Snippet } from '../format-insert';
import { copySelection, cutSelection, pasteFromClipboard } from './clipboard';

/**
 * What can be done with the selection (Phase 26), described once and drawn by the selection toolbar
 * and the editor's right-click menu alike — Obsidian's Format, Paragraph and Insert menus, Notion's
 * AI actions, and the study tools. Every entry is also a command or shortcut elsewhere (ui.md §7).
 */

export const keys = (shortcut: string) => keyLabels(shortcut, isApplePlatform()).join('+');

/** What the page around the editor offers the selection. */
export interface EditorTools {
  noteTitle: string;
  /** "Search for …": the vault's search with this text. */
  search(text: string): void;
  /** "Make a card" and "Generate" use the selection, as the study tools in the note's header do. */
  makeCard(): void;
  generate(): void;
  /** Creates a note with this text; resolves to the name to link to, or null if nothing was made. */
  extract(title: string, text: string): Promise<string | null>;
  /** A wikilink's target, opened in a new tab or the pane on the right. */
  openNote(target: string, where: 'here' | 'tab' | 'right'): void;
  /** A web link: beside the note, or in the browser. */
  openWeb(url: string, browser: boolean): void;
}

export interface SelectionContext {
  view: EditorView;
  readOnly: boolean;
  /** Whether AI can answer, and why not. */
  ai: { ready: boolean; reason: string | null };
  askAi(action: WritingAction, instruction?: string): void;
  /** Opens the box asking for an instruction ("Edit with AI…"). */
  askAiCustom(): void;
  extract(): void;
  setUpAi(): void;
  tools: EditorTools;
}

export function run(view: EditorView, command: Command): void {
  command({ state: view.state, dispatch: (transaction) => view.dispatch(transaction) });
  view.focus();
}

export const selectedText = (view: EditorView) => {
  const { from, to } = view.state.selection.main;
  return view.state.sliceDoc(from, to);
};

const ICON = 15;

export const INLINE_ENTRIES: {
  format: InlineFormat;
  label: string;
  icon: React.ReactNode;
  key?: string;
}[] = [
  { format: 'bold', label: 'Bold', icon: <Bold size={ICON} />, key: 'mod+b' },
  { format: 'italic', label: 'Italic', icon: <Italic size={ICON} />, key: 'mod+i' },
  { format: 'underline', label: 'Underline', icon: <Underline size={ICON} />, key: 'mod+u' },
  {
    format: 'strikethrough',
    label: 'Strikethrough',
    icon: <Strikethrough size={ICON} />,
    key: 'mod+shift+s',
  },
  {
    format: 'highlight',
    label: 'Highlight',
    icon: <Highlighter size={ICON} />,
    key: 'mod+shift+h',
  },
  { format: 'code', label: 'Code', icon: <Code size={ICON} />, key: 'mod+`' },
  { format: 'maths', label: 'Maths', icon: <Radical size={ICON} />, key: 'mod+shift+e' },
  {
    format: 'comment',
    label: 'Comment',
    icon: <MessageSquareText size={ICON} />,
    key: 'mod+shift+m',
  },
];

export function formatEntries(context: SelectionContext): MenuEntry[] {
  const { view, readOnly } = context;
  return [
    ...INLINE_ENTRIES.map(
      (entry): MenuEntry => ({
        label: entry.label,
        icon: entry.icon,
        hint: entry.key ? keys(entry.key) : undefined,
        disabled: readOnly,
        onSelect: () => run(view, toggleInline(entry.format)),
      }),
    ),
    {
      kind: 'submenu',
      label: 'Highlight colour',
      icon: <Highlighter size={ICON} />,
      disabled: readOnly,
      entries: highlightEntries(view),
    },
    { kind: 'separator' },
    {
      label: 'Clear formatting',
      icon: <RemoveFormatting size={ICON} />,
      disabled: readOnly,
      onSelect: () => run(view, clearFormatting),
    },
  ];
}

const SWATCH: Record<string, string> = {
  red: 'var(--skb-danger)',
  orange: 'var(--skb-warning)',
  yellow: 'var(--skb-stage-practised)',
  green: 'var(--skb-success)',
  blue: 'var(--skb-info)',
  purple: 'var(--skb-graph-4)',
};

const swatch = (colour: string) => (
  <span
    className="block size-3 rounded-[3px] border border-border-strong"
    style={{ backgroundColor: `color-mix(in srgb, ${colour} 45%, transparent)` }}
  />
);

export function highlightEntries(view: EditorView): MenuEntry[] {
  return [
    {
      label: 'Highlight',
      icon: swatch('var(--skb-warning)'),
      onSelect: () => run(view, setHighlight('default')),
    },
    { kind: 'separator' },
    ...(['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const).map(
      (colour): MenuEntry => ({
        label: colour.charAt(0).toUpperCase() + colour.slice(1),
        icon: swatch(SWATCH[colour] ?? ''),
        onSelect: () => run(view, setHighlight(colour)),
      }),
    ),
    { kind: 'separator' },
    {
      label: 'Remove highlight',
      icon: <RemoveFormatting size={ICON} />,
      onSelect: () => run(view, setHighlight(null)),
    },
  ];
}

export const BLOCK_ICONS: Record<BlockKind, React.ReactNode> = {
  paragraph: <Pilcrow size={ICON} />,
  heading1: <Heading1 size={ICON} />,
  heading2: <Heading2 size={ICON} />,
  heading3: <Heading3 size={ICON} />,
  heading4: <span className="text-[10px] font-bold">H4</span>,
  heading5: <span className="text-[10px] font-bold">H5</span>,
  heading6: <span className="text-[10px] font-bold">H6</span>,
  bullet: <List size={ICON} />,
  numbered: <ListOrdered size={ICON} />,
  task: <ListChecks size={ICON} />,
  quote: <Quote size={ICON} />,
  callout: <MessageSquareText size={ICON} />,
  code: <SquareCode size={ICON} />,
};

const block = (view: EditorView, kind: BlockKind, label: string, disabled: boolean): MenuEntry => ({
  label,
  icon: BLOCK_ICONS[kind],
  disabled,
  onSelect: () => run(view, setBlock(kind)),
});

export function paragraphEntries({ view, readOnly }: SelectionContext): MenuEntry[] {
  return [
    block(view, 'bullet', 'Bullet list', readOnly),
    block(view, 'numbered', 'Numbered list', readOnly),
    block(view, 'task', 'Task list', readOnly),
    { kind: 'separator' },
    ...([1, 2, 3, 4, 5, 6] as const).map((level) =>
      block(view, `heading${level}`, `Heading ${level}`, readOnly),
    ),
    block(view, 'paragraph', 'Body', readOnly),
    { kind: 'separator' },
    block(view, 'quote', 'Quote', readOnly),
    block(view, 'callout', 'Callout', readOnly),
    block(view, 'code', 'Code block', readOnly),
  ];
}

const SNIPPETS: { snippet: Snippet; label: string; icon: React.ReactNode }[] = [
  { snippet: 'footnote', label: 'Footnote', icon: <Footprints size={ICON} /> },
  { snippet: 'table', label: 'Table', icon: <Table size={ICON} /> },
  { snippet: 'callout', label: 'Callout', icon: <MessageSquareText size={ICON} /> },
  { snippet: 'rule', label: 'Horizontal rule', icon: <Minus size={ICON} /> },
  { snippet: 'codeBlock', label: 'Code block', icon: <SquareCode size={ICON} /> },
  { snippet: 'mathsBlock', label: 'Maths block', icon: <Sigma size={ICON} /> },
];

export function insertEntries({ view, readOnly }: SelectionContext): MenuEntry[] {
  return SNIPPETS.map((entry) => ({
    label: entry.label,
    icon: entry.icon,
    disabled: readOnly,
    onSelect: () => run(view, insertSnippet(entry.snippet)),
  }));
}

export const AI_ACTIONS: { action: WritingAction; label: string; changes: boolean }[] = [
  { action: 'improve', label: 'Improve writing', changes: true },
  { action: 'proofread', label: 'Fix spelling and grammar', changes: true },
  { action: 'shorter', label: 'Make shorter', changes: true },
  { action: 'longer', label: 'Make longer', changes: true },
  { action: 'simplify', label: 'Simplify language', changes: true },
  { action: 'list', label: 'Turn into a list', changes: true },
  { action: 'table', label: 'Turn into a table', changes: true },
  { action: 'summarise', label: 'Summarise', changes: false },
  { action: 'explain', label: 'Explain', changes: false },
];

export function aiEntries(context: SelectionContext): MenuEntry[] {
  const { ai, readOnly } = context;
  const entries: MenuEntry[] = [];
  if (!ai.ready)
    entries.push(
      {
        label: 'Set up AI in Settings…',
        icon: <Sparkles size={ICON} />,
        hint: 'Not set up',
        onSelect: context.setUpAi,
      },
      { kind: 'separator' },
    );
  for (const entry of AI_ACTIONS)
    entries.push({
      label: entry.label,
      icon: entry.changes ? <WandSparkles size={ICON} /> : <Sparkles size={ICON} />,
      // Reading a read-only note can still be explained or summarised.
      disabled: !ai.ready || (readOnly && entry.changes),
      onSelect: () => context.askAi(entry.action),
    });
  entries.push(
    { kind: 'separator' },
    {
      label: 'Edit with AI…',
      icon: <Sparkles size={ICON} />,
      disabled: !ai.ready || readOnly,
      onSelect: context.askAiCustom,
    },
  );
  return entries;
}

export function studyEntries(context: SelectionContext): MenuEntry[] {
  const text = selectedText(context.view).trim();
  const short = text.length > 24 ? `${text.slice(0, 24).trimEnd()}…` : text;
  return [
    {
      label: `Search for “${short}”`,
      icon: <Search size={ICON} />,
      disabled: text === '',
      onSelect: () => context.tools.search(text),
    },
    {
      label: 'Extract selection to a new note…',
      icon: <FileOutput size={ICON} />,
      disabled: text === '' || context.readOnly,
      onSelect: context.extract,
    },
    {
      label: 'Make a card from the selection',
      icon: <SquarePlus size={ICON} />,
      disabled: text === '',
      onSelect: context.tools.makeCard,
    },
    {
      label: 'Generate from the selection…',
      icon: <Sparkles size={ICON} />,
      disabled: text === '',
      onSelect: context.tools.generate,
    },
  ];
}

export function clipboardEntries({ view, readOnly }: SelectionContext): MenuEntry[] {
  const empty = view.state.selection.main.empty;
  return [
    {
      label: 'Cut',
      icon: <Scissors size={ICON} />,
      hint: keys('mod+x'),
      disabled: empty || readOnly,
      onSelect: () => void cutSelection(view),
    },
    {
      label: 'Copy',
      icon: <Copy size={ICON} />,
      hint: keys('mod+c'),
      disabled: empty,
      onSelect: () => void copySelection(view),
    },
    {
      label: 'Paste',
      icon: <Copy size={ICON} />,
      hint: keys('mod+v'),
      disabled: readOnly,
      onSelect: () => void pasteFromClipboard(view, { plain: false }),
    },
    {
      label: 'Paste as plain text',
      icon: <Copy size={ICON} />,
      hint: keys('mod+shift+v'),
      disabled: readOnly,
      onSelect: () => void pasteFromClipboard(view, { plain: true }),
    },
    {
      label: 'Select all',
      icon: <TextSelect size={ICON} />,
      hint: keys('mod+a'),
      onSelect: () => {
        view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
        view.focus();
      },
    },
  ];
}
