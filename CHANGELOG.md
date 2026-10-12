# Changelog

All notable changes to Manuscript. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/).

## [1.4.0] — 2026-10-12

Links and selections (Phase 26): web pages beside your notes, link cards, GitHub mentions, a toolbar over
selected text, Obsidian's editor menu, AI on a selection and pasting as Markdown.

### Release notes

**Updating.** Install `Manuscript-Setup-1.4.0.exe` over 1.3.0. Your vault, data and settings are untouched. Links
to the web now open beside the note when clicked in the desktop app; Ctrl+click opens them in your browser, and
*Settings → Editor* can turn the pane off.

### Added

- **Web pages beside your notes** (desktop app): a click on a web link opens the page in a pane on the left of
  the note — back, forward, reload, an address bar, *Copy link*, *Open in browser* — and the note stays open
  beside it. Pages are tabs like notes and come back after a restart. They run in a sandboxed session of their
  own that cannot see Manuscript's sign-in, your notes or your files. In a browser, links open in a new tab.
- **Link cards**: rest the pointer on a web link, in the editor or the reading view, for its address with
  **Copy**, **Edit** and **Open in browser**; links to the web end with Obsidian's external-link mark.
- **GitHub links as mentions**: GitHub's mark and the repository's name (`repo#12` for an issue or pull request,
  `file · repo` for a file), read from the address — nothing is fetched from GitHub.
- **A toolbar over selected text**, as in Notion: *Turn into* (text, headings, lists, tasks, quote, callout,
  code block), bold, italic, underline, strikethrough, code, maths, highlight colours, link, clear formatting,
  comment, **Ask AI** and *More*. Alt+F10 reaches it from the keyboard.
- **Obsidian's editor menu** on a right click: open, copy or edit a link, *Add link*, *Add external link*, *Search
  for …*, *Extract selection to a new note…*, **Format**, **Paragraph**, **Insert** (footnote, table, callout, rule,
  code and maths blocks), **AI**, Cut, Copy, Paste, *Paste as plain text*, Select all.
- **AI on a selection**: improve, fix spelling and grammar, shorter, longer, simpler, a list, a table, a summary,
  an explanation, or your own instruction. The answer is a suggestion — **Replace selection** or **Insert below**
  — and Ctrl+Z undoes it.
- **Pasting keeps formatting**: text from a web page or a document arrives as Markdown (headings, lists, links,
  tables); Ctrl+Shift+V pastes plain text.
- **Formatting shortcuts**: Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+S (strikethrough), Ctrl+Shift+H (highlight),
  Ctrl+` (code), Ctrl+Shift+E (maths), Ctrl+Shift+M (comment), Ctrl+Shift+K (link).
- **Settings → Editor**: the toolbar, the web pane and keeping formatting when pasting, each on unless turned off.

### Changed

- In the editor, a link drawn by live preview opens when clicked; edit it with the card's **Edit** or by moving
  the cursor into it.

## [1.3.0] — 2026-10-12

Markdown as Obsidian writes it (Phase 25): the editor and the reading view now draw the features of Obsidian's
Markdown that notes use, so a note looks the same in both programs. Researched from Obsidian's own help pages.

### Release notes

**Updating.** Install `Manuscript-Setup-1.3.0.exe` over 1.2.1. Your vault, data and settings are untouched; no file
is changed by drawing it differently. One thing looks different at once: in the reading view a single line break in a
note is now shown as a line break, as in Obsidian. *Settings → Appearance → Strict line breaks* turns that off.

### Added

- **The editor draws blocks** (live preview, on by default), with the source back as soon as the cursor is in them:
  **tables** as tables (alignment, bold, links and highlights in cells; click to edit), **lists** with bullets,
  numbers, indentation and hanging lines, **task lists** with boxes you can click (which writes `[x]` to the file),
  any other status character (`[?]`, `[-]`, `[!]`), done tasks struck through, **callouts** with their colour, icon
  and title, quotes, rules, code blocks, **maths** (inline and display) and images embedded with `![[…]]`.
- **All thirteen callout types and their aliases** (`summary`, `tldr`, `hint`, `important`, `check`, `done`, `help`,
  `faq`, `caution`, `attention`, `fail`, `missing`, `error`, `cite`), each with its own colour and icon, in both views;
  an unknown type is a note, as in Obsidian.
- **Highlight colours**: `==🟢text==` with a colour emoji straight after the marks (🔴 🟠 🟡 🟢 🔵 🟣).
- **Inline footnotes** `text^[the note]`, numbered after the ordinary footnotes and listed at the end of the preview.
- **Block ids** (` ^block-id`) are hidden in the preview and can be linked with `[[Note#^block-id]]`, which scrolls to
  the block.
- **Nested heading links** `[[Note#Heading#Subheading]]`, image sizes in Markdown images (`![alt|300x200](img.png)`),
  and PDF embeds with `#page=3&height=400`.
- **Strict line breaks** in *Settings → Appearance* (off by default, as in Obsidian).

### Changed

- A single line break in a note is a line break in the reading view (Obsidian's default). Standard Markdown is one
  switch away.

### Known limits

- A table is edited as its source (no cell-by-cell editing yet); callouts do not fold in the editor; a task's box
  cannot be ticked in the reading view; Markdown images and embedded notes are drawn in the reading view only.

## [1.2.1] — 2026-10-12

### Fixed

- **The desktop app forgot your appearance and layout on every restart** — palette, theme, Simplified UI, open tabs,
  sidebar width and the other preferences kept in the window. The engine started on a new random port each time, and
  the page's storage belongs to its address. The port is now remembered in the data folder
  (`desktop-port.json`) and used again while it is free. Preferences chosen before this fix were already lost and need
  choosing once more.

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
