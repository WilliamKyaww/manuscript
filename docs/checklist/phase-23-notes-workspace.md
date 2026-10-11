# Phase 23 — Notes workspace (after 1.0)

**Status:** Complete · **Branch:** `phase/23-notes-workspace`

## Objective
Make the Notes section work the way an Obsidian user expects, from the student's review of 1.0 (11 October): a
narrower, resizable sidebar that starts collapsed; tabs and split panes; Obsidian's file menu, "More options"
menu and sort orders, with every item working; a clear way to see and change the vault from the Notes page; a
Details panel that starts collapsed; better empty states; and a slim desktop title bar in the application's
colours.

## Dependencies
Phase 22 (1.0.0 released). Decisions: ADR-0042.

## Atomic tasks
- [x] **23.01** App sidebar: narrower (13.5 rem), drag to resize (12–22 rem, remembered, double-click and the
  keyboard on the handle), collapsed until the student opens it; thin scrollbars in the theme's colours. —
  `SidebarResizer.tsx`, `layout-store.ts` (a new key, `skb.sidebar.state`); `e2e/shell.spec.ts` drags, uses the keys,
  reloads and resets.
- [x] **23.02** Files pane toolbar: one button that is *Expand all* when every folder is closed and *Collapse all*
  otherwise; a sort menu with Obsidian's six orders (file name, modified and created time, both ways),
  remembered; the tree sends each note's created time. — `files/FilesPane.tsx`, `buildTree` sort tests, component
  tests for the toggle and the sort menu.
- [x] **23.03** Vault on the Notes page: the open vault's name at the foot of the Files pane, a menu to open a
  recent vault, open a folder as a vault, show or copy its folder and manage vaults; "No vault open" when there is
  none; an empty vault and "no note open" fill the page with what to do next. — `vault/`, `EmptyTab.tsx`; the
  open-folder dialogue is checked end to end up to opening (which would restart the shared test server).
- [x] **23.04** Tabs and panes: a tab bar (new tab, close, middle-click, Ctrl+click opens in a new tab), *Open to
  the right*, *Split right* and *Split down* (two panes at most), the address follows the active tab, the
  workspace is remembered, and unsaved text is saved when a tab closes. — `workspace/` (store tests for every
  action), component and end-to-end tests (Ctrl+click, middle click, split, typing in one pane seen in the other,
  reload).
- [x] **23.05** Details panel: one panel for the active note (outline, backlinks, outgoing links, properties,
  local graph), collapsible and collapsed by default, with a toggle in the header. — `DetailsPanel.tsx` fed by
  `active-note.ts`; "Add property" in the Properties tab.
- [x] **23.06** Server: make a copy of a note or attachment (a copy never shares the original's id); merge a note
  into another (appended, links to it retargeted, the original to the trash); bookmarks kept per vault and moved
  with their files. — `entries.copy`, `merges.ts`, `bookmarks.ts`; route tests in `workspace.test.ts`.
- [x] **23.07** Version history: the previous text of a note is kept when it is saved (at most every five minutes,
  30 days), listed, compared with the current text and restored (undoable); merges and restores keep a version.
  — `versions.ts`, `VersionHistoryDialog.tsx`; tested on the server (interval, retention, ids) and end to end
  (list, changes, restore).
- [x] **23.08** More options (⋮) menu with every item of Obsidian's: backlinks in document, reading view, source
  mode, split right/down, open in new window, rename, move, bookmark, merge, add file property, export to PDF,
  find, replace, copy path, version history, linked views, open in default app, show in system explorer, reveal
  in navigation, delete. — `menus/file-menu.tsx` and `components/MenuEntries.tsx`; every item listed by a
  component test; split, find/replace, reveal, export to PDF and a note's own window end to end.
- [x] **23.09** File and folder context menus like Obsidian's: open in new tab / to the right / in new window, make a
  copy, move, bookmark, merge, copy path, version history, open in default app, show in system explorer, rename,
  delete; a Bookmarks list in the Files pane. — make a copy, move with the suggester, bookmark and merge end to
  end; rename in place from the menu (a tree test).
- [x] **23.10** Desktop: a slim title bar in the application's colours (title bar hidden, window controls kept, its
  colours follow the theme), menu shortcuts kept; bridge calls to open a vault file in its default application,
  print a note to PDF and open a note in a window of its own — each checked in the main process. — `policy.ts`
  (tested), `main.ts`, `preload.ts`, `TitleBar.tsx`; `e2e/desktop.spec.ts` checks the strip, that the menu's zoom
  shortcuts work with the title bar hidden, and a note's own window.
- [x] **23.11** Tests (unit, component, end to end, desktop) and documentation: guides, `ui.md`, FEATURES, STATE,
  CHANGELOG 1.1.0, journal. — `docs/guide/markdown.md` §8, `desktop.md`, `ui.md` §11, FEATURES (F-KN-12…19,
  F-DE-05, F-UI-09), STATE, CHANGELOG, the 12 October journal.
- [x] **23.12** Release 1.1.0: verify, end-to-end suite, merge, version, installer. — every package at 1.1.0;
  `npm run verify` (928 tests) and `npm run test:e2e` (142 passed) on 12 October; merged into `main`; installer
  built with `npm run desktop:dist` (installing it over 1.0.0 waits for the student's go-ahead).

## Gate
- [x] All tasks `[x]` · [x] `npm run verify` · [x] `npm run test:e2e` · [x] merged into `main`

## Recommended commit messages
```text
feat(notes): tabs, split panes and Obsidian's file menus
feat(desktop): slim title bar in the application's colours
chore(release): v1.1.0
```
