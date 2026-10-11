import {
  AppWindow,
  ArrowLeftFromLine,
  ArrowRightFromLine,
  Bookmark,
  BookmarkMinus,
  BookOpen,
  Code,
  Columns2,
  Copy,
  ExternalLink,
  FilePlus,
  FolderInput,
  FolderOpen,
  FolderPlus,
  GitMerge,
  History,
  Link2,
  ListTree,
  LocateFixed,
  Network,
  PanelBottom,
  Pencil,
  Plus,
  Printer,
  Replace,
  Rows2,
  Search,
  SquareArrowOutUpRight,
  Tags,
  Trash2,
} from 'lucide-react';
import { keyLabels } from '../../../app/shortcuts/registry';
import type { MenuEntry } from '../../../components/MenuEntries';
import { isApplePlatform } from '../../../lib/platform';
import type { EditorMode, SidePanel } from '../notes-store';
import { parentOf, type TreeNode } from '../tree/buildTree';
import type { FileActions } from '../useFileActions';

/**
 * The file menus (tasks 23.08–23.09), as data: Obsidian's items in Obsidian's order and words, so
 * that a student who knows one knows the other. Items the browser cannot do (open a file in its
 * program, show it in Explorer) stay in the menu, disabled, and say where they work.
 */

const ICON = 15;
const DESKTOP_ONLY = 'Desktop app';
/** A shortcut as this platform writes it: "Ctrl+E" here, "⌘+E" on a Mac. */
const keys = (shortcut: string) => keyLabels(shortcut, isApplePlatform()).join('+');

function copyPathMenu(node: TreeNode, actions: FileActions): MenuEntry {
  return {
    kind: 'submenu',
    label: 'Copy path',
    icon: <Copy size={ICON} />,
    entries: [
      {
        label: 'Copy path from vault folder',
        onSelect: () => actions.copyPath(node, 'vault'),
      },
      {
        label: 'Copy path from system root',
        disabled: actions.vaultRoot === null,
        onSelect: () => actions.copyPath(node, 'system'),
      },
      ...(node.kind === 'folder'
        ? []
        : ([
            { kind: 'separator' },
            { label: 'Copy link', onSelect: () => actions.copyPath(node, 'wikilink') },
            { label: 'Copy embed', onSelect: () => actions.copyPath(node, 'embed') },
          ] satisfies MenuEntry[])),
    ],
  };
}

function bookmarkEntry(node: TreeNode, actions: FileActions): MenuEntry {
  const marked = actions.isBookmarked(node.path);
  return {
    label: marked ? 'Remove bookmark' : 'Bookmark',
    icon: marked ? <BookmarkMinus size={ICON} /> : <Bookmark size={ICON} />,
    onSelect: () => actions.toggleBookmark(node),
  };
}

function systemEntries(node: TreeNode, actions: FileActions): MenuEntry[] {
  const inBrowser = !actions.desktop;
  return [
    {
      label: 'Open in default app',
      icon: <SquareArrowOutUpRight size={ICON} />,
      // A browser can open an attachment in a tab of its own; a note is opened here.
      disabled: inBrowser && node.kind !== 'attachment',
      hint: inBrowser && node.kind !== 'attachment' ? DESKTOP_ONLY : undefined,
      onSelect: () => actions.openInDefaultApp(node),
    },
    {
      label: 'Show in system explorer',
      icon: <FolderOpen size={ICON} />,
      disabled: inBrowser,
      hint: inBrowser ? DESKTOP_ONLY : undefined,
      onSelect: () => actions.showInExplorer(node),
    },
  ];
}

/** The file tree's right-click menu; `startRename` renames in place in the tree. */
export function treeMenu(
  node: TreeNode | null,
  actions: FileActions,
  startRename: () => void,
): MenuEntry[] {
  const folder = node === null ? '' : node.kind === 'folder' ? node.path : parentOf(node.path);
  const create: MenuEntry[] = [
    {
      label: 'New note',
      icon: <FilePlus size={ICON} />,
      onSelect: () => actions.openNewNote(folder),
    },
    {
      label: 'New folder',
      icon: <FolderPlus size={ICON} />,
      onSelect: () => actions.openNewFolder(folder),
    },
  ];
  if (node === null) return create;
  const rename: MenuEntry = {
    label: 'Rename…',
    icon: <Pencil size={ICON} />,
    hint: 'F2',
    onSelect: startRename,
  };
  const remove: MenuEntry = {
    label: 'Delete',
    icon: <Trash2 size={ICON} />,
    hint: 'Del',
    tone: 'danger',
    onSelect: () => actions.remove(node),
  };

  if (node.kind === 'folder') {
    return [
      ...create,
      { kind: 'separator' },
      {
        label: 'Move folder to…',
        icon: <FolderInput size={ICON} />,
        onSelect: () => actions.requestMove(node),
      },
      bookmarkEntry(node, actions),
      { kind: 'separator' },
      copyPathMenu(node, actions),
      { kind: 'separator' },
      systemEntries(node, actions)[1] as MenuEntry,
      { kind: 'separator' },
      rename,
      remove,
    ];
  }

  const opening: MenuEntry[] =
    node.kind === 'note'
      ? [
          {
            label: 'Open in new tab',
            icon: <Plus size={ICON} />,
            hint: keys('mod+click'),
            onSelect: () => actions.openInNewTab(node),
          },
          {
            label: 'Open to the right',
            icon: <Columns2 size={ICON} />,
            onSelect: () => actions.openToTheRight(node),
          },
          {
            label: 'Open in new window',
            icon: <AppWindow size={ICON} />,
            onSelect: () => actions.openInWindow(node),
          },
        ]
      : [{ label: 'Open', icon: <ExternalLink size={ICON} />, onSelect: () => actions.open(node) }];

  return [
    ...opening,
    { kind: 'separator' },
    { label: 'Make a copy', icon: <Copy size={ICON} />, onSelect: () => actions.copy(node) },
    {
      label: 'Move file to…',
      icon: <FolderInput size={ICON} />,
      onSelect: () => actions.requestMove(node),
    },
    bookmarkEntry(node, actions),
    ...(node.kind === 'note'
      ? ([
          {
            label: 'Merge entire file with…',
            icon: <GitMerge size={ICON} />,
            onSelect: () => actions.requestMerge(node),
          },
        ] satisfies MenuEntry[])
      : []),
    { kind: 'separator' },
    copyPathMenu(node, actions),
    ...(node.kind === 'note'
      ? ([
          { kind: 'separator' },
          {
            label: 'Open version history',
            icon: <History size={ICON} />,
            onSelect: () => actions.openHistory(node),
          },
        ] satisfies MenuEntry[])
      : []),
    { kind: 'separator' },
    ...systemEntries(node, actions),
    { kind: 'separator' },
    rename,
    remove,
  ];
}

