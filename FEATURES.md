# Features

Inventory of every planned, built, deferred and rejected capability. A feature is **Complete** only
when it works end to end, is tested and is documented — never because code exists.

Statuses: **Planned** · **In Progress** · **Partial** (say what is missing) · **Complete** ·
**Deferred** (see backlog ID) · **Rejected** (reason in research/ADR).

_Last updated: 13 October 2026 (Phase 27 — browser follow-up; latest released version 1.4.0)._

## Platform and architecture

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-PL-01 | npm workspaces monorepo with TypeScript 7, Biome, Vitest, Playwright | Complete | 1 |
| F-PL-02 | Local Hono server bound to loopback with token, Host and Origin protection | Complete | 1 |
| F-PL-03 | SQLite via `node:sqlite` with migrations and transactions | Complete | 1 |
| F-PL-04 | Vault folder with `.skb/` metadata, lock and atomic writes | Complete | 1 |
| F-PL-05 | React SPA with typed API client (shared contracts, ADR-0024) | Complete | 1 |
| F-PL-06 | `npm run dev`, `npm run build`, `npm start`, `npm run verify` (incl. bundle smoke test) | Complete | 1 |
| F-PL-07 | `run-web.bat` one-click Windows launcher | Complete | 1 |
| F-PL-08 | Persistent job queue with progress events | Complete | 5 |
| F-PL-09 | Automatic database backups (daily, before a migration, on request) and crash recovery (half-made files cleared, interrupted jobs resumed) | Complete | 17 |
| F-PL-10 | Diagnostics page (state of the installation, failed jobs, log viewer with level and text filters) and a support bundle without notes or keys | Complete | 17 |

## Knowledge — notes and Markdown

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-KN-01 | Markdown notes as files with frontmatter and stable IDs (written into files only when needed, ADR-0025) | Complete | 3 |
| F-KN-02 | CodeMirror 6 editor with preview/split modes, autosave and conflict handling | Complete | 3 |
| F-KN-03 | Maths (KaTeX), code highlighting, Mermaid diagrams, callouts | Complete | 3 |
| F-KN-04 | Wikilinks, embeds, tags (Obsidian-compatible; differences in ADR-0026) | Complete | 3 |
| F-KN-05 | Backlinks and unlinked mentions | Complete | 3 |
| F-KN-06 | Folder tree with rename/move (optional link rewriting) and trash | Complete | 3 |
| F-KN-07 | Templates | Complete | 3 |
| F-KN-08 | Attachments (upload, embed, serve) | Complete | 3 |
| F-KN-09 | Live pick-up of external edits (VS Code, Obsidian) | Complete | 3 |
| F-KN-11 | Frontmatter properties panel and notes settings (ids, ignore patterns, folders, trash) | Complete | 3 |
| F-KN-10 | Live-preview editing decorations | Complete — the marks of headings, emphasis, inline code and links are hidden away from the cursor (a toolbar toggle, on by default); front matter is shown small and muted | 20 |
| F-KN-12 | Tabs and up to two panes (split right or down), remembered per browser, the address following the active tab; a note in a window of its own | Complete | 23 |
| F-KN-13 | Obsidian's file menus: the ⋮ More options menu and the file tree's right-click menu, every item working (desktop-only items disabled in a browser) | Complete | 23 |
| F-KN-14 | Sort orders (file name, modified and created time, both ways) and Expand all / Collapse all | Complete | 23 |
| F-KN-15 | Version history of notes (kept on save, at most every five minutes, 30 days; compare and restore, undoable) | Complete — edits made in other programs are not versioned | 23 |
| F-KN-16 | Make a copy (never sharing the id), merge a note into another (links retargeted, the merged note to the trash), bookmarks (follow moves and merges) | Complete | 23 |
| F-KN-17 | Export a note to PDF (the desktop app saves a file; a browser prints, with Save as PDF) | Complete | 23 |
| F-KN-18 | The open vault on the Notes page, with a menu to open a recent vault or another folder, and empty states for an empty vault and an empty tab | Complete | 23 |
| F-KN-19 | One Details panel (outline, backlinks, outgoing links, properties with "Add property", local graph), closed by default | Complete | 23 |
| F-KN-20 | Live preview draws blocks as Obsidian does: tables, lists (bullets, numbers, indentation), task lists with clickable boxes and any status character, quotes, rules, code blocks, inline and display maths, embedded images | Complete — a table is edited as its source (click it) | 25 |
| F-KN-21 | Callouts: the thirteen types and their aliases with their colours and icons in the editor and the reading view; fold marks in the reading view | Complete — a callout does not fold in the editor | 25 |
| F-KN-22 | Highlight colours (`==🟢text==`), inline footnotes, block ids and links to them, nested heading links, image sizes in Markdown images, PDF page and height | Complete | 25 |
| F-KN-23 | Obsidian's line breaks in the reading view, with a *Strict line breaks* setting for standard Markdown | Complete | 25 |
| F-KN-24 | Web links: the external-link mark, a link card on hover (address, Copy, Edit, Open in browser) in the editor and the reading view | Complete | 26 |
| F-KN-25 | Web pages on the right of the note (desktop app): back, forward, reload, address bar, remembered tabs, failure feedback and browser fallback; a sandboxed session of their own | Placement and recovery verified in Phase 27; live Cloudflare widget rendered, but human verification and ScienceDirect article access remain unconfirmed | 26–27 |
| F-KN-26 | GitHub links as mentions (the mark and a name from the address: repository, issue, pull request, file), offline | Complete | 26 |
| F-KN-27 | Selection toolbar (turn into, inline formats, highlight colours, link, comment, AI, more) and Obsidian's editor menu (Format, Paragraph, Insert, links, search, extract, clipboard), with shortcuts | Complete | 26 |
| F-KN-28 | AI on a selection: improve, fix spelling and grammar, shorter, longer, simplify, list, table, summarise, explain, custom; a suggestion to replace or insert | Complete — needs AI set up; one answer at a time, not streamed | 26 |
| F-KN-29 | Pasting rich text as Markdown (Turndown), plain text with Ctrl+Shift+V; extracting a selection to a new note | Complete | 26 |

