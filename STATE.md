# State — Manuscript

_Last updated: 10 October 2026 — Claude Sonnet 5.5._

## Current phase

**Phase 14 — Tutor and study planner: next.** Phases 0 (research), 1 (foundation), 2 (application shell), 3 (notes
and Markdown knowledge base), 4 (lexical search and quick navigation), 5 (source library and
ingestion pipeline), 6 (course structure and concepts), 7 (knowledge graph), 8 (flashcards and
spaced repetition), 9 (questions, quizzes and mastery), 10 (AI foundation), 11 (AI generation and
knowledge extraction) 12 (agent runtime, tool layer and MCP) and 13 (chat) are complete and merged into `main`.

## What works

- **Local server** (`apps/server`): Hono on `127.0.0.1` with token (cookie or bearer), Host allowlist,
  Origin and Fetch-Metadata checks; `/auth` sign-in link; RFC 9457 problem details (with `details`);
  CSP and security headers; production SPA serving; server-sent events at `/api/events`.
- **Storage:** `node:sqlite` adapter, checksummed migrations (`0001`–`0013`), vault (`.skb/` layout,
  lock with crash recovery, strict path containment), atomic writes, vault-scoped settings.
- **Notes** (Phase 3): Markdown files are canonical; the index (notes, aliases, tags, links,
  attachments, FTS5) is rebuilt from the files and follows edits made in other programs. Ids are
  written into files only when needed (ADR-0025). Editor, preview, backlinks, moves with link
  rewriting, trash, templates, attachments.
- **Search** (Phases 4–5): full-text search over notes **and source passages** (`/search`,
  `Ctrl+Shift+F`) with BM25 ranking, highlighted snippets, phrases, `OR`, exclusions and composable
  tag/type/folder/module/kind filters; notes open at the matching line, sources at their page, slide
  or section. Quick switcher (`Ctrl+O`) and "Search for …" in the command palette.
- **Source library** (Phase 5): PDF, PPTX, DOCX, Markdown and text imported byte for byte into
  `Sources/<module | Inbox>/`, read by a persistent job queue into located sections and chunks; the
  library follows the `Sources` folder (ADR-0028); a viewer with page, slide and section deep links.
- **Course structure** (Phase 6, `/modules`): courses with a target average; modules (code, credits,
  semester, colour, target mark, archive) tied to files by their code — `Sources/<code>/` and notes'
  `module:` property (ADR-0029); lectures with attached library sources and notes filed by their
  `lecture:` property (attach/detach edit the frontmatter; lecture notes from templates); topic trees;
  assessments (weights ≤ 100 %, deadlines, inline marks, submitted status) with the **mark
  calculator** (so far, secured, best possible, what the rest must average) per module and
  credit-weighted per course. Today shows upcoming deadlines and progress towards the target.
- **Concepts** (Phase 6, `/concepts`): names and aliases in one case-folded namespace, summary,
  importance, modules, topics, optional backing note; `[[Name]]` resolves to a concept when no note
  matches; the preview creates a note or a concept from an unresolved link; concept pages list
  mentioning notes and source passages that name it.
- **Knowledge graph** (Phase 7, `/graph`): concepts, notes, sources, lectures and modules with stored
  typed relations (confidence, status, evidence) and edges computed from links and the course
  (ADR-0030); stable Louvain clusters, core concepts, bridges, gaps, surprising connections and
  paths (adapted from Graphify); study prompts with actions; Sigma (WebGL) with ForceAtlas2 in a
  worker, dashed and dotted edges for inferred and ambiguous relations, search-to-focus, filters and
  a details/insights panel; local graphs on concept pages and in the Notes **Graph** tab; relations
  added, accepted and rejected on concept pages.
- **Flashcards** (Phase 8, `/review`): card sets per module or lecture; basic, reversed and cloze
  cards in Markdown with concepts, hints and drafts; quick add (Ctrl+Shift+A) and cards from a
  selection in notes and sources; FSRS-6 (ts-fsrs) with one schedule per face and append-only review
  logs (ADR-0031); a keyboard review session (Space, 1–4, Ctrl+Z, E, S, B, O, F) with a summary;
  statistics; review settings; Anki import and export; Today's reviews widget.
