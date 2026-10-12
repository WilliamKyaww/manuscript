# 12 October 2026 — Claude Opus 5.5

- **Date:** begun on the evening of Sunday 11 October 2026, finished after midnight on Monday 12 October
- **Model:** Claude Opus 5.5
- **Phase:** 23 — the notes workspace (`phase/23-notes-workspace`), after 1.0.0
- **Summary:** From the student's review of 1.0 (fourteen screenshots of Manuscript and Obsidian), the Notes page now
  works like Obsidian's: tabs and two panes, the ⋮ *More options* menu and the file tree's right-click menu with every
  item working (several were new: version history, merging, copies, bookmarks, export to PDF, a note's own window),
  Obsidian's sort orders and *Expand all / Collapse all*, the open vault and a way to open another at the foot of the
  Files pane, a Details panel that starts closed, better empty states, a narrower resizable sidebar that starts
  collapsed, and a slim desktop title bar in the application's colours. Version 1.1.0.

## What was asked, and the two choices made

The student listed ten changes and asked whether hiding Electron's title bar was all right. Two questions were put
back: how far to go with the menu items that assume tabs and panes (answer: **build tabs and panes**, so that *Open in
new tab*, *Open to the right*, *Split right/down* and *Open in new window* all work), and what to do with the title
bar (answer: **a slim bar in the app's colours**, with the system's window buttons kept). The rest followed Obsidian:
its menu items in its order and words, its six sort orders, one *Expand all / Collapse all* button.

## What was done

- **Server** (`modules/notes`): the tree sends each note's created time; `POST /api/entries/copy` (a copied note's `id`
  line is removed, so two files never claim one id); `POST /api/notes/:id/merge` (`merges.ts`: the body is appended,
  links to the merged note are retargeted — the target's own, other notes', relative Markdown links in the moved
  body — and it goes to the trash); version history (`versions.ts`: the replaced text kept before a save, at most
  every five minutes per note, 30 days and at most 200 files, in `.skb/history/versions/<id>/`; listed, read and kept
  on request before a restore); bookmarks as a settings group that follows moves and merges (`bookmarks.ts`).
  Nine route tests (`workspace.test.ts`).
- **Web — workspace** (`features/notes/workspace/`): a zustand store of one or two panes with tabs, remembered in
  `localStorage` and repaired when the memory is damaged; `route-sync.ts` keeps the address and the active tab in
  step (the address decides on arrival, tab changes move the address afterwards); `EditorPanes` and `TabBar` (close
  with × or a middle click, drag to reorder, a tab menu); `EmptyTab`; `DetailsPanel` fed by `active-note.ts`, which
  the view of the active pane publishes to. A pop-out window (`?window=note`) has no sidebar or Files pane and does
  not write the workspace. Store tests cover every action.
- **Web — menus**: `components/MenuEntries.tsx` draws a menu described as data as a dropdown or a right-click menu
  (items, checkboxes, radio groups, submenus); `menus/file-menu.tsx` builds the tree's menu and the ⋮ menu from
  `useFileActions` (open variants, rename and move dialogues, copy, bookmark, merge with a suggester and a
  confirmation, copy path, version history, default app, Explorer, reveal). `SuggestDialog` is Obsidian's
  suggester; `VersionHistoryDialog` shows a version or its changes and restores it (undoable from the toast).
- **Web — Files pane** (`files/FilesPane.tsx`): Obsidian's toolbar, the sort menu (`buildTree` sorts by the six
  orders, folders always by name), *Expand all / Collapse all*, bookmarks, the empty-vault state, and the vault
  switcher (`vault/`) with recent vaults, *Open folder as vault…* (the desktop picker or a path; inspected before
  opening) and *Manage vaults…*. `useVaultSwitch` is shared with Settings → Data.
- **Web — the note view** (`NoteWorkspace.tsx`): now one pane's view: a breadcrumb, the ⋮ menu, backlinks at the foot
  when chosen, Ctrl+E for reading view, Ctrl+H for Replace; export to PDF prints a light-theme copy of the rendered
  note (`export/PrintHost.tsx`).
- **Shell**: the sidebar is 13.5 rem, resizable by its edge (pointer or arrow keys; 12–22 rem; remembered) and
  collapsed until opened (a new preference key, so the new default applies once); thin scrollbars; `Page` has a
  compact header; `Pane` a start slot and a footer.
- **Desktop**: `titleBarStyle: 'hidden'` with `titleBarOverlay` (the page draws a 32-pixel strip, `TitleBar.tsx`, and
  sets the buttons' colours from the theme); bridge calls `openPath` (vault only), `printToPdf` (a save dialogue, then
  `printToPDF`; the saved file may be shown in its folder) and `setTitleBarColours`; `window.open` allowed only for a
  note window (`isNoteWindowUrl`). Policy tests for the three new rules.