## Knowledge — search

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-SE-01 | Full-text search (FTS5) with filters and operators | Complete (date filters: B-SE-01) | 4 |
| F-SE-02 | Quick switcher (with recent notes) and notes in the command palette | Complete | 4 |
| F-SE-03 | Search across source chunks with locators | Complete (one hit per page, slide or section; grouping by source: B-SE-04) | 5 |
| F-SE-04 | Semantic search and hybrid fusion (optional embeddings) | Partial — embeddings, brute-force vector search and reciprocal rank fusion serve Ask; the Search page stays full-text (B-AI-08) | 10 |
| F-SE-05 | Related notes panel | Complete — "Similar notes" in a note's Backlinks tab when semantic search is set up | 10 |

## Knowledge — sources and ingestion

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-SO-01 | Source library with originals preserved | Complete (follows the Sources folder, ADR-0028) | 5 |
| F-SO-02 | PDF ingestion (per-page) and viewer | Complete (scanned pages read with AI: F-SO-07) | 5 |
| F-SO-03 | PPTX ingestion (per-slide, speaker notes) | Complete (slides shown as text; slide pictures: B-SO-02) | 5 |
| F-SO-04 | DOCX, Markdown and text ingestion | Complete (DOCX body only; footnotes and comments: B-SO-03) | 5 |
| F-SO-05 | Web page import with safe fetch | Deferred (B-SO-01) | 5 |
| F-SO-06 | Audio/video transcription | Complete — timed sections with media locators, player beside the transcript; up to 25 MB (B-AI-13) | 11 |
| F-SO-07 | OCR / image understanding | Complete — images read or described, PDF pages without text read by the chat model; imported unread without AI | 11 |
| F-SO-08 | Graphify `graph.json` import | Complete — a code graph of its own (tables, `code` graph nodes, `uses` and `implemented_in` edges), name-match suggestions to accept or reject; not a library source (ADR-0039) | 16 |

