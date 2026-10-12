# Changelog

All notable changes to Manuscript. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [1.2.0] — 2026-10-12

Appearance (Phase 24): a quieter interface in the spirit of Obsidian, on by default, and colour palettes. Made with
Impeccable (`apps/web/PRODUCT.md`, `apps/web/DESIGN.md`) as a refinement of Manuscript's own design system.

### Release notes

**Updating.** Install `Manuscript-Setup-1.2.0.exe` over 1.1.0. Your vault, data and other settings are untouched. The
first start shows Simplified UI in the Manuscript palette; *Settings → Appearance* turns it off or picks another
palette, and the choice is remembered.

### Added

- **Simplified UI** (*Settings → Appearance*, on by default): fewer lines where a change of surface already
  separates, softer ones where they carry structure; pane headers on their pane's surface; the Files and Details
  panes on the sidebar's surface; quieter cards and section rules; no band behind the editor's current line. On the
  Notes page the title row folds into the tab row, the save status and word count sit in the note's corner when
  there is room, and the file list is Obsidian's: no icons, compact rows, indent guides, file-type tags for
  attachments, full paths on hover. Every control stays — a test compares both interfaces.
- **Colour palettes** for light and dark: Manuscript (the original, still the default), Graphite, Sand, Slate, Sage
  and Iris, shown in miniature in Settings. Status, mastery and graph colours keep their meaning in every palette, and
  every pairing of text, accent and focus meets WCAG 2.2 AA. The caret, selection, scrollbars, the graph and the
  desktop title bar follow the palette.
- **Show files / Hide files** beside *Show details* on the Notes page; the file list starts closed in a phone-sized
  window and never narrows below its toolbar.

## [1.1.0] — 2026-10-12

The notes workspace (Phase 23): the Notes page now works the way an Obsidian user expects, from the student's
review of 1.0.

### Release notes

**Updating.** Run `Manuscript-Setup-1.1.0.exe` over 1.0.0 (close Manuscript first): your vault, settings and data
stay as they are. Nothing in the vault changes on its own; the new version history starts with the first save made
in 1.1.

### Added

- **Tabs and panes** — Ctrl+click (or a middle click) opens a note in a new tab; tabs close with × or a middle
  click, can be dragged into order and are remembered; **Split right** and **Split down** open a second pane; a note
  can open in a window of its own.
- **Obsidian's file menus** — the ⋮ *More options* menu of a note and the right-click menu of the file tree, with
  every item working: backlinks in the document, reading view (Ctrl+E), source mode, split, new window, rename, move
  to a folder, bookmark, merge with another note, add a property, export to PDF, find (Ctrl+F) and replace
  (Ctrl+H), copy path, version history, linked views, open in the default application, show in Explorer, reveal in
  the file tree, make a copy, delete.