## Decisions

- **ADR-0042**: the workspace is browser state; versions are files beside the database in `.skb/history/versions`;
  bookmarks are a vault setting (Obsidian's `bookmarks.json` is not written, to avoid fighting a running Obsidian);
  copies never share an id; merges append the body and retarget links; the title bar is Electron's hidden title bar
  with the system's buttons.
- Two panes at most; the "other pane" of *Split right* is relative to the active pane.
- The ⋮ menu is not modal (as in Obsidian): the page stays readable and reachable beside it.

## Problems met

- **Tree fixtures without `createdAt`** failed validation in component tests ("The notes could not be loaded"); the
  fixtures were updated (the field is required: the server always sends it).
- **Rename from the right-click menu** closed at once: while open, the menu keeps focus inside itself, so the rename
  field lost it. The rename starts once the menu has closed, and the menu does not take focus back.
- **Find/Replace from the ⋮ menu** lost focus to the menu button as the menu closed; items that move focus elsewhere
  now keep it there. **Long menus** ran off a short window; they scroll now.
- **axe** found the editor's scroller not keyboard-reachable in a short pane (CodeMirror's content is now always
  focusable, read-only notes included).
- **Menu shortcuts with the hidden title bar**: keys sent by Playwright never reach Electron's menu (Chromium marks
  them as synthetic), so the desktop test sends keys through `webContents.sendInputEvent`; zoom out and reset work.
- Bash here-documents collapsed backslashes again (a regular expression, `'\\'`) and choked on prose with quotes;
  scripts with escapes were written with the editor tools instead (`AGENTS.md` §5 already warns).

## Tests run