## Knowledge — concepts and graph

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-GR-01 | Concepts with aliases, memberships and concept pages (mentions in notes, passages in sources) | Complete | 6 |
| F-GR-02 | Wikilinks resolving to concepts after notes; create a concept from an unresolved link | Complete | 6 |
| F-GR-03 | Typed relations with confidence, status and evidence (added, accepted and rejected on concept pages) | Complete | 7 |
| F-GR-04 | Graph analytics (stable communities, core concepts, bridges, gaps, surprising connections, paths) | Complete | 7 |
| F-GR-05 | Study prompts generated from graph analytics, with actions | Complete | 7 |
| F-GR-06 | WebGL global graph (clusters, filters, search-to-focus, paths) and local graph panels on concept and note pages | Complete | 7 |
| F-GR-07 | AI concept/relation extraction with de-duplication | Complete — proposals with evidence and Graphify confidence; merges for near names; merging two existing concepts in Phase 15 | 11 |
| F-GR-08 | Mastery overlay on the graph | Complete — colour by mastery with a shape per stage and ⚠ for what is worth studying now | 15 |

## Learning — course structure

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-CS-01 | Courses, modules, lectures, topics (modules tied to files by code, ADR-0029) | Complete | 6 |
| F-CS-02 | Assessments with weights (≤ 100 %), deadlines, marks and submitted status | Complete | 6 |
| F-CS-03 | Mark calculator against module targets and the course average (credit-weighted) | Complete | 6 |
| F-CS-04 | Lecture pages: attached sources, notes filed by their `lecture` property, lecture notes from templates | Complete | 6 |

## Learning — flashcards and spaced repetition

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-FC-01 | Basic, reversed and cloze cards with Markdown/KaTeX, concepts, hints and drafts; quick add (Ctrl+Shift+A) | Complete | 8 |
| F-FC-02 | FSRS-6 scheduling (ts-fsrs), one schedule per face, append-only review logs with exact undo | Complete | 8 |
| F-FC-03 | Keyboard review session with undo, edit, suspend, bury, open source and focus mode | Complete | 8 |
| F-FC-04 | Make card from selection (notes and sources), with a locator back to the line, page or slide | Complete | 8 |
| F-FC-05 | Review statistics (due forecast, history, true retention) and session summaries | Complete | 8 |
| F-FC-06 | Anki notes-in-plain-text import and export per set | Complete | 8 |
| F-FC-07 | AI flashcard generation with provenance and review | Complete | 11 |
| F-FC-08 | Exam-aware retention policy | Complete — 0.93 within 14 days of a module's exam or test, switchable in Settings → Study plan | 14 |

## Learning — questions, quizzes and mastery

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-QZ-01 | Question bank (8 kinds) with per-option reasons, explanations, hints, rubrics, tags, concepts and source links | Complete — questions from a selection are B-LE-25 | 9 |
| F-QZ-02 | Practice quizzes and timed mock exams (scope, kinds, difficulty; drafts; self-grading; retakes; Markdown export) | Complete | 9 |
| F-QZ-03 | Adaptive practice sessions (ladder, correct-twice, interleaving) | Complete — questions only; cards in Learn are B-LE-24 | 9 |
| F-QZ-04 | Transparent mastery with roll-ups, readiness and coverage | Complete | 9 |
| F-QZ-05 | Weak-area detection (weak, slipping, lapsing, forgotten, no material) with priority and actions | Complete | 9 |
| F-QZ-06 | AI question generation and AI rubric grading | Complete — grades are suggestions recorded only when accepted | 11 |
| F-QZ-07 | FIRe-inspired implicit credit along prerequisite edges | Complete — credit, at-risk and the explanation (`docs/guide/mastery.md`) | 15 |

## Learning — tutoring and planning

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-PN-01 | Guardrailed Socratic tutor mode | Complete — the ladder is decided by the server; quiz-me records assisted answers after approval; tested with transcripts (a real model is checked by hand, `docs/guide/chat.md`) | 14 |
| F-PN-02 | Misconception check against the knowledge base | Complete — contradictions become correction suggestions in the Inbox, with the lecture's words as evidence | 14 |
| F-PN-03 | Rolling study planner with reasons | Complete — `/plan`, deterministic, keeps what was done (`docs/guide/planning.md`) | 14 |
| F-PN-04 | Today dashboard | Complete — reviews due, deadlines, progress towards the target, weak areas and today's plan | 14 |

