# Phase 23 — Notes workspace (after 1.0)

**Status:** In progress · **Branch:** `phase/23-notes-workspace`

## Objective
Make the Notes section work the way an Obsidian user expects, from the student's review of 1.0 (11 October): a
narrower, resizable sidebar that starts collapsed; tabs and split panes; Obsidian's file menu, "More options"
menu and sort orders, with every item working; a clear way to see and change the vault from the Notes page; a
Details panel that starts collapsed; better empty states; and a slim desktop title bar in the application's
colours.

## Dependencies
Phase 22 (1.0.0 released). Decisions: ADR-0042.

## Atomic tasks
- [ ] **23.01** App sidebar: narrower (13.5 rem), drag to resize (12–22 rem, remembered, double-click and the
  keyboard on the handle), collapsed until the student opens it; thin scrollbars in the theme's colours.
- [ ] **23.02** Files pane toolbar: one button that is *Expand all* when every folder is closed and *Collapse all*
  otherwise; a sort menu with Obsidian's six orders (file name, modified and created time, both ways),
  remembered; the tree sends each note's created time.
- [ ] **23.03** Vault on the Notes page: the open vault's name at the foot of the Files pane, a menu to open a
  recent vault, open a folder as a vault, show or copy its folder and manage vaults; "No vault open" when there is
  none; an empty vault and "no note open" fill the page with what to do next.
- [ ] **23.04** Tabs and panes: a tab bar (new tab, close, middle-click, Ctrl+click opens in a new tab), *Open to
  the right*, *Split right* and *Split down* (two panes at most), the address follows the active tab, the
  workspace is remembered, and unsaved text is saved when a tab closes.
- [ ] **23.05** Details panel: one panel for the active note (outline, backlinks, outgoing links, properties,
  local graph), collapsible and collapsed by default, with a toggle in the header.
- [ ] **23.06** Server: make a copy of a note or attachment (a copy never shares the original's id); merge a note
  into another (appended, links to it retargeted, the original to the trash); bookmarks kept per vault and moved
  with their files.
- [ ] **23.07** Version history: the previous text of a note is kept when it is saved (at most every five minutes,
  30 days), listed, compared with the current text and restored (undoable); merges and restores keep a version.
- [ ] **23.08** More options (⋮) menu with every item of Obsidian's: backlinks in document, reading view, source
  mode, split right/down, open in new window, rename, move, bookmark, merge, add file property, export to PDF,
  find, replace, copy path, version history, linked views, open in default app, show in system explorer, reveal
  in navigation, delete.
- [ ] **23.09** File and folder context menus like Obsidian's: open in new tab / to the right / in new window, make a
  copy, move, bookmark, merge, copy path, version history, open in default app, show in system explorer, rename,
  delete; a Bookmarks list in the Files pane.
- [ ] **23.10** Desktop: a slim title bar in the application's colours (title bar hidden, window controls kept, its
  colours follow the theme), menu shortcuts kept; bridge calls to open a vault file in its default application,
  print a note to PDF and open a note in a window of its own — each checked in the main process.
- [ ] **23.11** Tests (unit, component, end to end, desktop) and documentation: guides, `ui.md`, FEATURES, STATE,
  CHANGELOG 1.1.0, journal.
- [ ] **23.12** Release 1.1.0: verify, end-to-end suite, merge, version, installer.

## Gate
- [ ] All tasks `[x]` · [ ] `npm run verify` · [ ] `npm run test:e2e` · [ ] merged into `main`

## Recommended commit messages
```text
feat(notes): tabs, split panes and Obsidian's file menus
feat(desktop): slim title bar in the application's colours
chore(release): v1.1.0
```