- **Practice** (Phase 9, `/practice`): a question bank of eight kinds (choices, true/false, numeric
  with tolerance, short answers, explanations, derivations, code) with reasons, hints, rubrics, tags
  and concepts; practice quizzes and timed mock exams built by scope, kind and difficulty (drafts,
  self-grading, retakes, Markdown export); adaptive **Learn** sessions (priority, recognition → recall
  → production, correct twice, interleaving). Answers are append-only evidence (ADR-0032).
- **Mastery** (Phase 9, `/progress`): per concept from card recall and weighted answer accuracy, with
  confidence, stages and coverage, every figure shown with its sum; readiness, mastery and coverage by
  topic, module and course; weak areas (weak, slipping, lapsing, forgotten, no material) ordered by
  priority with one-click practice; panels on concept and module pages; Today's Weak areas widget.
- **AI** (Phase 10, optional — everything above works without it): providers (Anthropic, OpenAI,
  OpenAI-compatible such as Ollama or LM Studio) and a model per role in Settings → AI, with
  write-only keys kept in the data directory, connection tests, prices, a monthly budget and usage;
  grounded answers from your sources, sources and notes, or general knowledge too, streamed with
  citations that open the page, slide or line, and a grounding label (now in chat); optional
  semantic search (embeddings, fused with full-text and graph-neighbourhood retrieval) and similar
  notes. `SKB_AI_PROVIDER=mock` runs a built-in test model (ADR-0033).
- **Generation and the Inbox** (Phase 11, optional): **Generate…** on lectures, sources (or a
  page/slide range), notes and selections makes flashcards, questions, lecture notes or concepts,
  after an estimate of passages, tokens and cost; a background job checks every item (a source
  locator, working answer keys, card writing rules, repeats) and leaves cards and questions as
  drafts and notes, concepts, relations, merges and links as proposals in the **Inbox** (`/inbox`),
  accepted, edited or rejected one by one or in batches; Graphify-style concept de-duplication;
  auto-accept per kind (off by default); link suggestions for a note; AI-suggested grades for
  written answers, recorded only when accepted. **Recordings** (audio and video) are transcribed into
  timed sections and play beside their transcript; **images** and **scanned PDF pages** are read by
  the chat model; without AI they import unread and can be read again later (ADR-0034).
- **Assistant tools and MCP** (Phase 12): 29 typed tools over the same services as the app (notes,
  concepts and the graph, sources, course and mastery, flashcards and quizzes, files), each with a
  risk. Reads run; changes run, are logged and can be undone; deleting, merging and anything over
  twenty items always ask, and an approval is bound to the exact arguments, enforced by the server
  whatever a model has been talked into (ADR-0035). **Settings → Assistant actions** shows what was
  done (by the assistant or an MCP client) with Undo, which refuses once something has changed since,
  and a permission per tool. **MCP** at `/api/mcp` (Streamable HTTP, token) and the `mcp.mjs` stdio
  bridge let Claude Code or Claude Desktop search and read the knowledge base and make logged,
  undoable changes; destructive tools are never offered to them. Setup: `docs/guide/agent-tools.md`.
- **Chat** (Phase 13, `/chat` and the side panel on **Ctrl+J**; needs AI): persistent conversations
  you can search, rename and delete. Answers stream with citations and a grounding label; the
  assistant works through the tools in three modes (assistant, tutor, read only) and every step shows
  as an activity row. Deleting and bulk changes stop for an approval card (once, for this chat, or
  decline; deletes never "for this chat"), and anything it made has a result card that opens it and
  an Undo. The composer has @mentions of notes, concepts, modules, lectures and sources, the open
  page and any selected text, and Stop; long conversations are summarised for the model; tokens and
  cost are shown per conversation. A paused run is saved with its conversation, so approvals survive
  a reload (ADR-0036). Guide: `docs/guide/chat.md`.
- **Application shell:** sidebar, sticky page headers (per pane on paned pages), themes, command
  palette (`Ctrl+K`), shortcuts (`?`), session gate, toasts; every page is its own code chunk.
- **Commands:** `npm run dev`, `npm run build`, `npm start`, `npm run verify`, `npm run test:e2e`,
  `npm run test:perf`, **`run-web.bat`**.
