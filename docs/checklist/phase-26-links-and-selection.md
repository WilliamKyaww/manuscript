# Phase 26 — Links and selections

**Status:** Complete · **Branch:** `phase/26-links-and-selection`

**Follow-up, 13 October:** the student changed the placement requirement to the right and reported a
ScienceDirect verification problem. [Phase 27](./phase-27-web-pane-right.md) and ADR-0046 track that work;
this checklist records the original 1.4.0 implementation and gate.

## Objective
From the student's requests of 12 October (screenshots of Notion and Obsidian): a link card on hover as in Notion,
Obsidian's external-link mark, a click on a web link opening the page **beside the note, on its left** (Ctrl+click
or a card button for the browser), GitHub links shown as mentions, and — for selected text — "all relevant
features" of Notion's toolbar and Obsidian's right-click menu.

## Dependencies
Phase 25 (1.3.0). Decisions: ADR-0045 (amends ADR-0041). Confirmed with the student: the pane goes on the left of
the note using the panes' split; a plain click opens the pane, Ctrl+click or *Open in browser* the browser; no new
download of Chromium (Electron's is used).

## Atomic tasks
- [x] **26.01** Desktop: web pages as `WebContentsView`s in a `persist:web` session — sandboxed, no preload, web
  addresses only (never the app's origin), new-tab links in the pane, pop-ups as windows of the same session, a
  context menu, six kept per window, released with their tab, a reload or a crash; the bridge's `web` calls
  checked again in the main process. — `apps/desktop/src/web-views.ts`, `policy.ts` (`webPageUrl`, `webViewId`,
  `webViewBounds`, `webCommand`, `webUserAgent`), `preload.ts`; policy tests.
- [x] **26.02** Workspace: web tabs (remembered, address followed), `openWebPage` into the other pane or a new pane
  on the left with the note's pane kept active; `WebTab` with back, forward, reload or stop, address bar, copy and
  open in browser; the view placed over its box and hidden behind a picture of itself while a menu or dialogue
  would be covered; a browser's fallback. — `workspace-store.ts`, `web-pages.ts`, `use-covered.ts`, `WebTab.tsx`,
  `TabBar.tsx`, `EditorPanes.tsx`.
- [x] **26.03** Links: the external-link mark, the link card (address, Copy, Edit, Open in browser) in the editor
  (hover tooltip) and the reading view (hover card), clicks (plain: beside; Ctrl/⌘, middle: browser), GitHub
  mentions named offline from the address. — `links/*`, `editor/links.ts`, `editor/link-interaction.ts`,
  `editor/live/links.ts`, `MarkdownPreview.tsx`.
- [x] **26.04** Formatting commands: inline formats (with bold/italic told apart), highlight colours, clear
  formatting, blocks (headings, lists, tasks, quote, callout, code), links and insertions (footnote, table,
  callout, rule, code and maths blocks), shortcuts. — `editor/format*.ts`, `selection/keymap.ts`.
- [x] **26.05** The selection toolbar (Notion) and the editor's right-click menu (Obsidian), from one description
  of the actions; extract a selection to a new note; Cut, Copy, Paste and Paste as plain text from the menus;
  pasted HTML as Markdown (Turndown) except from code editors. — `editor/selection/*`.
- [x] **26.06** AI on a selection: `POST /api/ai/write` (ten actions, the quick-tasks model, usage recorded, the
  text wrapped as untrusted), the test model's answers, a suggestion panel with Replace, Insert below, Copy and Try
  again; the menus say how to set AI up when it is not. — `modules/ai/writing.ts`, `mock-writing.ts`,
  `AiPanel.tsx`.
- [x] **26.07** Settings → Editor (toolbar, web pane, paste formatting) and the cheat sheet's editor keys.
- [x] **26.08** Tests: unit (policy, links, GitHub names, workspace, formatting, paste, server route), end to end in
  a browser (`e2e/links-selection.spec.ts`: card, mark, mention, browser fallback, toolbar, menu, extract, paste,
  AI with the test model, axe) and in Electron (`e2e/desktop.spec.ts`: the pane opens on the left, lies exactly
  over its box, cannot see the app's cookie or Node or open its address, keeps new-tab links, Back, steps aside for
  a dialogue, is released with its tab). Screenshots reviewed.
- [x] **26.09** Documentation: ADR-0045, `docs/guide/markdown.md`, `docs/guide/desktop.md`, FEATURES, STATE,
  CHANGELOG, backlog (B-KM-30 to B-KM-33), AGENTS.md (port 4384, the shell's two kinds of page),
  THIRD_PARTY_NOTICES (Octicons, Lucide), journal.
- [x] **26.10** Release 1.4.0: verify, end-to-end suite, merge, tag, installer. — `npm run verify` (167 files,
  1,040 tests, smoke on 1.4.0) and the whole Playwright suite (153 passed, 3 skipped, none failed) on 12 October.

## Known limits (recorded, not hidden)
- AI answers arrive whole (not streamed), one at a time (B-KM-31); GitHub mentions show `repo#12`, not the issue's
  title (B-KM-32); the pane has no find-in-page or zoom of its own (B-KM-33); links to notes have no hover preview
  yet (B-KM-30).
- Some sites refuse embedded browsers (Google's sign-in among them): *Open in browser* is the way there.

## Gate
- [x] All tasks `[x]` · [x] `npm run verify` · [x] `npm run test:e2e` · [x] merged into `main`

## Recommended commit messages
```text
feat(desktop): web pages beside notes in a sandboxed session
feat(notes): link cards, GitHub mentions, the selection toolbar and the editor menu
feat(ai): writing help on a selection
chore(release): v1.4.0
```