- **Version history** — the text a save replaces is kept (at most every five minutes, for 30 days, as plain files
  in the vault's `.skb/history/versions/`), and can be compared and restored; a restore can be undone.
- **Merging, copies and bookmarks** — a merge appends a note to another, points its links there and moves it to the
  trash; a copy never shares the original's id; bookmarks are listed above the tree and follow moves.
- **Sorting and folders** — Obsidian's six sort orders; one button that is *Expand all* or *Collapse all*.
- **The vault on the Notes page** — its name at the foot of the Files pane, with recent vaults, *Open folder as
  vault…*, its folder and *Manage vaults…*; clear pages for an empty vault and for a tab with no note.
- **Details panel** — one panel for the active note, now with **Outgoing** links and **Add property**; closed until
  you open it.
- **Desktop** — a slim title bar in the application's colours (the system's window buttons kept, following the
  theme; the menu's shortcuts still work); PDFs saved straight to a file.

### Changed

- The sidebar is narrower (13.5 rem), can be resized by dragging its edge (or with the arrow keys on it), and starts
  collapsed until you open it. Scrollbars are thin and in the theme's colours.
- In a narrow pane a note's header keeps its name: the study tools fold into one menu and the view switch shows
  icons.

## [1.0.0] — 2026-10-11

The first release: a personal knowledge and learning system for one student's degree, built in twenty-two
gated phases (`docs/checklist/`) with forty-one architecture decisions (`DECISIONS.md`).

### Release notes

**What it is.** Your notes are Markdown files in a folder you choose, and stay usable in Obsidian or any editor.
Around them, Manuscript keeps your lecture material, your course (modules, lectures, assessments, marks), the ideas
you are learning as concepts in a graph, and a learning system — flashcards on an FSRS-6 schedule, questions,
quizzes and mock exams, mastery you can check figure by figure, and a study plan that says why each item is there.
An AI model is optional: with one, answers come from your own material with citations that open the page, and an
assistant can make study material and act on your knowledge base through tools that log every change, can undo it,
and ask before anything destructive. Without one, everything else works.

**How to run it.** On Windows, either the desktop application (`npm run desktop:dist` builds
`Manuscript-Setup-1.0.0.exe`: per user, no administrator prompt, not code-signed, so SmartScreen asks once) or the
browser (`run-web.bat`). Requires Node.js 24 to build. Guides: `docs/guide/README.md`.

**Your data.** The vault defaults to `Documents\Manuscript` and settings to `%APPDATA%\Manuscript`; folders from
before the rename (`Study Knowledge Base`) keep being used. The database is backed up daily and before each update,
and **Settings → Data → Export everything** writes one zip of open formats that can be restored into a new vault.
Uninstalling keeps the vault and the data folder.

**Coming from a 0.1 build.** Nothing to do: 1.0.0 reads the same vault and database (any older database is
migrated on first start, after a backup).

### Added

- **Notes** — Markdown with wikilinks, backlinks, front matter, maths (KaTeX), code, Mermaid and callouts; a
  CodeMirror editor with live preview (the marks hidden away from the cursor), split and preview modes; templates,
  attachments, a trash, renames that rewrite links, and edits made in other programs picked up live, never
  overwritten silently.
- **Search** — full-text search over notes and lecture material down to the page or slide, with filters, phrases and
  exclusions; a quick switcher and a command palette.
- **Library** — PDF, PowerPoint, Word, Markdown and text kept byte for byte, read in the background into located
  passages, with a viewer; recordings, images and scanned pages read by the AI model when one is set up.
- **Course** — courses, modules, lectures with their material and notes, topics, assessments and a mark calculator
  against your targets; concepts that wikilinks resolve to.
- **Graph** — concepts, notes, sources, lectures and modules with typed relations, clusters, bridges, gaps and study
  prompts; a mastery overlay and a view between modules.
- **Flashcards** — basic, reversed and cloze cards, FSRS-6 scheduling per face, a keyboard review session, statistics,
  Anki import and export.
- **Practice** — a question bank of eight kinds, practice quizzes, timed mock exams, adaptive Learn sessions, grading
  your own written answers.
- **Mastery and progress** — mastery per concept from recall and accuracy, with confidence, stages, readiness by
  module and course, weak areas ordered by priority, and credit along prerequisites — every figure shown with its sum.
- **Plan** — a study plan for 7–28 days from your time, deadlines, weights, due reviews and weak concepts.
- **AI, optional** — Anthropic, OpenAI or any OpenAI-compatible provider (a local model too); grounded answers with
  citations; generation of cards, questions, notes and concepts into an Inbox where nothing counts until you accept
  it; a tutor that asks before it explains; a chat assistant with activity rows, approvals and Undo; an MCP server
  for Claude Code and Claude Desktop (never offered destructive tools).
- **Portability, backups and diagnostics** — export everything, restore into a new vault, open another vault or an
  Obsidian vault in place; daily database backups; a diagnostics page and a support bundle without notes or keys.
- **Desktop** — an Electron application running the same server in a background process, with native folder pickers
  and "Show in folder", AI keys protected by the operating system, and a Windows installer.
- **Design** — light and dark themes, a design-system page (Settings › About), a cheat sheet of every key (`?`),
  narrow-window support down to 768 px, reduced motion respected, and accessibility checked with axe on every page.

### Verification

Each phase passed its gate with `npm run verify` and the Playwright suite (at 1.0.0: 898 Vitest tests and 134
end-to-end tests, including the desktop application and its installer's payload). Phase 21 added an end-to-end walk
of every use case, a keyboard-only study session, parser fuzzing (which found and fixed two slow patterns), a soak
test, a recall-calibration report and a fifty-question grounding evaluation. Its report is in
`docs/journal/2026-10-11-claude-opus-5.5.md`.

### Known limitations

- Windows only (macOS and Linux builds were not made); the installer is not code-signed, and there are no automatic
  updates — a newer installer installs over the old one in place.
- Four performance budgets (search with 10,000 PDF pages, the graph's first build and its rebuild after an edit, and
  retrieval for an answer) were over on 11 October on a busy machine — as was the code that met them on 10 October;
  they are to be re-measured on an idle machine.
- Checks left to the owner: a screen-reader spot check, calibration on real review history, and the grounding
  evaluation against real AI providers (`docs/journal/2026-10-11-claude-opus-5.5.md`, Phase 21).
- In narrow windows, side panels stay resizable panes rather than drawers (B-PL-09); between midnight and 04:00 the
  Today deadline widget and the plan can count a day differently (B-LE-38).
- The backlog of ideas not in this release is in `docs/backlog/backlog.md`; technical debt in
  `docs/backlog/technical-debt.md`.

[1.0.0]: https://github.com/WilliamKyaww/manuscript/releases/tag/v1.0.0
