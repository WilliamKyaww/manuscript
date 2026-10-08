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
| [0015](#adr-0015--graphology--sigmajs-graphify-ideas-ported-with-attribution) | graphology + Sigma.js; Graphify ideas ported with attribution | Accepted | 2026-10-04 |
| [0016](#adr-0016--electron-44-electron-builder-nsis-server-in-a-utilityprocess) | Electron 44, electron-builder (NSIS), server in a utilityProcess | Accepted | 2026-10-04 |
| [0017](#adr-0017--tooling-typescript-7-biome-npm-workspaces-vitest-playwright-esbuild) | Tooling: TypeScript 7, Biome, npm workspaces, Vitest, Playwright, esbuild | Accepted | 2026-10-04 |
| [0018](#adr-0018--frontend-react-19-vite-8-tanstack-tailwind-4-radix) | Frontend: React 19, Vite 8, TanStack, Tailwind 4, Radix | Accepted | 2026-10-04 |
| [0019](#adr-0019--ingestion-parsers-with-a-phase-5-spike) | Ingestion parsers, with a Phase 5 spike | Accepted | 2026-10-04 |
| [0020](#adr-0020--concepts-are-entities-relations-carry-provenance) | Concepts are entities; relations carry provenance | Accepted | 2026-10-04 |
| [0021](#adr-0021--transparent-heuristic-mastery-never-asserted-by-ai) | Transparent heuristic mastery, never asserted by AI | Accepted | 2026-10-04 |
| [0022](#adr-0022--provisional-name-study-knowledge-base-scope-skb) | Provisional name "Study Knowledge Base", scope `@skb` | Accepted | 2026-10-04 |
| [0023](#adr-0023--git-workflow-phase-branches-merged-at-gates-no-ai-trailers) | Git workflow: phase branches merged at gates; no AI trailers | Accepted | 2026-10-04 |
| [0024](#adr-0024--shared-zod-api-contracts-instead-of-hono-rpc) | Shared Zod API contracts instead of Hono RPC | Accepted | 2026-10-04 |
| [0025](#adr-0025--note-ids-are-written-into-files-only-when-needed) | Note ids are written into files only when needed | Accepted | 2026-10-07 |
| [0026](#adr-0026--obsidian-compatible-dialect-with-recorded-differences) | Obsidian-compatible dialect with recorded differences | Accepted | 2026-10-07 |

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
