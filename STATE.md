# State — Manuscript

_Last updated: 10 October 2026 — Claude Sonnet 5.5._

## Current phase

**Phase 18 — Electron desktop application: next.** Phases 0 (research), 1 (foundation), 2 (application shell), 3 (notes
and Markdown knowledge base), 4 (lexical search and quick navigation), 5 (source library and
ingestion pipeline), 6 (course structure and concepts), 7 (knowledge graph), 8 (flashcards and
spaced repetition), 9 (questions, quizzes and mastery), 10 (AI foundation), 11 (AI generation and
knowledge extraction) 12 (agent runtime, tool layer and MCP), 13 (chat), 14 (tutor and study planner), 15 (knowledge–learning integration), 16 (portability) and 17 (hardening) are complete and merged into `main`.

## What works

- **Local server** (`apps/server`): Hono on `127.0.0.1` with token (cookie or bearer), Host allowlist,
  Origin and Fetch-Metadata checks; `/auth` sign-in link; RFC 9457 problem details (with `details`);
  CSP and security headers; production SPA serving; server-sent events at `/api/events`.
- **Storage:** `node:sqlite` adapter, checksummed migrations (`0001`–`0016`), vault (`.skb/` layout,
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
- **Tutor and study plan** (Phase 14): **Tutor** mode in chat guides with a ladder the server decides — a
  question first, hints, the first part of the solution, and the full worked solution only on request,
  ending in a check question. **Quiz me** puts questions from your own bank (never their answers) and
  records your reply as *assisted* evidence only after you approve it; that is the one change that cannot
  be undone (ADR-0037). **Check my notes** turns what the lectures contradict into correction suggestions
  in the Inbox. **Plan** (`/plan`): a deterministic plan for 7–28 days from the time you set aside
  (Settings → Study plan), due reviews, mock exams, an exam-day retention pass, coursework hours left,
  lectures to work through and practice on the concepts that matter most, each item with its reason;
  tick, skip, put back, plan again without losing what is done; Today shows today's items. Flashcards come
  back sooner for a module's exam fortnight (93 % recall). Guide: `docs/guide/planning.md`.
- **The study loop** (Phase 15, `docs/guide/study-loop.md`): **Make study materials…** on a lecture runs a
  summary note, concepts and links, flashcards, questions and a quiz as one background job with a result per
  step (all in the Inbox; optionally by itself when material is attached). Mastery now includes **credit along
  accepted prerequisites** (a correct answer on a concept counts a little for what it builds on, with the sum
  shown) and flags what builds on a prerequisite answered wrongly as **at risk**. The graph can be coloured by
  **mastery** (a shape per stage, ⚠ for what to study now) and a **Between modules** panel lists shared
  concepts and cross-module relations. A concept with nothing to practise can get questions from its note and the
  passages naming it; wrong answers on a concept with a note are offered back as **Common mistakes** additions;
  Today shows **the weak spots and notes to reread before a lecture, exam or deadline** (ADR-0038).
- **Portability** (Phase 16, **Settings → Data**, `docs/guide/portability.md`): **Export everything** writes one zip
  — the vault's files as they are, a JSON file per table of your own data with a schema document, flashcards as Anki
  text, the graph as JSON and GraphML, the question bank and quizzes, concepts as Markdown notes, a README — to the
  data folder, with a download; a note without an id gains one in the zip only. **Restore** goes into a new, empty
  folder only (a newer export, an unsafe archive or a damaged one is refused, and a failure leaves nothing behind);
  export → restore → export says the same. **Concepts as notes** writes a note for each concept that has none.
  **Vaults on this computer**: the folder is described first (an Obsidian vault is opened in place; only an `id` line
  is ever added to a note), then opened by restarting under `run-web.bat` (exit code 75) or at the next start.
  **Read the files again**. **Code graphs**: a Graphify `graph.json` becomes `code` nodes in the graph (off by
  default), `uses` edges, and name-match suggestions that wait on the concept's page (**Implemented in**) to be
  accepted or rejected (ADR-0039).
- **Hardening** (Phase 17, `docs/guide/troubleshooting.md`): a copy of the database is made daily, before each
  migration and on request (**Settings → Data → Database backups**, `.skb/backups`, ADR-0040); nothing is written
  half-made under a real name (undo copies, restores, exports and backups are built aside and renamed); disk, file
  and database trouble is said in words (a read-only note is a 423, not a "conflict"); a path Windows would refuse
  is refused in words; a supported file in Sources that cannot be read is listed as failed with the reason; a
  provider that cannot be reached says so. **Diagnostics** (`/diagnostics`, from Settings → About): state,
  background jobs and failures, backups, the log by level and text, and a support bundle with no notes or keys. Every
  registered API route is tested against the guards (188 routes), and the pages with content are scanned for
  accessibility in both themes.
- **Application shell:** sidebar, sticky page headers (per pane on paned pages), themes, command
  palette (`Ctrl+K`), shortcuts (`?`), session gate, toasts; every page is its own code chunk.
- **Commands:** `npm run dev`, `npm run build`, `npm start`, `npm run verify`, `npm run test:e2e`,
  `npm run test:perf`, **`run-web.bat`**.
- **Tests:** 849 Vitest tests (core 236, server 436, web 177) and 119 Playwright tests (sticky headers on every route and pane,
  axe in both themes, the library, the course, the graph, reviewing, practice, chat, generating and an MCP client
  using the stdio bridge) — all green. Retrieval for a grounded answer at 10,000 notes and 10,000 PDF pages:
  p95 434 ms, median 71 ms (provisional budget 500 ms; Phase 17 run).
  Reviewing: 7 ms median between cards over 100 (budget 50 ms). Mastery pass over a year of learning
  (1,000 concepts, 5,000 reviewed cards, 20,000 answers): 254 ms with credit along prerequisites (budget 500 ms). On mains power at 10,000
  notes: search p95 40 ms (112 ms with 10,000 PDF pages; budget 150 ms); graph payload of 5,000 nodes
  175 ms from the cache (budget 500 ms), 2.5 s for a first build (budget 3 s), 755 ms after a note
  edit (budget 1 s) — every budget met in one run on mains power (Phase 17, 10 October).

## In progress

- Nothing; Phase 18 not yet started.

## Incomplete / not started

- Phases 18–22: the desktop app, the installer, polish, verification and the release do not exist yet.
- Not in Phase 17 (debt): a backup runs on the main thread (TD-13); backups live inside the vault, so the guide says
  to export or copy the folder elsewhere for protection from a lost disk.
- Not in Phase 16 (backlog and debt): agent tools for code graphs (B-KM-23), keeping the imported file and
  re-importing with decisions kept (B-KM-24), grouping code by file and other graph formats (B-KM-25), a
  password-protected export (B-PL-07), scheduled exports (B-PL-08); a note with invalid front matter loses
  references on restore (TD-11); the imported graph.json is not kept (TD-12); "show in folder" waits for the
  desktop app (the page copies the path).
- Not in Phase 15 (backlog): cards that know their concepts in the pipeline's first run (B-AI-34), linking
  generated questions to concepts (B-AI-35), suggesting prerequisite relations (B-KM-21), drawn node shapes
  for the overlay (B-KM-22), additions for concepts without a note (B-LE-37).
- Not in Phase 14 (backlog): a retention pass from simulated reviews (B-LE-33), moving or adding plan items
  and a calendar export (B-LE-34), remaking the plan each morning (B-LE-35), time per concept from real
  durations (B-LE-36), asking the model again when a tutor reply breaks its step (B-AI-31), a page for
  tutored sessions (B-AI-32), a vault-wide notes check (B-AI-33).
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
- Performance budgets: all met in the Phase 17 run (mains power, below-normal priority, Discord and VS Code
  open). The four that an earlier, busier run had over were load, as suspected. The figures swing two- to
  three-fold with background load (`AGENTS.md` §5); retrieval p95 (434 ms of 500) is the one with least room.
- One Playwright test (`/notes` light theme, axe) timed out once in a full run on a busy machine and passed twice
  on its own, once with the same seeded data; treated as load, not a defect (journal, 10 October).

## Next steps

1. Create `phase/18-electron` from `main` (done).
2. Phase 18: see `docs/checklist/phase-18-electron.md` (it needs the Electron binary; see the environment notes).

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
approvals; every change is logged and undoable · ADR-0036 chat streams JSON lines from the
server's own runner; a paused run is saved with its thread · ADR-0037 the plan is a pure function,
the server decides the tutor's rung, answers recorded by a tutor are permanent and ask · **ADR-0038**
credit flows only along accepted prerequisites; the pipeline is a job that fills the Inbox; mistakes
go back to notes as suggestions · **ADR-0039** one archive of open formats, restore only into a new vault, a
vault is chosen at start-up, code graphs are shown but not analysed · **ADR-0040** backups are copies SQLite makes,
logs are files in the vault, trouble with the machine is said as such.

## Technical debt

TD-01 launcher duplicates the data-directory logic · TD-05 KaTeX override · TD-06 file tree not
virtualised · TD-07 `shell-quote` override (for `concurrently`) · TD-08 parsing on the main thread ·
TD-09 PDF viewer estimates page sizes from page 1 · TD-10 undo copies are never pruned · TD-11 a note with
invalid front matter has no id in an export · TD-12 the imported graph.json is not kept · TD-13 a backup runs on the main thread.

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
- To try leaving and coming back: **Settings → Data → Export everything**, then restore it into a new folder and open
  that vault from the list (`docs/guide/portability.md`). Keep the zip as carefully as the vault: it holds chats too.
  If you have a coursework repository, map it with Graphify and import its `graph.json` there.
- Try entering this semester's modules and assessments (`docs/guide/course.md`); RQ-02 asks how your
  modules are assessed. Then relate a few concepts and look at the graph (`docs/guide/graph.md`), make the first
  flashcards (`docs/guide/flashcards.md`), and write a few questions for a module to try Learn and
  Progress (`docs/guide/practice.md`, `docs/guide/mastery.md`).
- To try the study loop: attach slides to a lecture and press **Make study materials…** (`docs/guide/study-loop.md`);
  state which concepts are prerequisites for which so that mastery can use it. The check with a real provider is
  yours to do (the automated tests use the test model).
- To try chat: add a provider in Settings → AI (`docs/guide/ai.md`), then follow the short checklist at
  the end of `docs/guide/chat.md` — the check of chat against a real provider (Phase 13's acceptance
  criterion) is yours to do; the automated tests use the built-in test model.
  budget) decides the defaults worth suggesting; without an answer, nothing is preset and the budget
  starts at $10 a month.

## Open questions for the user

`docs/backlog/research-questions.md` — most important: RQ-01 (workflow), RQ-02 (modules and
assessments — Phase 6 was built for weighted exams and coursework per module, credit-weighted per
year), RQ-03 (VLE/recordings), RQ-04 (AI providers and budget), RQ-05 (existing notes to bring in).