- **Tests:** 711 Vitest tests and 85 Playwright tests (sticky headers on every route and pane,
  axe in both themes, the library, the course, the graph, reviewing, practice, chat, generating and an MCP client
  using the stdio bridge) — all green. Retrieval for a grounded answer at 10,000 notes and 10,000 PDF pages:
  p95 404 ms, median 51 ms (provisional budget 500 ms).
  Reviewing: 7 ms median between cards over 100 (budget 50 ms). Mastery pass over a year of learning
  (1,000 concepts, 5,000 reviewed cards, 20,000 answers): 201 ms (budget 500 ms). On mains power at 10,000
  notes: search p95 28 ms (100 ms with 10,000 PDF pages; budget 150 ms); graph payload of 5,000 nodes
  97 ms from the cache (budget 500 ms), 2.1 s for a first build (budget 3 s), 674 ms after a note
  edit (budget 1 s).

## In progress

- Nothing; Phase 14 not yet started.

## Incomplete / not started

- Phases 14–22: the tutor and planner and the desktop app do not exist yet; their sections show
  placeholders.
- Not in Phase 13 (backlog): editing or regenerating a message and branching (B-AI-25), attaching
  files (B-AI-26), exporting a conversation or saving an answer as a note (B-AI-27), runs that carry
  on after the page is closed (B-AI-28), range mentions (B-AI-29), provider token counts for
  compaction (B-AI-30). Chats are canonical in `.skb/skb.db`, not in the vault.
- Not in Phase 12 (backlog): MCP resources and prompts (B-AI-20), a token per MCP client (B-AI-21),
  logging MCP reads (B-AI-22), undoing a whole run (B-AI-23), MCP elicitation so destructive tools
  could be offered (B-AI-24); `record_answer` moved to Phase 14 (14.02, ADR-0035); old copies in
  `.skb/history/` are never pruned (TD-10).
- Not in Phase 11 (backlog): recordings over 25 MB (B-AI-13), generating from long material in
  parts (B-AI-14), vault-wide link suggestions (B-AI-15), undoing a whole generation (B-AI-16), an
  Inbox history (B-AI-17), scans with image-only models (B-AI-18), cards from a recording's time
  range (B-AI-19); merging two existing concepts and tag suggestions arrive in Phase 15.
- Not in Phase 10 (backlog): semantic results on the Search page (B-AI-08), Google provider
  (B-AI-09), price presets (B-AI-10), an AI latency budget (B-AI-11), past questions in Ask
  (B-AI-12); reranking (B-AI-02), local embeddings (B-AI-03). Keys use Electron safeStorage from
  Phase 18.
- Not in Phase 9 (backlog): cards in Learn sessions (B-LE-24 — Learn asks questions only), questions
  from a selection (B-LE-25), calibration (B-LE-26), question bank import/export (B-LE-27), pausing a
  mock exam (B-LE-28), a question's history (B-LE-29), mastery trends (B-LE-30), Learn by lectures
  and tags (B-LE-31), revisiting the Forgotten rule (B-LE-32).
- Not in Phase 8 (backlog): card tags and filters (B-LE-18), per-module new-card limits (B-LE-19),
  cards on concept pages (B-LE-20), personal time estimates (B-LE-21), Anki packages (B-LE-22), a
  large-backlog warning (B-LE-23); per-user FSRS optimisation (B-LE-10).
- Not in Phase 7 (backlog): cluster hulls (B-KM-14), keyboard navigation of the canvas (B-KM-15),
  relation names on edges (B-KM-16), relations to notes and sources in the UI (B-KM-17), rebuilding
  only when links change (B-KM-18), dismissing prompts (B-KM-19), Sigma 4 (B-KM-20).
- Not in Phase 6 (backlog): renaming a module code or lecture key while files use it (B-LE-11/12 —
  refused with an explanation today), reordering and renaming topics (B-LE-13), deleting a course in
  the UI (B-LE-14), degree classification across years (B-LE-15), exam duration in the dialog
  (B-LE-16). Course structure and concepts are canonical in `.skb/skb.db` until Phase 16's export.
- Earlier deferrals: web page import (B-SO-01), slide pictures (B-SO-02), DOCX footnotes (B-SO-03),
  search grouping and highlighting (B-SE-04/05), date filters (B-SE-01).

## Broken

