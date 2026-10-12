import {
  Copy,
  ExternalLink,
  FileText,
  Link,
  Link2,
  PanelRight,
  PanelsTopLeft,
  Pencil,
  Sparkles,
  Type,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '../../../../components/ContextMenu';
import { MenuEntries, type MenuEntry } from '../../../../components/MenuEntries';
import { notifyError, notifySuccess } from '../../../../lib/notify';
import { wikilinkAt } from '../extensions';
import { wrapMarkdownLink, wrapWikilink } from '../format-insert';
import { editLinkAddress } from '../link-interaction';
import { linkAt } from '../links';
import {
  aiEntries,
  clipboardEntries,
  formatEntries,
  insertEntries,
  keys,
  paragraphEntries,
  run,
  type SelectionContext,
  studyEntries,
} from './actions';
import type { EditorHub } from './hub';

/**
 * The editor's right-click menu (Phase 26), Obsidian's: what a link under the pointer offers, then
 * adding links, searching for and extracting the selection, the Format, Paragraph and Insert menus,
 * AI, and the clipboard. A right click outside the selection moves the cursor there first, as in
 * Obsidian; Shift+F10 or the Menu key opens it at the cursor.
 */

const ICON = 15;

export function buildEditorMenu(context: SelectionContext, position: number | null): MenuEntry[] {
  const { view, readOnly, tools } = context;
  const { state } = view;
  const entries: MenuEntry[] = [];
  const link = position === null ? null : linkAt(state, position);
  const wiki = position === null ? null : wikilinkAt(view, position);
  if (link?.href) {
    const href = link.href;
    entries.push(
      {
        label: 'Open link',
        icon: <PanelsTopLeft size={ICON} />,
        onSelect: () => tools.openWeb(href, false),
      },
      {
        label: 'Open in browser',
        icon: <ExternalLink size={ICON} />,
        hint: `${keys('mod')}+click`,
        onSelect: () => tools.openWeb(href, true),
      },
      {
        label: 'Copy link',
        icon: <Copy size={ICON} />,
        onSelect: () =>
          void navigator.clipboard
            .writeText(href)
            .then(() => notifySuccess('Link copied'), notifyError),
      },
      {
        label: 'Edit link',
        icon: <Pencil size={ICON} />,
        disabled: readOnly,
        onSelect: () => editLinkAddress(view, link.from + 1),
      },
      { kind: 'separator' },
    );
  } else if (wiki) {
    entries.push(
      {
        label: 'Open link',
        icon: <FileText size={ICON} />,
        onSelect: () => tools.openNote(wiki, 'here'),
      },
      {
        label: 'Open in new tab',
        icon: <PanelsTopLeft size={ICON} />,
        onSelect: () => tools.openNote(wiki, 'tab'),
      },
      {
        label: 'Open to the right',
        icon: <PanelRight size={ICON} />,
        onSelect: () => tools.openNote(wiki, 'right'),
      },
      { kind: 'separator' },
    );
  }
  const selection = state.selection.main;
  const oneLine = state.doc.lineAt(selection.from).number === state.doc.lineAt(selection.to).number;
  entries.push(
    {
      label: 'Add link',
      icon: <Link2 size={ICON} />,
      hint: '[[ ]]',
      disabled: readOnly || !oneLine,
      onSelect: () => run(view, wrapWikilink),
    },
    {
      label: 'Add external link',
      icon: <Link size={ICON} />,
      hint: keys('mod+shift+k'),
      disabled: readOnly || !oneLine,
      onSelect: () => run(view, wrapMarkdownLink()),
    },
    { kind: 'separator' },
    ...studyEntries(context),
    { kind: 'separator' },
    {
      kind: 'submenu',
      label: 'Format',
      icon: <Type size={ICON} />,
      entries: formatEntries(context),
    },
    {
      kind: 'submenu',
      label: 'Paragraph',
      icon: <FileText size={ICON} />,
      entries: paragraphEntries(context),
    },
    {
      kind: 'submenu',
      label: 'Insert',
      icon: <Link size={ICON} />,
      entries: insertEntries(context),
    },
    {
      kind: 'submenu',
      label: 'AI',
      icon: <Sparkles size={ICON} />,
      disabled: selection.empty,
      entries: aiEntries(context),
    },
    { kind: 'separator' },
    ...clipboardEntries(context),
  );
  return entries;
}

export function EditorContextMenu({
  hub,
  context,
  children,
}: {
  hub: EditorHub;
  context(): SelectionContext | null;
  children: ReactNode;
}) {
  const [entries, setEntries] = useState<MenuEntry[]>([]);
  return (
    <ContextMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) hub.view?.focus();
      }}
    >
      <ContextMenuTrigger asChild>
        <div
          className="h-full"
          onContextMenuCapture={(event) => {
            const view = hub.view;
            const ctx = context();
            if (!view || !ctx) return;
            // From the keyboard (Shift+F10, the Menu key) there is no pointer: the cursor decides.
            const pointer = event.clientX !== 0 || event.clientY !== 0;
            const at = pointer ? view.posAtCoords({ x: event.clientX, y: event.clientY }) : null;
            const selection = view.state.selection.main;
            if (at !== null && (at < selection.from || at > selection.to))
              view.dispatch({ selection: { anchor: at } });
            setEntries(buildEditorMenu(ctx, at ?? view.state.selection.main.head));
          }}
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-64">
        <MenuEntries entries={entries} as="context" />
      </ContextMenuContent>
    </ContextMenu>
  );
}