## AI and agent

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-AI-01 | Role-based provider registry (Anthropic, OpenAI, OpenAI-compatible, mock) | Complete | 10 |
| F-AI-02 | Secure key storage, usage tracking and spend caps | Complete — keys in the data directory (mode 0600); Electron safeStorage arrives with the desktop app (Phase 18) | 10 |
| F-AI-03 | Grounded Q&A with citations and grounding badges | Complete — in chat (Ctrl+J); the Ask dialogue became the chat panel in Phase 13 | 10 |
| F-AI-04 | Prompt-injection defences for source content | Complete | 10 |
| F-AI-05 | Generation of notes, summaries, cards and questions | Complete — from a lecture, source range, note or selection, with an estimate first | 11 |
| F-AI-06 | Proposals Inbox (AI proposes, user decides) | Complete — drafts and suggestions, batch decisions, per-kind auto-accept | 11 |
| F-AI-07 | Typed tool registry with risk levels and approvals | Complete — 29 tools; approvals bound to their arguments; per-tool overrides in Settings | 12 |
| F-AI-08 | Action log with snapshots and undo | Complete — Settings → Assistant actions; undo refuses once the target has changed | 12 |
| F-AI-09 | MCP server for external agents | Complete — Streamable HTTP and a stdio bridge; no destructive tools offered | 12 |
| F-AI-10 | Agentic chat with activity timeline, approvals and result cards | Complete — threads, streaming, activity rows, approvals, result cards with Undo, compaction; tested with the test model, real providers by hand (`docs/guide/chat.md`) | 13 |
| F-AI-11 | Chat side panel with page context and @mentions | Complete — docked panel on every page; page, selection and @mentions | 13 |
| F-AI-12 | Link suggestions for a note (unlinked mentions, notes close in meaning) as Inbox proposals | Complete — per note; vault-wide in the background is B-AI-15 | 11 |

## Integration

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-IN-01 | Lecture pipeline (import → notes, concepts, cards, quiz proposals) | Complete — a background job with a result per step, optionally by itself when material is attached | 15 |
| F-IN-02 | Cross-module connections view | Complete — shared concepts and relations that cross modules, beside the graph | 15 |
| F-IN-03 | Weak concept → targeted practice in one click | Complete — Practise for a concept with material; questions made from the material for one without; mistakes offered back to the note (Learn with cards only is B-LE-24) | 15 |
| F-IN-04 | Proactive resurfacing before lectures and exams | Complete — Today: the module's weakest concepts and notes to reread | 15 |

## Portability

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-PO-01 | Full export (one zip: vault files, JSON per table, schema, README, Anki text) and restore into a new vault; export → restore → export is equivalent | Complete | 16 |
| F-PO-02 | Concepts as Markdown (in exports, and written into the vault on request), graph as JSON/GraphML, question bank and quizzes as JSON/Markdown | Complete | 16 |
| F-PO-03 | Open an Obsidian vault in place (described first; only an `id` line is ever added to a note) | Complete | 16 |
| F-PO-04 | Vault switching and recent vaults (restarts under `run-web.bat`; otherwise opens at the next start) | Complete — "show in folder" waits for the desktop app (Phase 18); the page copies the path | 16 |
| F-PO-05 | Settings → Data: export, restore, concepts as notes, read the files again, vaults, code graphs | Complete | 16 |
| F-PO-06 | Code that implements a concept, on the concept's page; code nodes in the graph | Complete | 16 |

## Desktop and packaging

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-DE-01 | Electron app with server in a utility process (a token per launch, single instance, window state, menu, restart on switching vault, a prompt when the engine stops) | Complete — unpacked build; the installer is Phase 19 | 18 |
| F-DE-02 | Native pickers and Explorer integration (the bridge has four calls; the page falls back to a file input or "Copy path") | Complete | 18 |
| F-DE-03 | Encrypted secrets with `safeStorage` (a wrapped key; the server encrypts the keys file with it) | Complete — where the system offers protection; otherwise a file only the user can read, and Settings → About says which | 18 |
| F-DE-05 | A slim title bar in the application's colours (system buttons kept and themed, menu hidden with its shortcuts working) and bridge calls to open a vault file in its program, print to PDF and allow a note's own window | Complete | 23 |
| F-DE-04 | Windows NSIS installer (per user, choosable folder, shortcuts, data kept on uninstall; unsigned unless a certificate is given) | Complete — installed, updated in place and uninstalled on the development machine (journal, 10 October); signing needs a certificate | 19 |

