# Decisions

Architecturally or product-significant decisions, newest last. Trivial implementation choices are not
recorded here. Each entry: **Context · Options considered · Decision · Reason · Consequences**.
To change a decision, add a new entry that supersedes it and mark the old one `Superseded by ADR-NNNN`.

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](#adr-0001--gated-phases-and-a-documentation-backbone) | Gated phases and a documentation backbone | Accepted | 2026-10-04 |
| [0002](#adr-0002--one-web-application-packaged-with-electron) | One web application, packaged with Electron | Accepted | 2026-10-04 |
| [0003](#adr-0003--a-local-nodejs-server-owns-data-and-logic) | A local Node.js server owns data and logic | Accepted | 2026-10-04 |
| [0004](#adr-0004--hybrid-storage-markdown-files--sqlite) | Hybrid storage: Markdown files + SQLite | Accepted | 2026-10-04 |
| [0005](#adr-0005--localhost-security-model) | Localhost security model | Accepted | 2026-10-04 |
| [0006](#adr-0006--nodesqlite-as-the-sqlite-driver) | `node:sqlite` as the SQLite driver | Accepted | 2026-10-04 |
| [0007](#adr-0007--plain-sql-typed-repositories-zod-prefixed-ulids) | Plain SQL, typed repositories, Zod, prefixed ULIDs | Accepted | 2026-10-04 |
| [0008](#adr-0008--sqlite-backed-in-process-job-queue) | SQLite-backed in-process job queue | Accepted | 2026-10-04 |
| [0009](#adr-0009--codemirror-6-for-editing-unified-for-rendering) | CodeMirror 6 for editing, unified for rendering | Accepted | 2026-10-04 |
| [0010](#adr-0010--retrieval-fts5-first-hybrid-later-locators-always) | Retrieval: FTS5 first, hybrid later, locators always | Accepted | 2026-10-04 |
| [0011](#adr-0011--fsrs-6-via-ts-fsrs) | FSRS-6 via ts-fsrs | Accepted | 2026-10-04 |
| [0012](#adr-0012--ai-sdk-7-with-an-in-house-tool-runtime) | AI SDK 7 with an in-house tool runtime | Accepted | 2026-10-04 |
| [0013](#adr-0013--risk-classified-tools-approvals-snapshots-and-undo) | Risk-classified tools, approvals, snapshots and undo | Accepted | 2026-10-04 |
| [0014](#adr-0014--expose-the-tool-layer-over-mcp) | Expose the tool layer over MCP | Accepted | 2026-10-04 |
| [0015](#adr-0015--graphology--sigmajs-graphify-ideas-ported-with-attribution) | graphology + Sigma.js; Graphify ideas ported with attribution | Accepted (implementation note 2026-10-09) | 2026-10-04 |
| [0016](#adr-0016--electron-44-electron-builder-nsis-server-in-a-utilityprocess) | Electron 44, electron-builder (NSIS), server in a utilityProcess | Accepted | 2026-10-04 |
| [0017](#adr-0017--tooling-typescript-7-biome-npm-workspaces-vitest-playwright-esbuild) | Tooling: TypeScript 7, Biome, npm workspaces, Vitest, Playwright, esbuild | Accepted | 2026-10-04 |
| [0018](#adr-0018--frontend-react-19-vite-8-tanstack-tailwind-4-radix) | Frontend: React 19, Vite 8, TanStack, Tailwind 4, Radix | Accepted | 2026-10-04 |
| [0019](#adr-0019--ingestion-parsers-with-a-phase-5-spike) | Ingestion parsers, with a Phase 5 spike | Accepted (spike result and DOCX change 2026-10-08) | 2026-10-04 |
| [0020](#adr-0020--concepts-are-entities-relations-carry-provenance) | Concepts are entities; relations carry provenance | Accepted | 2026-10-04 |
| [0021](#adr-0021--transparent-heuristic-mastery-never-asserted-by-ai) | Transparent heuristic mastery, never asserted by AI | Accepted | 2026-10-04 |
| [0022](#adr-0022--provisional-name-study-knowledge-base-scope-skb) | Provisional name "Study Knowledge Base", scope `@skb` | Superseded by ADR-0027 | 2026-10-04 |
| [0023](#adr-0023--git-workflow-phase-branches-merged-at-gates-no-ai-trailers) | Git workflow: phase branches merged at gates; no AI trailers | Accepted | 2026-10-04 |
| [0024](#adr-0024--shared-zod-api-contracts-instead-of-hono-rpc) | Shared Zod API contracts instead of Hono RPC | Accepted | 2026-10-04 |
| [0025](#adr-0025--note-ids-are-written-into-files-only-when-needed) | Note ids are written into files only when needed | Accepted | 2026-10-07 |
| [0026](#adr-0026--obsidian-compatible-dialect-with-recorded-differences) | Obsidian-compatible dialect with recorded differences | Accepted | 2026-10-07 |
| [0027](#adr-0027--the-product-is-called-manuscript-internal-identifiers-keep-skb) | The product is called Manuscript; internal identifiers keep `skb` | Accepted | 2026-10-08 |
| [0028](#adr-0028--the-source-library-follows-the-sources-folder) | The source library follows the `Sources` folder | Accepted | 2026-10-08 |
| [0029](#adr-0029--course-structure-in-the-database-tied-to-files-by-module-code) | Course structure in the database, tied to files by module code | Accepted | 2026-10-08 |
| [0030](#adr-0030--the-knowledge-graph-is-computed-only-relations-are-stored) | The knowledge graph is computed; only relations are stored | Accepted | 2026-10-09 |
| [0031](#adr-0031--flashcards-are-scheduled-by-face-and-review-logs-are-never-changed) | Flashcards are scheduled by face, and review logs are never changed | Accepted | 2026-10-09 |
| [0032](#adr-0032--mastery-is-recomputed-from-evidence-in-one-pass-answers-are-written-once) | Mastery is recomputed from evidence in one pass; answers are written once | Accepted | 2026-10-09 |
| [0033](#adr-0033--ai-configuration-outside-the-vault-answers-streamed-as-json-lines-fusion-in-retrieval) | AI configuration outside the vault; answers streamed as JSON lines; fusion in retrieval | Accepted | 2026-10-09 |
| [0034](#adr-0034--generated-material-waits-as-drafts-and-proposals-ai-reads-media-through-injected-readers) | Generated material waits as drafts and proposals; AI reads media through injected readers | Accepted | 2026-10-09 |
| [0035](#adr-0035--tools-are-the-only-way-to-act-the-server-enforces-approvals-every-change-is-logged-and-undoable) | Tools are the only way to act; the server enforces approvals; every change is logged and undoable | Accepted | 2026-10-10 |
| [0036](#adr-0036--chat-streams-json-lines-from-the-servers-own-runner-a-paused-run-is-saved-with-its-thread) | Chat streams JSON lines from the server's own runner; a paused run is saved with its thread | Accepted | 2026-10-10 |
| [0037](#adr-0037--the-plan-is-a-pure-function-the-server-decides-the-tutors-rung-answers-recorded-by-a-tutor-are-permanent-and-ask) | The plan is a pure function; the server decides the tutor's rung; answers recorded by a tutor are permanent and ask | Accepted | 2026-10-10 |
| [0038](#adr-0038--credit-flows-only-along-accepted-prerequisites-the-pipeline-is-a-job-that-fills-the-inbox-mistakes-go-back-to-notes-as-suggestions) | Credit flows only along accepted prerequisites; the pipeline is a job that fills the Inbox; mistakes go back to notes as suggestions | Accepted | 2026-10-10 |
| [0039](#adr-0039--one-archive-of-open-formats-restore-into-a-new-vault-a-vault-is-chosen-at-start-up-code-graphs-are-shown-not-analysed) | One archive of open formats; restore into a new vault; a vault is chosen at start-up; code graphs are shown, not analysed | Accepted | 2026-10-10 |

---

## ADR-0001 — Gated phases and a documentation backbone

- **Context.** A large, long-lived personal project built largely by coding agents across many sessions;
  the main risks are lost context, fake completion and scope creep.
- **Options.** (a) Ad-hoc issues; (b) a single TODO file; (c) per-phase checklists with gates, plus
  STATE/FEATURES/DECISIONS/journal files and an AGENTS.md for agents.
- **Decision.** (c). Phases live in `docs/checklist/phase-NN-*.md` using `[ ]` / `[~]` (with "Remaining:")
  / `[x]`; a phase passes its gate only when every required task is `[x]` (implemented, tested, verified,
  integrated, documented).
- **Reason.** Makes status auditable by any future agent and prevents "done" claims for partial work.
- **Consequences.** Documentation upkeep is part of every task; `STATE.md` must stay current.

## ADR-0002 — One web application, packaged with Electron

- **Context.** The brief asks for a web app first and an Electron desktop app later, without two
  separate applications.
- **Options.** (a) Separate web and desktop apps; (b) Electron-only; (c) one SPA served by a local
  server, wrapped by Electron; (d) Tauri.
- **Decision.** (c).
- **Reason.** Identical UI and logic in both modes; development in a normal browser; Electron becomes
  a thin shell. Tauri would need a Rust or sidecar backend, contradicting a single Node server.
- **Consequences.** The UI must never assume Node APIs; desktop-only capabilities go through a small,
  optional preload bridge with web fallbacks.

## ADR-0003 — A local Node.js server owns data and logic

- **Context.** Filesystem access, SQLite, parsing, AI calls with secret keys and long-running jobs
  cannot live in a browser tab.
- **Options.** (a) Browser-only with IndexedDB/OPFS and keys in the browser; (b) local Node server
  (Hono) + SPA; (c) Electron main process doing everything via IPC.
- **Decision.** (b): Node 24 + Hono, bound to loopback; in Electron the same server runs in a
  `utilityProcess`.
- **Reason.** One backend for both modes; keys stay server-side; testable over HTTP; the same pattern
  is used by OpenCode (Hono server + multiple clients).
- **Consequences.** Requires a localhost security model (ADR-0005); the UI talks only HTTP/SSE.

## ADR-0004 — Hybrid storage: Markdown files + SQLite

- **Context.** Data portability is a core requirement ("do not make my knowledge hostage"); learning
  data (schedules, logs, attempts) is structured and high-churn. Logseq's 2026 move from files to SQLite
  (with a one-way Markdown mirror) shows block-level identity in files is fragile.
- **Options.** (a) Files canonical for everything; (b) SQLite canonical with a Markdown mirror;
  (c) hybrid — page-level Markdown notes canonical on disk, originals preserved, SQLite canonical for
  structured learning data and as a rebuildable index.
- **Decision.** (c).
- **Reason.** Notes stay plain files usable in Obsidian, VS Code and Git; structured data gets
  transactions, constraints and queries; the index can always be rebuilt from files.
- **Consequences.** File watching and re-indexing are needed; external edits must be detected (content
  hashes); a stable `id` is written to each note's frontmatter; structured data needs explicit export
  (Phase 16) and backups (Phase 17). Block-level identity is out of scope.

## ADR-0005 — Localhost security model

- **Context.** The server can read/write the vault and spend API credit; browsers can be induced to send
  requests to localhost (CSRF, DNS rebinding).
- **Options.** (a) No protection (loopback only); (b) Host/Origin checks only; (c) token + Host
  allowlist + Origin checks (Jupyter-style bootstrap).
- **Decision.** (c). Token in an HttpOnly `SameSite=Strict` cookie (or `Authorization: Bearer` for
  tools/MCP); bootstrap via `/auth?token=…`; token persisted in the app data dir.
- **Reason.** Cheap to build now, hard to retrofit; defends against both cross-site and local-process
  access.
- **Consequences.** Launchers must open the bootstrap URL; dev proxy must forward cookies; E2E tests must
  authenticate.

## ADR-0006 — `node:sqlite` as the SQLite driver

- **Context.** better-sqlite3 is native and must be rebuilt for each Electron ABI; web claims said
  `node:sqlite` lacks FTS5.
- **Options.** (a) better-sqlite3; (b) built-in `node:sqlite`; (c) libSQL; (d) WASM SQLite.
- **Decision.** (b) behind a thin `SqlDatabase` adapter; better-sqlite3 is the documented fallback.
- **Reason.** Verified locally: Node 24.14's `node:sqlite` ships SQLite 3.51.2 **with FTS5 and JSON1**;
  Electron 44 bundles Node 24.18.1. No native modules ⇒ no Electron rebuilds. Synchronous API suits a
  dedicated server process.
- **Consequences.** Emits an `ExperimentalWarning` on Node 24 (suppressed deliberately); API changes are
  absorbed by the adapter; a Phase 1 spike must confirm `node:sqlite` + FTS5 inside an Electron 44
  `utilityProcess`.
- **Spike result (4 October 2026, Phase 1 task 1.29) — confirmed.** Electron **44.5.1** (Node 24.21.0,
  Chromium 152) running a `utilityProcess`: `node:sqlite` reports SQLite **3.53.4** with FTS5 and JSON1
  working. The unmodified production server bundle (`apps/server/dist/server.mjs`) also ran in a
  `utilityProcess`, posted its `skb:ready` message through `process.parentPort`, answered `/api/ping`
  and authenticated `/api/health`, served the SPA, and printed no experimental warning. Note: the
  Claude Code/VS Code environment sets `ELECTRON_RUN_AS_NODE=1`, which makes `electron` behave as plain
  Node; desktop scripts must unset it (Phase 18).

## ADR-0007 — Plain SQL, typed repositories, Zod, prefixed ULIDs

- **Context.** Many entities; FTS5 virtual tables, triggers and recursive CTEs; driver is `node:sqlite`.
- **Options.** Drizzle ORM; Kysely; plain SQL with typed repository functions.
- **Decision.** Plain, numbered `.sql` migrations and typed repository functions; Zod validates JSON
  columns and all external boundaries; IDs are `<prefix>_<ULID>`.
- **Reason.** SQL stays explicit and readable by any SQLite tool (portability); no ORM/driver adapter
  friction; prefixed IDs are sortable and let tools reject wrong-type IDs.
- **Consequences.** More hand-written mapping code, kept small per module and covered by tests. Kysely
  may be introduced later behind repositories if composition becomes painful (new ADR).

## ADR-0008 — SQLite-backed in-process job queue

- **Context.** Ingestion, embeddings and bulk generation are long-running and must survive restarts and
  report progress.
- **Options.** BullMQ/Redis; a worker-thread pool; a `jobs` table with an in-process worker loop.
- **Decision.** `jobs` table + in-process worker (configurable concurrency, retries with back-off,
  cancellation, SSE progress).
- **Reason.** Single-user local app; no extra services; transactional with the rest of the data.
- **Consequences.** CPU-heavy parsing may later move to a worker thread behind the same interface.

## ADR-0009 — CodeMirror 6 for editing, unified for rendering

- **Context.** Notes are canonical Markdown files shared with Obsidian/Git; content includes code,
  maths and diagrams.
- **Options.** TipTap 3 (+ Markdown extension), Milkdown, BlockNote, CodeMirror 6.
- **Decision.** CodeMirror 6 source editing (live-preview decorations later) with a unified/remark/
  rehype preview (GFM, KaTeX, Mermaid, highlighting) and custom plugins for wikilinks, embeds, tags,
  callouts.
- **Reason.** ProseMirror-based editors re-serialise Markdown and normalise or drop syntax, causing
  churn and loss in user files; CodeMirror edits the text itself (Obsidian's approach).
- **Consequences.** WYSIWYG feel arrives through decorations in the polish phase; a richer editor may
  still be used for small fields (e.g. card faces) if needed.

## ADR-0010 — Retrieval: FTS5 first, hybrid later, locators always

- **Context.** Grounded answers need precise citations; embeddings cost money or bundle size; Graphify
  shows lexical + graph traversal is a strong baseline.
- **Options.** Vector-only RAG; lexical-only; hybrid.
- **Decision.** FTS5 BM25 from Phase 4; optional embeddings fused with Reciprocal Rank Fusion in Phase
  10; graph expansion from matched concepts; every chunk carries a locator (page/slide/heading/time).
- **Reason.** Anthropic's contextual-retrieval results show hybrid + reranking reduces failures most;
  lexical works offline and for free.
- **Consequences.** Chunking must respect document structure; brute-force vector search initially;
  `sqlite-vec` only if needed.

## ADR-0011 — FSRS-6 via ts-fsrs

- **Context.** Spaced repetition must be state of the art, transparent and portable.
- **Options.** SM-2; a home-grown scheduler; FSRS via ts-fsrs.
- **Decision.** ts-fsrs (MIT, FSRS-6), desired retention 0.90, append-only review logs.
- **Reason.** Best available evidence (Anki 25.07+ default), open, optimiser available.
- **Consequences.** Review logs retained for future per-user optimisation; exam-aware retention is a
  documented policy layer on top.

## ADR-0012 — AI SDK 7 with an in-house tool runtime

- **Context.** Need provider independence, tool calling, approvals, streaming UI and testability — not
  a coding-agent harness.
- **Options.** Mastra; LangGraph.js; OpenAI Agents SDK; Claude Agent SDK; DeepSeek Harness (developer
  preview); AI SDK 7 + our own registry/policy/action log.
- **Decision.** AI SDK 7 (`ToolLoopAgent`, `toolApproval`, typed tool context, UI message streams,
  mock models) with an in-house `ToolRegistry`, policy layer, action log and context assembly.
- **Reason.** A library, not a framework: no duplicate storage/memory abstractions; providers swap
  freely; deterministic tests with mock models.
- **Consequences.** AI SDK major-version churn is real (v5 → v7 in about a year); all usage is confined
  to `modules/ai` and `modules/agent`.

## ADR-0013 — Risk-classified tools, approvals, snapshots and undo

- **Context.** The agent must not have unlimited destructive access; actions must be understandable.
- **Decision.** Tools declare `risk: read | write | destructive`. Defaults: read auto; write auto but
  logged and undoable; destructive always asks (never auto). Bulk writes (> 20 items) escalate to
  destructive. Every write stores a snapshot for Undo. Deletes move to trash.
- **Reason.** Mirrors OpenCode's allow/ask/deny model and Mem 2.0's version history; keeps the user in
  control without approval fatigue.
- **Consequences.** Each write tool needs an `undo` and tests for it.

## ADR-0014 — Expose the tool layer over MCP

- **Context.** The user also works in Claude Code/Desktop; MCP 2026-07-28 is the current standard.
- **Decision.** Phase 12 adds an MCP server adapter (stdio + localhost Streamable HTTP with the app
  token) over the same registry; destructive tools excluded by default.
- **Reason.** One tool definition serves the in-app agent and external agents.
- **Consequences.** Tool descriptions must be good for any model, not just ours.

## ADR-0015 — graphology + Sigma.js; Graphify ideas ported with attribution

- **Context.** Graph analytics and rendering; Graphify (Apache-2.0) has proven heuristics in Python.
- **Options.** vis-network (Graphify's choice), Cytoscape.js, react-force-graph, graphology + Sigma.
- **Decision.** graphology on server (analytics) and client (model), Sigma.js for WebGL rendering;
  Graphify's community-splitting, labelling, surprise scoring, suggested-question, de-duplication-guard
  and injection-defence ideas are re-implemented in TypeScript with attribution in code headers and
  `THIRD_PARTY_NOTICES.md`.
- **Reason.** One graph library end to end; scales beyond Graphify's 5,000-node rendering cap; licence
  permits adaptation with notice.
- **Consequences.** Cytoscape may still be used for small hierarchical (prerequisite) views.
- **Implementation note (9 October 2026, Phase 7).** Sigma **3.0.3** with a small React wrapper of our
  own rather than `@react-sigma/core`: Sigma 4.0.0 was released the day before and `@react-sigma`
  still targets 3, so the mature line was chosen and the wrapper keeps an upgrade local. Sigma has no
  dashed edges, so a patterned edge program adapted from its rectangle program (MIT) draws inferred
  and ambiguous edges. ForceAtlas2 runs in our own module worker (not the package's blob worker), so
  starting positions and iteration counts are ours. Louvain comes from
  `graphology-communities-louvain` with a seeded random source; betweenness and paths are small
  functions of our own, because sampled betweenness is needed and the metrics package computes it
  exactly.

## ADR-0016 — Electron 44, electron-builder (NSIS), server in a utilityProcess

- **Context.** Desktop build and a Windows installer are required; the renderer is already built by
  Vite and the server by esbuild.
- **Options.** Electron Forge 8 (Squirrel default, NSIS via community maker); electron-builder 26 (NSIS
  default); electron-vite; Tauri.
- **Decision.** Electron 44 + electron-builder (NSIS); main/preload bundled with esbuild; the server
  bundle runs in a `utilityProcess`.
- **Reason.** Most mature NSIS installer and update metadata; Forge's bundling adds little to our setup;
  a utilityProcess keeps synchronous SQLite work off the main process.
- **Consequences.** Packaging configuration lives in `apps/desktop`; code signing is optional for a
  personal build (SmartScreen warning documented).

## ADR-0017 — Tooling: TypeScript 7, Biome, npm workspaces, Vitest, Playwright, esbuild

- **Context.** TypeScript 7 (Go-native) shipped 8 July 2026 without the JS compiler API that
  typescript-eslint needs. pnpm/Bun are not installed.
- **Decision.** TS 7 for type-checking only; Biome for lint/format; npm workspaces; Vitest 5 +
  Testing Library + happy-dom; Playwright for E2E and Electron smoke tests; esbuild for server/desktop
  bundles; tsx for dev.
- **Reason.** Fewest tools that cover the need; nothing depends on the TS JS API.
- **Consequences.** If a required tool needs the TS API, pin TypeScript 6 for that tool only.

## ADR-0018 — Frontend: React 19, Vite 8, TanStack, Tailwind 4, Radix

- **Decision.** React 19 SPA on Vite 8; TanStack Router (code-based routes) and TanStack Query; Zustand
  for UI state; Tailwind 4 with CSS-variable design tokens; Radix UI primitives; lucide-react; cmdk;
  sonner.
- **Reason.** Mature, accessible, type-safe; tokens allow the late polish phase to restyle without
  restructuring. Base UI noted as an alternative to Radix.
- **Consequences.** Component layer wraps Radix so it can be swapped.

## ADR-0019 — Ingestion parsers, with a Phase 5 spike

- **Decision.** pdf.js (`pdfjs-dist`) for PDF viewing and text; in-house PPTX parser (fflate +
  fast-xml-parser) for per-slide text and speaker notes; mammoth + turndown for DOCX; parsers behind a
  `SourceParser` interface; a Phase 5 spike confirms PDF text extraction in Node and Electron with real
  lecture files before committing.
- **Reason.** Locators (page/slide) are mandatory for citations; general extractors flatten structure.
- **Spike result (task 5.01, 8 October 2026).** `pdfjs-dist` 6.4.299 (legacy build) and `unpdf` 1.8.1
  were compared on two real, publicly available documents — a LaTeX paper (Raft, 18 pages) and lecture
  slides (Stanford CS224N lecture 1, 40 slides, 5.5 MB) — in Node 24.14 and in Electron 44.5.1's Node
  (24.21, `ELECTRON_RUN_AS_NODE`). Both produced identical text (91,448 and 14,988 characters, words and
  line breaks intact, no stray ligature characters) in about 0.3 s and 0.2 s; image-only slides came
  back empty, which is how pages without a text layer are detected. `unpdf` wraps pdf.js and adds
  nothing we need, so **`pdfjs-dist` is used directly**: the legacy build on the server for text, the
  standard build in the browser for viewing — one dependency for both. Its worker is imported into the
  server bundle (pdf.js's in-process "fake worker") so the single-file bundle keeps working.
- **DOCX change (8 October 2026).** `mammoth` depends on `argparse` 1.x and so on `sprintf-js`, which has
  an unfixed denial-of-service advisory (only its command line uses it, but the dependency would ship).
  DOCX is therefore read in-house like PPTX — `fflate` + `fast-xml-parser` over `word/document.xml` —
  producing headings, paragraphs, lists and tables as Markdown-style text with heading-path locators.
  This drops `mammoth` and `turndown`; rich formatting beyond that is not needed for search and study.

## ADR-0020 — Concepts are entities; relations carry provenance

- **Context.** Concepts are the unit of mastery and graph analysis; auto-creating a Markdown file for
  every extracted concept would clutter the vault.
- **Options.** (a) Concepts are notes; (b) concepts are database entities with an optional backing note.
- **Decision.** (b). Wikilinks resolve to a concept when no note matches. Relations are typed and carry
  `confidence` (`USER` / `EXTRACTED` / `INFERRED` / `AMBIGUOUS`), a score, a status
  (`proposed` / `accepted` / `rejected`) and evidence locators (Graphify's model).
- **Reason.** Clean vault, first-class learning model, auditable AI inference.
- **Consequences.** Concepts must be exported (JSON and optional Markdown notes) for portability.

## ADR-0021 — Transparent heuristic mastery, never asserted by AI

- **Context.** Mastery cannot be measured perfectly; opaque scores erode trust.
- **Options.** BKT, Elo, deep knowledge tracing, transparent weighted heuristic.
- **Decision.** Weighted combination of FSRS retrievability and recency-weighted answer accuracy with
  confidence bands, coverage and readiness roll-ups (`docs/prd/learning-system.md` §7). There is no tool
  or API to set mastery directly.
- **Reason.** Explainable from the first review; honest about uncertainty; prevents the model from
  asserting knowledge.
- **Consequences.** Thresholds are named constants; changes need a new decision entry.

## ADR-0022 — Provisional name "Study Knowledge Base", scope `@skb`

**Superseded by ADR-0027** (8 October 2026).

- **Context.** The repository is `study-knowledge-base`; the brief calls the product a "Personal
  Knowledge & Learning OS" but gives no brand name.
- **Decision.** Display name **Study Knowledge Base**, package scope `@skb/*`, vault metadata folder
  `.skb/`. The name is a single constant and can be changed at any time.
- **Consequences.** Renaming later touches only display strings and the installer metadata.

## ADR-0023 — Git workflow: phase branches merged at gates; no AI trailers

- **Context.** Gated phases; the user requires British English commit messages and **no AI co-author or
  attribution trailers**.
- **Decision.** Work happens on `phase/NN-short-name` branches with small, logically grouped commits
  (Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`); when a phase passes
  its gate it is merged into `main` with `--no-ff`. `main` therefore only contains gate-passed work.
  Commit messages never contain `Co-authored-by` lines for AI tools or other AI attribution.
- **Consequences.** `STATE.md` records the active branch; pushing to the remote is done by the user.

## ADR-0024 — Shared Zod API contracts instead of Hono RPC

- **Context.** The PRD (architecture §4) proposed Hono's RPC client (`hc<AppType>`) for a typed API.
  That makes the web package type-check the server's source (Node-only modules such as `node:sqlite`)
  and gives compile-time types only — responses are not validated at runtime.
- **Options.** (a) Hono RPC; (b) shared endpoint contracts in `@skb/core` (method, path, Zod schemas
  for params/query/body/response) used by both sides; (c) OpenAPI generation.
- **Decision.** (b). `defineEndpoint()` in `@skb/core` declares each endpoint; the server registers routes
  from the contract and validates input (and, outside production, output); the web client builds
  requests from the same contract and validates every response with the same schema.
- **Reason.** No cross-environment type leakage; runtime validation on both sides; contracts double as
  documentation and can feed agent-tool schemas later; small (~100 lines) and dependency-free.
- **Consequences.** Paths are declared once in the contract rather than inferred from routes. An
  endpoint's status codes other than 200 will need a small extension when the first one is required.

## ADR-0025 — Note ids are written into files only when needed

- **Context.** ADR-0007 gives every note a prefixed ULID, and the data model said the id is added to a
  note's frontmatter "on first index". Notes are canonical files (ADR-0004), often shared with Obsidian
  and kept in Git or a sync folder: writing into every file when a vault is first opened would change
  hundreds of files the user never touched. Some users already use `id` for their own scheme
  (Zettelkasten numbers). Copied files carry their original's id.
- **Options.** (a) Write `id` into every note on first index; (b) keep ids only in the index; (c) keep
  ids in the index and write them into a file only when something must refer to the note durably, with
  writing every id available as a setting.
- **Decision.** (c). The index assigns an id at once; `ensurePersistentId` writes it into the file when
  other canonical data (cards, concepts, plans — later phases) will refer to the note. The setting
  `assignIds: on-index` writes it into every note. A foreign `id` value is left alone and `skb-id` used
  instead. A file whose id belongs to another existing file is treated as a copy and gets a new id
  written into it; a file whose id belongs to a note that disappeared is that note, moved. Without a
  persisted id, moves are recognised by identical content (and, for moves made in the app, directly),
  and restores from the trash reuse the recorded id. Frontmatter edits are minimal text edits: only
  the edited key's lines change.
- **Reason.** Opening a vault changes nothing; files gain exactly one line, and only when it buys
  something; user data in `id` is never overwritten; references stay valid across renames.
- **Consequences.** A note's id is stable while the index exists; if `.skb/` is deleted, notes without
  a persisted id get new ids (nothing durable refers to them, by construction). Later phases must call
  `ensurePersistentId` before storing a note id.

## ADR-0026 — Obsidian-compatible dialect with recorded differences

- **Context.** The vault must stay usable in Obsidian (knowledge-system.md §2), and the Phase 3 gate
  asks for an ADR if the dialect deviates. The parser is our own (shared by indexer and editor), so
  each rule is a choice.
- **Options.** (a) Reproduce Obsidian exactly, including link resolution by file name and aliases only;
  (b) Obsidian's syntax and resolution, plus a small number of deliberate, documented differences.
- **Decision.** (b). Same syntax (wikilinks, embeds, tags, callouts, highlights, comments, maths with
  Obsidian's `$` rule, Mermaid) and the same resolution order, with these differences: a frontmatter
  `title` is also a link target (after file names, before aliases); ambiguous names prefer the linking
  note's folder, then the shortest path; images from the internet are not loaded by the preview
  (content security policy: the app makes no requests to other sites); block references (`#^id`) are
  parsed and point at the note but are not yet resolved to a position; raw HTML is sanitised with an
  allow-list. The automated compatibility test (`apps/server/test/obsidian-compatibility.test.ts`)
  checks that opening an Obsidian vault changes no file and that links resolve as in Obsidian.
- **Reason.** Titles are how students name notes ("Lecture 3: Consensus"); not loading remote content
  protects privacy and works offline; everything else matches, so notes read the same in both tools.
- **Consequences.** A link that resolves only by `title` will look unresolved in Obsidian (documented in
  `docs/guide/markdown.md` §10). A setting to allow remote images and block-level navigation are in the
  backlog.

## ADR-0027 — The product is called Manuscript; internal identifiers keep `skb`

- **Context.** ADR-0022 chose "Study Knowledge Base" provisionally (research question RQ-11). On
  8 October 2026 the user named the product **Manuscript**. The old name appears in display strings,
  default folders (`Documents\Study Knowledge Base`, `%APPDATA%\StudyKnowledgeBase`), the ping
  identifier and the repository name, and as the abbreviation `skb` in technical identifiers: the
  vault folder `.skb/`, the `skb-id` frontmatter key, the `@skb/*` packages, `SKB_*` environment
  variables, cookie names and problem-type URNs. The user had already run the app, so folders under
  the old name exist (with a note in them).
- **Options.** (a) Rename display strings only; (b) rename everything, including persisted
  identifiers, with migrations; (c) rename everything users see, keep technical identifiers.
- **Decision.** (c). Display name `APP_NAME = 'Manuscript'`, machine identifier `APP_ID = 'manuscript'`
  (ping, `vault.json` `createdBy`, Linux data folder), default vault `Documents\Manuscript`, data folder
  `%APPDATA%\Manuscript` (macOS `~/Library/Application Support/Manuscript`), root package
  `manuscript`, GitHub repository `WilliamKyaww/manuscript`. When no folder with the new name exists
  but one with the old name does, the app and the launcher keep using the old one and say so at
  start-up; nothing is moved automatically. `skb` stays as the internal prefix: `.skb/`, `skb-id`,
  `skb.db`, `@skb/*`, `SKB_*`, `skb_session_*`, `urn:skb:problem:*`.
- **Reason.** Users see the new name everywhere they look, while files already written into vaults
  (`.skb/`, `skb-id`) and every configuration that uses `SKB_*` keep working with no migration — the
  only kind of change that cannot lose data. A three-letter internal prefix need not match the brand.
- **Consequences.** The legacy names live in one constant (`LEGACY_APP_NAMES`) and two small fallbacks
  (server configuration and the launcher, TD-01). Renaming the default folders is up to the user
  (`docs/guide/README.md`). If a later phase wants the internal prefix renamed too, it needs a vault
  migration (rename `.skb/`, read both id keys) and a new ADR.

## ADR-0028 — The source library follows the `Sources` folder

- **Context.** Sources are canonical rows (data-model.md §4: their module, and later the cards,
  questions and citations that point at them), but their originals are files in the vault that the
  user can see, move, rename, edit and delete in other programs (ADR-0004). A library kept only in
  `.skb/skb.db` would drift from the folder, and deleting `.skb/` would leave originals the
  application no longer knows — knowledge held hostage by the database.
- **Options.** (a) The database is the library; files are only reachable through the app's import and
  delete. (b) The folder is the library: the database rows are re-derived from the files and the app
  follows whatever happens to them. (c) A hybrid: rows are canonical for what they carry, and the
  application reconciles them with the folder through the notes index (which already watches every
  file in the vault).
- **Decision.** (c). The notes indexer reports attachment changes; a reconciler (task 5.14) matches
  every supported file under `Sources/` with a source row by path, then by SHA-256: a moved or renamed
  file keeps its source id and is not re-parsed; a file edited in place is re-ingested; a file that
  disappears marks its source *missing* (its sections stay, it leaves search) until the same content
  reappears anywhere in `Sources/`; a file whose content matches a source deleted through the app
  (restored from the trash) brings that source back with its id; any other supported file found there
  is registered and ingested, with its module taken from its folder (`Sources/<module>/…`, `Inbox`
  meaning none); an exact copy of a source that is still in place is left alone (one source per
  content). Deleting a source through the app moves the original to the trash. A full reconciliation
  runs at every start, after the notes index, and also re-ingests sources whose parser version has
  changed.
- **Reason.** The user keeps full control of the originals in a plain folder, external organisation
  is never fought, and losing `.skb/` loses no material: the library rebuilds itself from `Sources/`.
  Matching by content hash keeps ids (and so future references) stable across moves, the common case.
- **Consequences.** Two files with identical bytes are one source. A source's title is its file name,
  so renaming the file renames the source. Module codes are folder names until Phase 6 makes modules
  entities (it will map existing folder codes onto them). Moves made while the app is closed are
  matched by hash at the next start, which reads every new or changed file once.
- **Date.** 8 October 2026.

## ADR-0029 — Course structure in the database, tied to files by module code

- **Context.** Phase 6 adds courses, modules, lectures, topics, assessments and concepts. The vault
  already says which module things belong to — sources by their `Sources/<code>/` folder (ADR-0028),
  notes by their `module` and `lecture` properties — and the user edits both in other programs.
  The checklist planned a `lecture_notes` table "mirroring" frontmatter. Separately, wikilinks have
  to reach concepts, which are database entities (ADR-0020), without breaking how links to notes
  resolve.
- **Options.** (a) Course entities in the database, with join tables (`lecture_notes`, module ids on
  notes and sources) kept in sync with the files. (b) The course structure as files too (a YAML file
  or a note per module and lecture). (c) Course entities in the database, joined to files by the
  module **code** and lecture **key** at query time, with any association made through the app
  written into the file.
- **Decision.** (c). Modules have a unique, case-insensitive `code_key`; a module's sources and
  notes are those whose `module_code` matches it, and a lecture's notes are those whose `lecture`
  property names it (`COC251/L03`, or `L03` with `module: COC251`). Attaching a note writes those
  two properties (a minimal frontmatter edit); detaching removes `lecture`. There is no
  `lecture_notes` table. Which sources belong to a lecture cannot be said by the file, so that one
  association is a table (`lecture_sources`). A code or key cannot change while files refer to it.
  Concepts share one case-folded namespace of names and aliases, and a bare link resolves to a
  **note first** (file name, title, alias), then a concept, then an attachment; links to concepts are
  never rewritten by moves, and deleting a concept leaves them unresolved.
- **Reason.** The files stay the record of what belongs where: a note filed in Obsidian is in the
  right lecture at once, there is no second copy to drift or conflict, and losing `.skb/` loses no
  association a file carries. Module codes are what students already write. Notes winning over
  concepts keeps every existing link meaning what it meant (ADR-0020: concepts resolve "when no
  note matches").
- **Consequences.** Renaming a module code or lecture key is refused while notes or sources use it,
  until a rename that moves the folder and rewrites the properties exists (backlog B-LE-11). The
  course structure, assessments, marks and concepts themselves live only in `.skb/skb.db` and
  need the Phase 16 export (data-model.md §6); a backing note is where a concept's longer
  explanation belongs. Creating a note with a concept's name takes over that name's links, by
  design. Joins use `lower(module_code)`, which the indexed columns keep cheap at a student's scale.
- **Date.** 8 October 2026.

## ADR-0030 — The knowledge graph is computed; only relations are stored

- **Context.** Phase 7 draws concepts, notes, sources, lectures and modules as one graph and runs
  analytics on it. Most of its edges already exist elsewhere: links in the notes (the notes index),
  course membership (the course tables and note properties, ADR-0029). Only typed relations between
  concepts are new information.
- **Options.** (a) A stored graph: node and edge tables kept in step with notes, sources and the
  course on every change. (b) A computed graph: assembled on request from the existing tables, with
  only the typed relations stored, and cached. (c) A graph database alongside SQLite.
- **Decision.** (b). `relations` holds the stored edges (confidence, score, status, evidence,
  creator); everything else is assembled with graphology when the graph is asked for and cached
  in memory until a `vault.changed`, `sources.changed` or `data.changed` event (published after
  course, concept and relation writes). Analytics are reused while a fingerprint of the graph's
  nodes, names, modules and edges is unchanged; community assignments are persisted only so that
  cluster ids stay stable (`graph_communities`, derived). Node ids are entity ids.
- **Reason.** Nothing to keep in sync, so the graph cannot drift from the files; links edited in
  Obsidian appear at once; the stored part is exactly what the student or the assistant asserted,
  with its provenance. The cost — rebuilding on change — measured 2.1 s at 10,000 notes and 1,000
  concepts, 674 ms after a note edit that changes no link, and 97 ms for a cached 5,000-node payload
  (architecture.md §14).
- **Consequences.** Relations are polymorphic; triggers remove those of deleted concepts,
  lectures, modules, topics and sources, while relations to notes survive index rebuilds and are
  skipped while a note is missing (notes at either end get their id written in, ADR-0025). Every
  saved note marks the graph stale, so very large vaults with the graph open pay the assembly cost
  per save (backlog B-KM-18: tell the graph when links, rather than text, changed). The graph is
  rebuilt after a restart (first open ~2 s at 10,000 notes). Export (Phase 16) needs only
  `relations`.
- **Date.** 9 October 2026.

## ADR-0031 — Flashcards are scheduled by face, and review logs are never changed

- **Context.** Phase 8 schedules flashcards with FSRS-6 (ADR-0011). A reversed card asks two
  questions and a cloze card one per number; editing a card must not lose the history of what was
  already reviewed. The review history is also the input of a future per-user FSRS optimisation, and
  "undo last rating" must restore a card exactly.
- **Options.** (a) One row per question (as the data model first had it): a reversed or cloze card
  becomes several cards, and editing the shared text means editing several rows. (b) One authored
  card with one schedule per *face* (direction or cloze number). For undo: (i) delete the last log row
  and roll the schedule back with ts-fsrs's `rollback`; (ii) keep every row, store each rating's
  schedule before and after, and record undo as a row of its own.
- **Decision.** (b) and (ii). `card_schedules` is keyed by (card, ordinal); saving a card adds faces
  for new cloze numbers and retires those whose numbers were removed (kept with their history,
  revived if the number returns). `review_logs` are append-only, enforced by triggers: a rating stores
  the schedule before and after; undo restores the "before" exactly and writes an `undo` row pointing
  at the rating. Statistics and summaries count only standing ratings. The review day runs from
  04:00 to 04:00 local time, and learning faces due within 20 minutes are shown early when nothing
  else is due (both as in Anki).
- **Reason.** One card stays one thing to edit, move, suspend or delete, while each question keeps its
  own memory model. Storing the schedules makes undo exact (rollback cannot restore everything, for
  example the previous last-review time) and keeps the full history, including mistakes, for
  optimisation and for trust ("what happened to this card?").
- **Consequences.** Suspending, burying and statuses are per card, burying per face. The log grows
  with every rating and undo (a few hundred bytes each). Deleting cards or sets is soft, so the log's
  references stay valid; purging is for Phase 16's data tools. Exporting reviews to Anki is not
  possible in its plain-text format (cards travel; schedules do not).
- **Date.** 9 October 2026.

## ADR-0032 — Mastery is recomputed from evidence in one pass; answers are written once

- **Context.** Phase 9 adds questions, quizzes, mock exams, adaptive Learn sessions and the mastery
  model (learning-system.md §7, ADR-0021). Mastery must be reproducible by hand from the components
  shown, never set directly, and cheap enough to stay current; answers are the evidence, and open
  answers are graded by the student after they are given. A Learn session chooses each question from
  the answers so far, and mastery moves while it runs.
- **Options.** For mastery: (a) store a running score per concept, updated on each event; (b)
  recompute every concept from cards and answers whenever something changed, keeping the result in a
  derived cache. For answers: (i) mutable rows (edit a score, re-answer in place); (ii) append-only rows
  where a pending answer may be given its score once. For Learn: (x) keep the session's state on the
  server; (y) fix its concepts (priority, stage) and questions at the start and rebuild its state from
  its answers.
- **Decision.** (b), (ii) and (y). The mastery service computes every active concept's components,
  signals and priority in one pass (reviewed faces' retrievability, the last 20 scored answers,
  lapses, schedules a fortnight ago, upcoming assessments) and replaces `mastery_cache`; it is stale
  after a review, an answer, a card or question change, any `data.changed` or `vault.changed` event,
  or after 15 minutes. Answer ages are whole review days. Answers are append-only by trigger, except
  that a pending answer (score NULL) is given its score once. A Learn session is an `adaptive` quiz
  whose config holds its concepts' priority and stage at the start and whose items are the questions
  it may ask; `@skb/core` `practiceSession` replays its answers with a seed from the quiz id. Learn
  asks questions only; cards stay in Review (backlog B-LE-24).
- **Reason.** Recomputing is simple, always consistent with the evidence (no drift, nothing to
  repair), and fast at this scale; whole days make every weight exact on screen. Writing answers once
  keeps the history trustworthy and usable for later calibration and AI grading. A replayed session
  needs no extra state, survives reloads and restarts, and is deterministic to test; fixing its
  inputs keeps the path stable while mastery changes underneath. Keeping cards out of Learn avoids
  answering a card outside FSRS's schedule (early-review inflation) until a rule for it is designed.
- **Consequences.** Each read after a change recomputes everything (milliseconds for hundreds of
  concepts; measure before thousands). The cache table is rebuilt wholesale and can be dropped at any
  time. Mock-exam drafts live on the attempt, outside the evidence. Concepts with only cards cannot
  be practised in Learn yet; their "Practise" action explains why. Priority defaults (no credits, no
  dated assessment, no module) are documented in learning-system.md §9.
- **Date.** 9 October 2026.

## ADR-0033 — AI configuration outside the vault; answers streamed as JSON lines; fusion in retrieval

- **Context.** Phase 10 adds the AI layer (ADR-0012): providers, a model per role, keys, spend
  limits, embeddings and grounded answers. Keys must never enter the vault, logs or client
  responses; the app must work without AI; answers must cite real passages; tests must not need a
  network or a paid provider.
- **Options.** Configuration in the vault's settings table, or in the per-user data directory. The
  answer stream as the AI SDK's UI message stream (consumed with `@ai-sdk/react`), as server-sent
  events, or as JSON lines. Fusing lexical and semantic results in the search service, or in a
  retrieval service of the AI module. Vectors in `sqlite-vec`, or brute force in memory.
- **Decision.** Providers and preferences live in `ai.json` and keys in `secrets.json` in the data
  directory (mode 0600; Electron `safeStorage` behind the same interface later); usage records
  (`ai_usage`) and derived `embeddings` live in the vault database. One registry builds every
  provider client. `POST /api/ai/ask` streams one JSON event per line (passages, text deltas, then
  the checked answer), read by the shared API client. Reciprocal rank fusion of full-text,
  concept-neighbourhood and semantic rankings happens in the AI module's retrieval service; search
  itself stays lexical. Vectors are normalised and kept in memory as 8-bit integers and searched by
  brute force. `SKB_AI_PROVIDER=mock` swaps every model for deterministic built-in models.
- **Reason.** Keys and provider choices belong to the machine and the user, not to a vault that may
  be synced or shared. JSON lines keep the browser free of AI SDK code (ADR-0012 confines it to
  the server) and carry exactly what the UI needs, validated by shared Zod schemas; the Phase 13
  chat can still adopt UI message streams. Search must keep working with AI off, so it cannot
  depend on embeddings. Brute force over int8 vectors is fast enough for a student's library
  (tens of thousands of passages) without a native extension.
- **Consequences.** A vault opened on another computer has no AI settings until they are entered
  there. Spend is counted per vault database. Memory grows with the library (about 46 MB for 30,000
  vectors of 1,536 numbers). Changing the embedding model re-embeds everything. Costs are estimates
  from prices the user enters.
- **Date.** 9 October 2026.

## ADR-0034 — Generated material waits as drafts and proposals; AI reads media through injected readers

- **Context.** Phase 11 lets models generate cards, questions, notes, concepts and relations, grade
  written answers, suggest links, transcribe recordings and read images and scans. The acceptance
  criteria: every generated item has a valid locator; nothing becomes active without acceptance
  unless auto-accept is on; duplicates are flagged. Generation costs money, models return malformed
  output now and then, and the app must keep working without AI.
- **Options.** Proposed concepts and relations as rows in `concepts` and `relations` with status
  `proposed` (both tables have one), or one `proposals` table for the Inbox. Generated cards and
  questions as proposals, or as rows with status `draft`. Structured output by tool calls, or by
  the AI SDK's `Output.object` with a schema. Citations in generated notes as app addresses
  (`/library/…`), or as wikilinks to the files in the vault. Recordings split with ffmpeg, or sent
  whole. AI calls inside the source parsers, or behind an interface.
- **Decision.**
  - Cards and questions are saved as `draft` rows of their own tables (created by `ai`), so the
    editors, locators and duplicate checks are the ordinary ones; drafts are never studied or
    counted. Concepts, relations, merges (aliases), links and notes are rows of a new `proposals`
    table (migration 0011) with a payload, evidence quotes with locators, an origin and a
    normalised `dedupe_key`; rejected proposals are kept so they are not made again. Relation ends
    may point at proposed concepts; accepting the relation accepts them, rejecting a concept
    supersedes its relations. Accepted relations become `USER`/`accepted` (data-model.md §5.5),
    keeping their evidence; accepted concepts are recorded as `covered_in` their lecture or source.
    The `proposed` statuses of `concepts` and `relations` stay unused for now.
  - Generation asks for a Zod schema through `Output.object` with every field required (providers'
    structured outputs reject optional fields), gives one repair attempt with the validation error,
    records every attempt's usage and is never retried by the job queue. Its output allowance is
    sized from the request, not from the "longest answer" setting for questions.
  - Concept names are de-duplicated with Graphify's guards (adapted, Apache-2.0): exact or plural
    forms are the same concept, a Jaro–Winkler score of 0.94 or more proposes a merge, 0.88–0.94 is
    judged by the fast model when one is set up and otherwise shown beside its likely match.
  - Notes cite with wikilinks to the vault files (`[[Sources/…/L3.pdf#page=4|p. 4]]`) and list their
    sources in frontmatter, so they stay readable in any Markdown editor.
  - Recordings, images and scanned pages are read by an `AiReader` (in `modules/ai`) that the
    source parsers receive; transcription is a fourth model role, priced per audio minute. Without
    AI the file is imported with a warning and can be read again later. Recordings are sent whole,
    up to the provider's 25 MB limit.
  - Auto-accept is a per-kind preference in `ai.json`, off by default.
- **Reason.** One Inbox table keeps every suggestion reviewable in one place without polluting the
  concept namespace (names and aliases are unique) or the graph before the student decides; cards
  and questions are better reviewed with the editors they will live in. Rejections must stick, or
  regenerating would nag. A repair attempt fixes most malformed replies at little cost, while
  automatic retries could multiply spend. Wikilinks keep generated notes portable (principle 1).
  Injected readers keep the AI SDK confined (principle 5) and the parsers testable; sending
  recordings whole avoids a native ffmpeg dependency for now.
- **Consequences.** Two places hold pending AI output (draft rows and proposals), both listed by the
  Inbox. A merge proposal adds a name but does not yet merge two existing concepts (Phase 15).
  Recordings over 25 MB cannot be transcribed until chunking arrives (backlog). Images and scans need
  a chat model that accepts images and PDFs. Costs remain estimates from user-entered prices.
- **Date.** 9 October 2026.

## ADR-0035 — Tools are the only way to act; the server enforces approvals; every change is logged and undoable

- **Context.** Phase 12 lets a model, and external programs over MCP, act on the knowledge base
  (ADR-0012, ADR-0013, ADR-0014). The founding constraints: the agent must not have unlimited
  destructive access; the knowledge must not be held hostage by the application; text in the
  student's own files must not be able to turn the assistant against them.
- **Options.** Safety by prompting the model, or by rules the server enforces. Approvals as a UI
  flag the client sets, or as tokens the server checks. Undo as a database transaction log, or per
  tool from a small record. Concept merging as a status (`merged`, a tombstone row), or as a
  redirect and delete. An MCP server as a second process opening the vault, or inside the app. The
  agent loop as `ToolLoopAgent`, or `generateText` with `stopWhen` and `prepareStep`.
- **Decision.**
  - A tool is `{ name, input, output, risk, execute, undo }` over a domain service
    (`modules/agent`); writes must declare an undo (`defineTool` refuses otherwise). The agent and
    MCP call only `registry.call`, which validates input and output and applies the policy.
  - The policy is pure and in `@skb/core` (`decideApproval`): reads run; writes run, are logged and
    can be undone; destructive calls always ask; a write touching more than 20 items counts as
    destructive; the person's per-tool overrides (stored in `ai.json`) may only make a tool
    stricter, and never lift a destructive tool's approval.
  - An approval is an HMAC of the tool name and the validated arguments under a per-process
    secret; the registry refuses a call that needs one without a matching token. The agent loop
    maps the policy onto the AI SDK's `toolApproval`, pauses when a call needs the person, asks an
    `approve` callback and mints the token only for the approved call. MCP clients cannot approve:
    destructive tools are not offered to them, and a call that would ask is refused.
  - Migration 0012 `agent_actions` is append-only (triggers allow only marking a row undone). It
    records changes, refusals and failures, not reads. Its statuses are `executed`, `denied`,
    `failed`, `undone`, with the approval (`auto` or `user`) in a column of its own — a
    simplification of the data model's earlier six-valued status.
  - Undo is per tool, from a small JSON record and, for files, copies under `.skb/history/<action>/`.
    `canUndo` refuses once the target has changed since (a note's hash, a quiz's attempts), so an
    undo never overwrites the student's later work.
  - Merging concepts redirects every reference (cards, questions, relations, memberships) to the
    kept concept, turns the merged name and aliases into aliases of it, and deletes the merged row,
    with a full snapshot for undo. The `merged` status stays unused: a tombstone would hold the
    name in the unique namespace.
  - Everything from the student's files that a tool returns (source passages, note text, search
    snippets, other files) is wrapped as untrusted data with sentinels neutralised; the system
    prompt says wrapped text is never to be obeyed. This is a second line: the first is that the
    server enforces the policy whatever the model has been talked into.
  - MCP is served inside the app at `/api/mcp` (Streamable HTTP, stateless, behind the token and
    Host guards) using the SDK's web-standard transport. `mcp.mjs` (stdio) only relays to it,
    because the app keeps the vault locked to a single process.
  - `record_answer` is not built in this phase. Answers are append-only evidence (ADR-0032), so
    recording one cannot be undone, which this phase's rule forbids for any write; the tutor's
    "quiz me" flow (14.02) will own it, with a tutor session to hang the answers on.
- **Reason.** A model can be persuaded; a server-side rule cannot. Binding approvals to arguments
  means what ran is what was shown. Reads left out of the log keep it readable and small. Undo
  with a guard is safer than undo that always succeeds. Delete-and-snapshot keeps the concept
  tables free of rows that look alive but are not. A relay for stdio avoids two processes fighting
  for the vault.
- **Consequences.** Every new write tool needs an undo and a test for it. The MCP bridge needs the
  app running. Approval tokens live only in memory, so a restart forgets pending approvals (the
  call simply asks again). The catalogue in the user guide is generated from the registry
  (`npm run docs:tools`, checked by a test). Phase 13 turns the runner's approval callback into the
  chat's approval cards; Phase 14 adds `record_answer` and the planning tools.
- **Date.** 10 October 2026.

## ADR-0036 — Chat streams JSON lines from the server's own runner; a paused run is saved with its thread

- **Context.** Phase 13 puts the agent runner (ADR-0035) behind a conversation: threads that are kept,
  answers that stream, tool calls shown as they happen, and approvals that wait for the student —
  possibly across a page reload — before the run carries on. The architecture notes had planned the AI
  SDK's UI message stream for this.
- **Options.** The AI SDK UI message stream and its React hook, or the project's own newline-delimited
  JSON events (as Ask already uses, ADR-0033). Keeping a paused run in memory, or saving it with the
  thread. Approvals as part of the stream's request, or as a second request. Compaction by dropping
  old turns, or by summarising them.
- **Decision.**
  - Chat streams `application/x-ndjson` events defined once in `@skb/core` (`ChatEventSchema`:
    `user`, `assistant`, `passages`, `text`, `tool`, `paused`, `done`, `error`), validated on both
    sides, with the same Hono `stream` and abort handling as Ask. The web app keeps no AI SDK
    dependency (principle 5 stays intact), and a `tool` event carries a whole `ToolPart` (state,
    summary, risk, action id) that replaces the earlier state of the same call. This supersedes the
    plan to stream the SDK's UI message parts; the message parts we store are our own (`ChatPart`).
  - A message is a run of the runner. `POST /api/chat/threads/:id/messages` saves the person's
    message, retrieves passages (the Ask retrieval, narrowed by the page and @mentions), streams the
    run into the assistant's message and saves it. Passages are given to the model with citation
    keys, the keys in the answer are checked, and the grounding label is stored with the message.
  - A run that needs an approval **ends** its stream with `paused`. Everything needed to carry on —
    the model's messages so far, the pending calls (with their approval ids), the calls already
    approved, the steps used and the instructions — is saved in the thread (`pending_json`), so it
    survives a reload or a restart. `POST …/approvals` takes one decision per pending call (approve
    once, approve for this chat, decline), re-enters the runner with them, and continues in the same
    assistant message. A thread with a pending run refuses new messages (409) until it is decided.
  - "Approve for this chat" adds the tool to the thread's allowed tools. It is never offered for,
    and never applies to, destructive calls, which ask every time (ADR-0035 still decides; the thread
    only supplies the approval tokens for calls the policy says may be covered).
  - The runner keeps every step's messages from `result.steps`: in AI SDK 7 the run's `response`
    holds only the last step, which silently dropped earlier tool calls from a resumed conversation.
  - Compaction: when the saved history outgrows the context budget, the older turns are summarised
    (quick-tasks model if there is one) into the thread's summary, which rides along in the
    instructions; the visible conversation is never shortened. Passages are removed from the
    saved history after each answer, as they only mattered for it. Usage and cost are added to the
    thread.
  - Migration 0013: `chat_threads` (settings, history, summary, pending run, usage) and
    `chat_messages` (parts and mentions as JSON, plain text for search).
  - The Ask dialogue is replaced by a docked chat panel (Ctrl+J) beside the page, with the same
    conversation as the Chat page. `POST /api/ai/ask` stays for programs and tests.
- **Reason.** One schema for both sides is checked everywhere and keeps the browser free of the SDK.
  Saving the pause makes approvals durable and keeps the server stateless between requests. Keeping
  step messages makes a resumed run see what it already did.
- **Consequences.** A stream cut off by the network leaves the run stopped, with its notice; the
  person sends again. Two runs on one thread are refused. Chat threads are canonical in
  `.skb/skb.db` and are not part of the Markdown export until Phase 16 decides (B-AI-27). The mock
  model plans the brief's example requests so they can be tested end to end; real providers are
  checked by hand (`docs/guide/chat.md`).
- **Date.** 10 October 2026.

## ADR-0037 — The plan is a pure function; the server decides the tutor's rung; answers recorded by a tutor are permanent and ask

- **Context.** Phase 14 adds a study planner, a guardrailed tutor with a "quiz me" flow, and a check of the
  student's notes against the lectures. The founding constraints still hold: the agent has no unlimited
  access, nothing is hostage to the app, the app works without AI. Three things pull against the rules
  written for Phase 12: the planner must be explainable and repeatable, "a tutor that does not give the
  answer away" cannot depend on a model behaving, and recording an answer is evidence that ADR-0032 makes
  append-only — so it cannot be undone, which ADR-0035 forbids for every write.
- **Options.** The planner as a model prompt, or as code. The tutor's ladder in the prompt alone, or decided
  by the server. `record_answer` as a destructive tool, as an ordinary write with a "void" mechanism over
  append-only answers, or as a new kind of write. Exam-aware retention as a global setting, or applied per
  card by its module's exam.
- **Decision.**
  - `planStudy` (`@skb/core`) is a pure, deterministic function of its inputs (date, availability, forecast
    of reviews, assessments, concept priorities, lectures, forgetting-curve counts, what is already done).
    No model is involved, so the same inputs give the same plan and every item carries a reason generated
    from the figures that put it there. The server only gathers inputs and stores the result. Reviews are
    always planned, even beyond the time set aside; everything else respects it, and what does not fit is
    returned with a reason rather than dropped.
  - The plan is rolling: making it again keeps done and skipped items (their minutes count towards the day)
    and replaces the rest. Plans are canonical in the database (migration 0014: `study_plans`,
    `plan_items`; `assessments.remaining_hours`).
  - The tutor's rung is computed by `tutorGuidance` from the conversation and added to the model's
    instructions for that reply ("Tutor step: diagnose."). A full solution is possible only when the student
    asks for it in so many words, and always ends with a "Check question:". The answer to a check question
    is evaluated, and the ladder then restarts. A guard (`tutorReplyProblems`) notices a reply that does not
    fit its step and logs it; it does not rewrite what the model said.
  - `record_answer` is a *permanent* write: `defineTool` accepts `permanent: true` in place of `undo`, only
    for a write. Policy: a permanent call always asks (reason: recorded permanently, cannot be undone), may
    be approved for the rest of the chat (the student sees exactly what is recorded and supplies the
    answer), is hidden from MCP clients, and cannot be set to run automatically. The tool can only be called
    inside a chat thread, records the answer given by the student as `assisted`, and the question tool
    (`get_questions`) never returns an answer key. The tutor's answers live in a hidden practice quiz and
    attempt per thread (`tutor_sessions`).
  - Note corrections are a new proposal kind (`correction`): the exact words in the note, the replacement,
    an explanation and the lecture's own words as evidence (verified to be in the source). Accepting
    applies the change if the words are still there; nothing changes a note without the student. The
    proposals table is rebuilt in migration 0014 for the wider CHECK.
  - Exam-aware retention is applied per card when it is rated (and in the buttons' previews): the retention
    of a card's module is raised to 0.93 within 14 days of its next exam or test, never lowering a higher
    setting, switchable in Settings → Study plan.
- **Reason.** A plan the student cannot check is a plan they will not trust, and a model cannot promise
  repeatability. A tutor that is only asked to be Socratic will sometimes give the answer; deciding the
  rung in code puts the guardrail where it can be tested with transcripts. Evidence that cannot be undone
  should be rare and deliberate, so it asks, every time unless the student says otherwise for the chat.
- **Consequences.** There is now one kind of write that cannot be undone, listed as such in the catalogue
  and Settings. The planner's quality depends on the student's availability and on "hours left" being
  filled in. A real model may still break its step; the guard only logs it (B-AI-31). Tutored sessions have
  no page of their own yet (B-AI-32).
- **Date.** 10 October 2026.

## ADR-0038 — Credit flows only along accepted prerequisites; the pipeline is a job that fills the Inbox; mistakes go back to notes as suggestions

- **Context.** Phase 15 closes the loop from a lecture to better notes. Three questions: how a result on one
  concept may count for another without inflating what the student knows (ADR-0021: mastery is a
  transparent heuristic from the student's own evidence), how one request may spend several model calls on a
  lecture without writing anything the student did not choose (ADR-0034), and how practice may improve the
  notes (principle 1: notes are Markdown and the student's).
- **Options.** Implicit credit along every relation, or only accepted `prerequisite_for`; credit as a new
  table of derived evidence, or computed in the mastery pass; the pipeline as a synchronous request, a chain of
  generation jobs, or one job running the steps; mistakes written into notes directly, or proposed.
- **Decision.**
  - Credit is computed in the mastery pass from accepted `prerequisite_for` edges between concepts, nothing
    stored (`propagateCredit`, pure, in core). A correct answer (≥ 0.75) on B counts towards each prerequisite
    within two steps with the product of the edge weights (default 0.2, at most 0.3); credit to a concept
    whose own accuracy is below 0.6 is dropped; credit never makes mastery for a concept with nothing linked;
    a wrong answer (< 0.5, within 14 days) on a prerequisite marks its dependents *at risk* (priority × 1.25, a
    weak-area signal, scores untouched). Each concept lists where its credit came from and how much of the
    answer weight it is, so every figure can still be checked by hand.
  - The lecture pipeline is one background job (`ai.pipeline`) running the chosen steps in order through the
    same generation code a single request uses, with a stored result per step (`pipeline_runs`). A failed or
    empty step is reported and the rest go on; no model (or no budget) stops the run. Results are drafts and
    proposals, or accepted where the student has switched on auto-accept for that kind. Running by itself on
    attaching material is a setting, off by default, and the same material never runs twice. The quiz is made
    from the run's question drafts (rejected questions drop out of new attempts).
  - Concepts are a generation scope (the concept's note and the source passages naming it), so a concept with
    nothing to practise can get questions in one click.
  - After an attempt finishes (or an answer is graded afterwards), each wrong answer on a concept that has a
    backing note becomes an `addition` proposal: the question, its right answer and explanation, to add under
    "Common mistakes". It needs no model, is suggested once per question and note, and is skipped if the note
    already holds the question. Accepting adds it under the heading (made if missing).
  - Cross-module connections and the mastery overlay are computed per request from the graph payload and the
    mastery snapshot; the overlay colours by stage with a shape for each and ⚠ for what is worth studying now.
  - Resurfacing is a server query (lectures within two days, exams and deadlines within a chosen number of
    days; the module's weakest concepts and their notes), no model.
- **Reason.** Credit that is stored or spread over every relation would be hard to explain and easy to inflate;
  limiting it to accepted prerequisites the student stated keeps it theirs. A single job gives one progress
  view and one place to fail. Suggestions keep principle 1 intact while still closing the loop.
- **Consequences.** A relation the student never states gives no credit. The best order for a first run is
  pipeline → accept concepts → cards again (the cards of the first run do not know concepts that did not exist
  yet). Migration 0015 widens the proposals CHECK again. Pipeline runs and plans are records in the database,
  not in the vault.
- **Date.** 10 October 2026.

## ADR-0039 — One archive of open formats; restore into a new vault; a vault is chosen at start-up; code graphs are shown, not analysed

- **Context.** Phase 16 makes the first goal literal: nothing the student has made is hostage to the
  application (ADR-0004). Four questions: what an export is and how it is read back, how a restore may
  never harm the vault in use, how one vault is switched for another in a process that holds a lock, a
  database and a file watcher, and how the graph of a coursework repository joins the knowledge graph
  without taking it over.
- **Options.** Export as a folder tree, a zip, or a database copy; restore by merging or into a new vault;
  switching by tearing down and rebuilding every module in process, or by starting the process again;
  code entities as source sections (a new source kind), as stored relations (a new node type in the
  `relations` CHECKs), or as their own tables with computed edges.
- **Decision.**
  - **One zip** (`manuscript-export-<time>.zip`, written as a stream, kept in the data directory's
    `exports/`, never in the vault): `manifest.json` first, a README, `docs/schema.md`, `data/<table>.json`
    for every canonical table, `data/note-ids.json`, `data/files.json` (size and modification time of each
    file), `anki/*.txt`, `concepts/*.md`, `questions/` (bank as JSON, quizzes as Markdown), `graph/`
    (node-link JSON and GraphML) and `vault/**` — the files as they are. A note whose id is not in its
    front matter gains it **in the archive only**, so links by id survive; the vault is never written. The
    app's own folder, the database and AI keys are never included. Entries are deflated (level 0 for formats
    that are compressed already): a streamed "stored" entry cannot be read back in one pass.
  - **Restore only into a new, empty folder.** It reads the archive in one pass (the manifest decides;
    entries with unsafe names refuse the whole archive), checks every file against `data/files.json`,
    restores times, loads the tables with foreign keys checked at the end, and marks sources `pending` so the
    application reads the originals again. Anything derived is rebuilt on first open. A newer archive is
    refused, and a failed restore removes what it made. Export → restore → export gives the same data.
  - **A vault is chosen when the process starts.** The data directory keeps `vaults.json` (recent vaults and
    the one to open next, used when neither `--vault` nor `SKB_VAULT` names one, production only). Switching
    writes it and, when a launcher or the desktop shell is watching (`SKB_RESTARTABLE=1`), exits with code 75,
    on which `scripts/run-web.mjs` starts the server again. Otherwise the page says the vault opens at the
    next start. Opening an Obsidian vault is the same operation: it is described first (notes, files, what
    will and will not change) and opened in place; only an `id` line is ever added to a note.
  - **Code graphs are their own canonical tables** (`code_graphs`, `code_entities`, `code_edges`,
    `code_links`; migration 0016) and a `code` node type. Edges are computed on assembly — `uses` between
    code, `part_of` (structure) for containment, `implemented_in` from a concept to code — so the stored
    relations and their CHECKs are untouched. Code nodes are in the graph but not in the semantic view, so
    a repository cannot reshape communities, hubs or prompts; the default graph filter leaves them out
    (like topics). Name matches are proposals the student accepts or rejects (a rejection is kept); the
    file is untrusted and capped (50,000 nodes, 250,000 edges, 60 MB). Only Graphify's published output
    format is used, no code.
  - Concepts can be written out as notes (`Concepts/<name>.md`, relations as links) — in every export, and
    on request into the vault, never overwriting a note and making the new note the concept's backing note.
- **Reason.** A zip of plain files is the least demanding thing to keep, read or hand on; restoring only
  into a new folder cannot lose anything; restarting is more robust than hot-swapping a database, a lock and
  a watcher; computed edges avoid a second rebuild of the relations table for a feature most students use
  once.
- **Consequences.** A note whose front matter is not valid YAML cannot carry its id, so a relation to it is
  lost on restore (TD-11). An export contains everything, chats and usage included — it must be kept as
  safely as the vault. "Reveal in folder" is a desktop feature (Phase 18); the web page copies the path.
  Opening a vault adds a hidden `.skb/` folder to it. The agent has no code-graph tools yet (B-KM-23).
- **Date.** 10 October 2026.