- `npx vitest run --project server …/workspace.test.ts` — 9 passed. Web project: 216 passed. Desktop: 12 passed.
- `npm run verify` — typecheck, lint, 154 files / 928 tests, build, smoke (server 1.1.0): passed.
- End-to-end: notes, shell and the new `workspace.spec.ts` (8 tests) passed; the desktop shell test passed (title
  bar, menu shortcuts, a note's own window).
- `npm run test:e2e`, first full run: 138 passed, 4 failed. Two tests clicked the sidebar's "Chat…" text and read the
  Inbox count as visible text, which the sidebar no longer shows now that it starts collapsed (they use the collapsed
  sidebar's names now); the merge test checked for the merged file between the two writes of one request (it polls
  now); the desktop shell test lost its window once ("Target page, context or browser has been closed" two seconds
  in) and passed every time since — alone twice, with its neighbours, and in the second full run.
- Second full run (after the note view was split into `view/StudyTools.tsx` and `view/NoteBreadcrumb.tsx`): **142
  passed, 0 failed** (3 skipped: the screenshot specs). `npm run verify` again: 928 tests, smoke on 1.1.0, passed.

## Unresolved

- Edits made in other programs are not versioned (the file changed without the server).
- The installed 1.0.0 on the student's machine is not updated: installing 1.1.0 over it needs their go-ahead.

## Next steps

- Install 1.1.0 over 1.0.0 when the student says so; use it and report what is wrong or missing.

## Impeccable `init` (afternoon)

The student installed the Impeccable design skill and asked for `init`. It found four packages and asked which the
interface is (`apps/web`); three questions settled who Manuscript is for (the student, perhaps other students later),
where it is used (mostly the desktop app) and Obsidian's role (Manuscript replaces it and should feel familiar). It
wrote `apps/web/PRODUCT.md` and the live-mode config (`apps/web/.impeccable/live/config.json`; no CSP change was
needed). Neither was committed then.

## Phase 24 — Appearance: Simplified UI and colour palettes

- **Date:** Monday 12 October 2026
- **Model:** Claude Opus 5.5
- **Phase:** 24 (`phase/24-appearance`), with Impeccable
- **Summary:** A quieter interface in the spirit of Obsidian, on by default and optional, and six colour palettes for
  light and dark, all remembered; the existing look stays as the "Manuscript" palette and the "Standard" interface.
  Version 1.2.0.

### How it was done

Impeccable treated it as a refinement and extension of an established world (no concept tournament): one
confirmation round with the student — today's colours stay the default; with Simplified UI the Notes title row folds
into the tab row; the file tree has no icons, as in Obsidian — then a code-led build, one batched screenshot round
(desktop, 390 px; both modes, several palettes), its mechanical detector (no findings), and a fresh finish reviewer.

- **Appearance** (`app/theme/appearance.ts`, `public/theme-init.js`): `data-palette` and `data-ui` on the document,
  set before the first paint, beside the existing `data-theme`; Simplified UI is on unless turned off (ADR-0043).
- **Palettes** (`tokens.css`): Graphite, Sand, Slate, Sage, Iris override only neutrals and the accent per theme.
  The values were checked numerically before they were written (a scratch script, then generated into the CSS), and
  `features/design/palettes.test.ts` checks all twelve combinations for AA on every surface.
- **Chrome tokens** (`--skb-chrome-line`, `--skb-divider`, `--skb-pane-header-bg`, `--skb-active-line`,
  `--skb-card-edge`) and a `simplified:` Tailwind variant carry the mode; one component tree serves both.
- **Notes, simplified:** `Page headerHidden` (the h1 stays for screen readers and focus), the page's actions at the
  tab row's end, the Obsidian file tree (indent guides, type tags, paths on hover), the status chip.
- **Settings → Appearance** (`features/settings/AppearanceSection.tsx`): theme, palettes in miniature (light and dark
  side by side), the Simplified UI switch with the student's own description.

### The finish review

The reviewer first asked for a recapture (the Settings shot ended above the switch), then returned **fix** with four
material findings, all taken in one batch: Simplified UI had barely touched pages other than Notes (section rules,
cards, Today's icon tiles); window sizes between phone and desktop were unchecked and the Files pane became a 60 px
sliver at 390 px; the corner status chip could cover text; and, optionally, the Files pane should be separated from
the note by surface rather than a hairline. Its verdict: three resolved, one partial (cards needed a per-theme
decision, not a softer token: now no edge in light, a faint one in dark), plus a regression (the Files pane's new
10 rem minimum cut off its own toolbar at 768 px: now 13.5 rem). The second verdict resolved both and found one more
regression (the narrower note pane at 768 px hid the save status); that one, and a breadcrumb whose last "/" was cut
with a long folder name, were fixed after the review's last round and checked from a recapture, not re-scored.

### Problems met

- **The hidden h1** made 23 end-to-end checks fail ("heading Notes not visible"). The checks now use
  `expectPageTitle` (`e2e/titles.ts`): the title must be there, and visible unless its header is the deliberately
  hidden one (`data-header-hidden`); the sticky-header and long-note tests check the tab row instead of the hidden
  header.
- `scrollIntoView` in a capture scrolled the whole application frame (an invalid screenshot); the capture scrolls the
  page body instead.
- Bash here-documents and a Python script collapsed backslashes and a brace again; files with escapes were written
  with the editor tools.

### Tests run

- Web: 242 tests (store, boot script, palette contrast, settings, tree, Notes page in both modes).
- End to end: `appearance.spec.ts` (fresh-install defaults; persistence across a reload; the same controls in both
  interfaces; axe on Notes and Today in every palette and theme and in Standard) and the notes, shell, workspace and
  keyboard specs: 86 passed.
- `npm run verify`: 157 files, 954 tests, build, smoke on 1.2.0 — passed. `npm run test:e2e`: **145 passed, 0 failed**
  (3 skipped: the screenshot specs), the desktop shell included.

### Unresolved

- Reported by Impeccable's documenter, not repaired (it predates this phase): the small upper-case `eyebrow` labels
  on pane titles and panel groups (21 files, `ui.md` §8) are a pattern Impeccable's craft rules refuse; `DESIGN.md`
  leaves them out of the system. Worth a decision with the student.
- Phone-width layouts remain best-effort.

### Next steps

- Install 1.2.0 when the student says so; use it and report what is wrong or missing.

## 1.2.1 — appearance not remembered in the desktop app

The student reported that a chosen palette reverted to the default after leaving the app. Cause: the desktop shell
started the engine with `--port 0`, so every launch had a new address (`http://127.0.0.1:<random>`), and the page's
local storage — theme, palette, Simplified UI, tabs, sidebar width, every per-browser preference — belongs to the
address: each launch began with empty storage. (Browser use via `run-web.bat` has a fixed port and was not affected.)

- `apps/desktop/src/port.ts`: the port chosen at the first launch is remembered in `<data>/desktop-port.json` and used
  again while it is free; if another program holds it, a new one is chosen and remembered. Unit tests (3).
- `e2e/desktop.spec.ts`: a new test chooses Sage and turns Simplified UI off, quits, starts again with the same data
  folder, and finds the same address and both choices. The vault-switch test now waits for the server to report the
  new vault rather than for a new address (the restarted engine keeps the port by design).
- Tests: desktop unit 15 passed; desktop specs 5 passed (one run had the zoom-shortcut check read 0 once, sent the
  moment the window opened; it passed in the next two runs); `npm run verify` below.
- Verify after the fix: 158 files, 957 tests, smoke on 1.2.1 — passed.
