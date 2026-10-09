# State — Manuscript

_Last updated: 9 October 2026 — Claude Opus 5.5._

## Current phase

**Phase 11 — AI generation and knowledge extraction: next.** Phases 0 (research), 1
(foundation), 2 (application shell), 3 (notes and Markdown knowledge base), 4 (lexical search and
quick navigation), 5 (source library and ingestion pipeline), 6 (course structure and concepts), 7
(knowledge graph), 8 (flashcards and spaced repetition), 9 (questions, quizzes and mastery) and 10
(AI foundation) are complete and merged into `main`.

## What works

- **Local server** (`apps/server`): Hono on `127.0.0.1` with token (cookie or bearer), Host allowlist,
  Origin and Fetch-Metadata checks; `/auth` sign-in link; RFC 9457 problem details (with `details`);
  CSP and security headers; production SPA serving; server-sent events at `/api/events`.
- **Storage:** `node:sqlite` adapter, checksummed migrations (`0001`–`0010`), vault (`.skb/` layout,
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
  **Ask** (Ctrl+J): questions answered from your sources, sources and notes, or general knowledge
  too, streamed with citations that open the page, slide or line, and a grounding label; optional
  semantic search (embeddings, fused with full-text and graph-neighbourhood retrieval) and similar
  notes. `SKB_AI_PROVIDER=mock` runs a built-in test model (ADR-0033).
- **Application shell:** sidebar, sticky page headers (per pane on paned pages), themes, command
  palette (`Ctrl+K`), shortcuts (`?`), session gate, toasts; every page is its own code chunk.
- **Commands:** `npm run dev`, `npm run build`, `npm start`, `npm run verify`, `npm run test:e2e`,
  `npm run test:perf`, **`run-web.bat`**.
- **Tests:** 601 Vitest tests and 81 Playwright tests (sticky headers on every route and pane,
  axe in both themes, the library, the course, the graph, reviewing, practice and asking with the
  test model) — all green. Retrieval for a grounded answer at 10,000 notes and 10,000 PDF pages:
  p95 404 ms, median 51 ms (provisional budget 500 ms).
  Reviewing: 7 ms median between cards over 100 (budget 50 ms). Mastery pass over a year of learning
  (1,000 concepts, 5,000 reviewed cards, 20,000 answers): 201 ms (budget 500 ms). On mains power at 10,000
  notes: search p95 28 ms (100 ms with 10,000 PDF pages; budget 150 ms); graph payload of 5,000 nodes
  97 ms from the cache (budget 500 ms), 2.1 s for a first build (budget 3 s), 674 ms after a note
  edit (budget 1 s).

## In progress

- Nothing; Phase 11 not yet started.

## Incomplete / not started

- Phases 11–22: AI generation, the agent and chat, the planner and the desktop app do not exist yet;
  their sections show placeholders.
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
  OCR (Phase 11), search grouping and highlighting (B-SE-04/05), date filters (B-SE-01).

## Broken

- Nothing known.

## Next steps

1. Create `phase/11-ai-generation` from `main`.
2. Phase 11: flashcards, questions, quizzes and lecture or summary notes generated from your material
   with provenance; concepts and relations extracted as proposals; free-text answers graded; audio,
   video and images transcribed — all reviewed before they enter the knowledge base.

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
fusion in retrieval.

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
- To try Ask: add a provider in Settings → AI (`docs/guide/ai.md`). RQ-04 (which providers, what
  budget) decides the defaults worth suggesting; without an answer, nothing is preset and the budget
  starts at $10 a month.

## Open questions for the user

`docs/backlog/research-questions.md` — most important: RQ-01 (workflow), RQ-02 (modules and
assessments — Phase 6 was built for weighted exams and coursework per module, credit-weighted per
year), RQ-03 (VLE/recordings), RQ-04 (AI providers and budget), RQ-05 (existing notes to bring in).