- Nothing known.
- Performance budgets: four are over when measured with the laptop on mains power but busy (10 October,
  with a game launcher, Discord and browsers running): search with PDF pages p95 222 ms (150), graph
  first build 5.0 s (3), graph after an edit 1.5 s (1), retrieval p95 904 ms (500). Phase 13 touches
  none of these paths, and the figures swing two- to three-fold with background load (as at the Phase 10
  merge, `AGENTS.md` §5). Re-run `npm run test:perf` with nothing else open to confirm the figures above.

## Next steps

1. Create `phase/14-tutor-planner` from `main`.
2. Phase 14: the tutor (including `record_answer`, task 14.02) and the study planner.

## Relevant decisions

ADR-0004 hybrid storage · ADR-0007 plain SQL + prefixed ULIDs · ADR-0010 FTS5 first, locators always ·
ADR-0015 graphology + Sigma.js, Graphify ideas ported with attribution · ADR-0020 concepts are entities;
relations carry provenance · ADR-0024 shared Zod contracts · ADR-0025 note ids written only when needed
· ADR-0026 Obsidian-compatible dialect · ADR-0027 Manuscript · ADR-0028 the library follows `Sources` ·
ADR-0029 course structure in the database, tied to files by module code · ADR-0030 the
knowledge graph is computed; only relations are stored · ADR-0011 FSRS-6 via ts-fsrs · ADR-0031
flashcards are scheduled by face, and review logs are never changed · ADR-0021 transparent mastery ·
ADR-0032 mastery recomputed from evidence in one pass; answers written once; Learn replayed from
its answers · ADR-0012 AI SDK 7 · **ADR-0033** AI configuration outside the vault, answers as JSON lines,
fusion in retrieval · ADR-0034 generated material waits as drafts and proposals; AI reads media
through injected readers · ADR-0035 tools are the only way to act; the server enforces
approvals; every change is logged and undoable · **ADR-0036** chat streams JSON lines from the
server's own runner; a paused run is saved with its thread.

## Technical debt

TD-01 launcher duplicates the data-directory logic · TD-05 KaTeX override · TD-06 file tree not
virtualised · TD-07 `shell-quote` override (for `concurrently`) · TD-08 parsing on the main thread ·
TD-09 PDF viewer estimates page sizes from page 1. No new debt in Phases 6–9.

## Environment notes for agents

`ELECTRON_RUN_AS_NODE=1` and `NoDefaultCurrentDirectoryInExePath=1` are set in the Claude Code/VS Code
environment; another local project uses port 5173. axe helpers live in `e2e/axe.ts`. On Windows
PowerShell 5.1, write commit-message files without a byte-order mark and avoid curly quotes in
PowerShell strings (use Node scripts written with the editor tools for prose edits); timings vary with
background load — compare against a worktree of the previous gate (`AGENTS.md` §5).

## Pending for the user

- Rename the local project folder `study-knowledge-base` to `manuscript` (GitHub is already renamed;
  `origin` points at `WilliamKyaww/manuscript`).
- Optional: rename `Documents\Study Knowledge Base` and `%APPDATA%\StudyKnowledgeBase` to `Manuscript`
  while the app is closed (`docs/guide/README.md`).
- Push `main` and the phase branches when convenient (the agent never pushes).
- Try entering this semester's modules and assessments (`docs/guide/course.md`); RQ-02 asks how your
  modules are assessed. Then relate a few concepts and look at the graph (`docs/guide/graph.md`), make the first
  flashcards (`docs/guide/flashcards.md`), and write a few questions for a module to try Learn and
  Progress (`docs/guide/practice.md`, `docs/guide/mastery.md`).
- To try chat: add a provider in Settings → AI (`docs/guide/ai.md`), then follow the short checklist at
  the end of `docs/guide/chat.md` — the check of chat against a real provider (Phase 13's acceptance
  criterion) is yours to do; the automated tests use the built-in test model.
  budget) decides the defaults worth suggesting; without an answer, nothing is preset and the budget
  starts at $10 a month.

## Open questions for the user

`docs/backlog/research-questions.md` — most important: RQ-01 (workflow), RQ-02 (modules and
assessments — Phase 6 was built for weighted exams and coursework per module, credit-weighted per
year), RQ-03 (VLE/recordings), RQ-04 (AI providers and budget), RQ-05 (existing notes to bring in).