/** What the More options menu does to the view itself, rather than to the file. */
export interface ViewCommands {
  mode: EditorMode;
  setMode(mode: EditorMode): void;
  livePreview: boolean;
  setLivePreview(on: boolean): void;
  backlinksInDocument: boolean;
  setBacklinksInDocument(on: boolean): void;
  find(): void;
  replace(): void;
  exportPdf(): void;
  addProperty(): void;
  showPanel(panel: SidePanel): void;
  readOnly: boolean;
}

/** The ⋮ menu of an open note (Obsidian's "More options"). */
export function moreOptionsMenu(
  node: TreeNode & { kind: 'note' },
  actions: FileActions,
  view: ViewCommands,
): MenuEntry[] {
  const reading = view.mode === 'preview';
  return [
    {
      kind: 'checkbox',
      label: 'Backlinks in document',
      icon: <PanelBottom size={ICON} />,
      checked: view.backlinksInDocument,
      onCheckedChange: view.setBacklinksInDocument,
    },
    {
      label: reading ? 'Editing view' : 'Reading view',
      icon: reading ? <Pencil size={ICON} /> : <BookOpen size={ICON} />,
      hint: keys('mod+e'),
      onSelect: () => view.setMode(reading ? 'edit' : 'preview'),
    },
    {
      kind: 'checkbox',
      label: 'Source mode',
      icon: <Code size={ICON} />,
      checked: !view.livePreview,
      disabled: reading,
      onCheckedChange: (source) => view.setLivePreview(!source),
    },
    { kind: 'separator' },
    {
      label: 'Split right',
      icon: <Columns2 size={ICON} />,
      onSelect: () => actions.split(node.id, 'right'),
    },
    {
      label: 'Split down',
      icon: <Rows2 size={ICON} />,
      onSelect: () => actions.split(node.id, 'down'),
    },
    {
      label: 'Open in new window',
      icon: <AppWindow size={ICON} />,
      onSelect: () => actions.openInWindow(node),
    },
    { kind: 'separator' },
    { label: 'Rename…', icon: <Pencil size={ICON} />, onSelect: () => actions.requestRename(node) },
    {
      label: 'Move file to…',
      icon: <FolderInput size={ICON} />,
      onSelect: () => actions.requestMove(node),
    },
    bookmarkEntry(node, actions),
    {
      label: 'Merge entire file with…',
      icon: <GitMerge size={ICON} />,
      onSelect: () => actions.requestMerge(node),
    },
    {
      label: 'Add file property',
      icon: <Tags size={ICON} />,
      disabled: view.readOnly,
      onSelect: view.addProperty,
    },
    { kind: 'separator' },
    { label: 'Export to PDF…', icon: <Printer size={ICON} />, onSelect: view.exportPdf },
    { kind: 'separator' },
    { label: 'Find…', icon: <Search size={ICON} />, hint: keys('mod+f'), onSelect: view.find },
    {
      label: 'Replace…',
      icon: <Replace size={ICON} />,
      hint: keys('mod+h'),
      disabled: view.readOnly,
      onSelect: view.replace,
    },
    { kind: 'separator' },
    copyPathMenu(node, actions),
    {
      label: 'Open version history',
      icon: <History size={ICON} />,
      onSelect: () => actions.openHistory(node),
    },
    {
      kind: 'submenu',
      label: 'Open linked view',
      icon: <Link2 size={ICON} />,
      entries: [
        {
          label: 'Open backlinks',
          icon: <ArrowLeftFromLine size={ICON} />,
          onSelect: () => view.showPanel('backlinks'),
        },
        {
          label: 'Open outgoing links',
          icon: <ArrowRightFromLine size={ICON} />,
          onSelect: () => view.showPanel('outgoing'),
        },
        {
          label: 'Open outline',
          icon: <ListTree size={ICON} />,
          onSelect: () => view.showPanel('outline'),
        },
        {
          label: 'Open properties',
          icon: <Tags size={ICON} />,
          onSelect: () => view.showPanel('properties'),
        },
        {
          label: 'Open local graph',
          icon: <Network size={ICON} />,
          onSelect: () => view.showPanel('graph'),
        },
      ],
    },
    { kind: 'separator' },
    ...systemEntries(node, actions),
    {
      label: 'Reveal file in navigation',
      icon: <LocateFixed size={ICON} />,
      onSelect: () => actions.reveal(node),
    },
    { kind: 'separator' },
    {
      label: 'Delete file',
      icon: <Trash2 size={ICON} />,
      tone: 'danger',
      onSelect: () => actions.remove(node),
    },
  ];
}