## UI/UX

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-UI-01 | App shell with sticky-header page architecture (E2E-enforced on every route) | Complete | 2 |
| F-UI-02 | Light/dark/system themes on design tokens (no flash on load) | Complete | 2 |
| F-UI-03 | Command palette and keyboard shortcut registry with cheat sheet | Complete | 2 |
| F-UI-04 | Accessible primitives and state components (axe-clean in both themes) | Complete | 2 |
| F-UI-06 | Paned pages (each pane with its own fixed header) and lazily loaded routes | Complete | 3 |
| F-UI-05 | Final visual polish across all screens | Complete — tokens and components polished, a design-system page, every screen reviewed in both themes and at 768 px, error states in widgets, a complete cheat sheet, motion and a narrow-window rail | 20 |
| F-UI-07 | Design-system reference page (`/design-system`): every token with its value, every shared component live | Complete | 20 |
| F-UI-10 | Colour palettes (Manuscript, Graphite, Sand, Slate, Sage, Iris) for light and dark, as token overrides; every pairing WCAG AA | Complete | 24 |
| F-UI-11 | Simplified UI (on by default): quieter chrome everywhere, the Notes title row folded into the tab row, an icon-free Obsidian-like file tree; the same controls as the standard interface | Complete | 24 |
| F-UI-09 | A narrower sidebar (13.5 rem), resizable by its edge (12–22 rem, keyboard too), collapsed until opened; thin themed scrollbars | Complete | 23 |
| F-UI-08 | Narrow windows (768–1023 px): the sidebar as a rail, header actions that wrap, icon tabs in narrow panels | Complete — side panels stay resizable panes (drawers: B-PL-09) | 20 |

## Verification

| ID | Feature | Status | Phase |
|---|---|---|---|
| F-QA-01 | End-to-end walk of every use case (UC-01 … UC-16), a keyboard-only study session, page outlines | Complete | 21 |
| F-QA-02 | Parser fuzz tests (text and documents, seeded, `SKB_FUZZ_RUNS`) | Complete — found and fixed two backtracking patterns | 21 |
| F-QA-03 | Soak test of the built server (`npm run test:soak`) | Complete — 12, 20 and 45 minutes without a failure; the eight hours are there to run | 21 |
| F-QA-04 | Recall calibration report (`npm run report:calibration`) | Complete — validated on simulated students; a report on real reviews needs a few hundred of them | 21 |
| F-QA-05 | Grounding evaluation set of fifty questions (`npm run eval:ai`) | Complete — run with the test model; real providers are run with their keys | 21 |
| F-QA-06 | Web/desktop parity: every page in the desktop window, budgets under both runtimes | Complete | 21 |
| F-QA-07 | Release 1.0.0: `run-web.bat` on a clean clone, the installer installed and started, CHANGELOG and release notes | Complete | 22 |

## Deferred

| ID | Feature | Backlog |
|---|---|---|
| F-X-01 | General-purpose databases / property views (Notion, Obsidian Bases) | B-KM-03 |
| F-X-02 | Whiteboards / concept maps (JSON Canvas) | B-KM-05 |
| F-X-03 | Daily notes / study log | B-KM-07 |
| F-X-04 | Inline card syntax inside notes | B-LE-04 |
| F-X-05 | Image occlusion cards | B-LE-05 |
| F-X-06 | Test-based grading for code questions | B-LE-07 |
| F-X-07 | Podcast/audio overviews | B-LE-09 |
| F-X-08 | Per-user FSRS parameter optimisation | B-LE-10 |
| F-X-09 | Research mode with web search (dissertation) | B-AI-04 |
| F-X-10 | Voice tutoring | B-AI-06 |
| F-X-11 | Timetable/deadline import (ICS) | B-PL-01 |
| F-X-12 | Multi-device sync | B-PL-02 |
| F-X-13 | Direct VLE (Moodle) integration | B-PL-03 |

## Rejected

| Feature | Reason |
|---|---|
| Collaboration, sharing, comments | Single-user product |
| Gamification (leaderboards, XP, mascots) | No evidence it improves marks; distracting |
| Block references / transclusion in Markdown | Fragile identity in files (Logseq lesson); ADR-0004 |
| Third-party plugin API | Security and maintenance cost; internal extension points suffice |
| Cloud storage service of our own | Data portability; the user can sync the vault folder |
| Agent tool that sets mastery directly | Mastery is computed from evidence only (ADR-0021) |
| Graphify as a Python sidecar | Packaging cost; algorithms ported instead (ADR-0015) |
