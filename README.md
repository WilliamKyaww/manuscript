# Manuscript

A personal **Knowledge & Learning OS**: a Markdown knowledge base, a lecture/source library, a concept
graph and a spaced-repetition learning system that share one data model — with an AI agent that can
search, explain, generate study material and act on the knowledge base through permissioned tools.

> **Status: Phases 0–6 complete** (research and planning; secure local server, database, vault and
> launcher; application shell; **notes**: Markdown files in your vault with an editor, preview,
> wikilinks, backlinks, templates, attachments, trash and live pick-up of edits made in Obsidian or
> VS Code; **search**: full-text search with filters, a quick switcher and notes in the command
> palette; **library**: PDF, PowerPoint, Word, Markdown and text sources kept byte for byte, read in
> the background, searchable down to the page or slide, with a viewer; **course**: modules, lectures
> with their material, topics, assessments with a mark calculator against your targets, and concepts
> that wikilinks resolve to). The knowledge graph arrives in Phase 7. See [`STATE.md`](./STATE.md), the
> [user guides](./docs/guide/README.md) and
> [`docs/checklist/`](./docs/checklist/README.md) for the roadmap.

## Why it exists

Built by and for one final-year Computer Science & AI student aiming for an 85 %+ average. Note-taking
tools store knowledge but do not teach it back; AI study tools generate material in silos and rarely
schedule it. This project joins the two around the learning loop:

```text
lecture → concepts → knowledge graph → study material → practice → mastery → weak concepts → targeted study
```

## Core capabilities (planned — see [FEATURES.md](./FEATURES.md) for live status)

- **Knowledge:** Obsidian-compatible Markdown notes (wikilinks, backlinks, maths, code, Mermaid), fast
  full-text and semantic search, a source library (PDF, PPTX, DOCX…) with page/slide-precise locators,
  concepts and a typed, provenance-tagged knowledge graph.
- **Learning:** modules, lectures, topics, assessments and a mark calculator; FSRS-6 flashcards;
  question bank, quizzes and mock exams; transparent concept-level mastery; weak-area detection; a
  deadline- and weight-aware study planner.
- **AI (optional):** grounded answers that cite your own sources; generation of notes, cards and
  questions with provenance; concept extraction as reviewable proposals; a guardrailed Socratic tutor;
  an agentic chat that acts through typed tools with approvals and undo; an MCP server for external
  agents. Provider-independent (Anthropic, OpenAI, OpenAI-compatible/local).
- **Data ownership:** notes are plain Markdown files; originals are preserved; structured data lives in
  an open SQLite file with full export.

## Architecture overview

```text
React SPA (apps/web) ──HTTP/SSE──► Local Node server (apps/server: Hono, node:sqlite, AI SDK 7)
                                        ├─► Vault folder: Markdown notes + original sources
                                        └─► <vault>/.skb/skb.db (structured data + rebuildable index)
Electron (apps/desktop) runs the same server and SPA as a desktop app.
```

Details: [`docs/prd/architecture.md`](./docs/prd/architecture.md).

## Setup

Requirements: **Windows 10/11** (macOS/Linux work for development), **Node.js 24+** with npm 11+, Git.

```powershell
git clone https://github.com/WilliamKyaww/manuscript.git
cd manuscript
npm install
```

## Running

| Mode | How | Notes |
|---|---|---|
| **Daily use (web)** | double-click **`run-web.bat`** | Installs dependencies and builds when needed, starts the server and opens your browser signed in. Running it again while the app is open just reopens the browser. |
| **Development** | `npm run dev` | API server on `http://127.0.0.1:4317` (auto-restarts) and Vite on `http://127.0.0.1:5317` (hot reload). Open the sign-in link printed by the server. Uses a disposable vault in `.dev-vault/` and app data in `.dev-data/`. |
| **Production server** | `npm run build` then `npm start` | Serves the built app and API on port 4317. |
| Desktop (development) | `npm run desktop:dev` | Phase 18 |
| Windows installer | `npm run desktop:dist` | Phase 19 |

**Where data lives (web and desktop):** the vault (your notes and sources) defaults to
`Documents\Manuscript`; settings and the local sign-in token live in
`%APPDATA%\Manuscript` (never inside the vault). The project used to be called "Study Knowledge
Base": if only the old folders (`Documents\Study Knowledge Base`, `%APPDATA%\StudyKnowledgeBase`)
exist, they keep being used. To switch to the new names, close the app and rename the folders.

**Configuration** (flags override environment variables): `--port` / `SKB_PORT`, `--vault` /
`SKB_VAULT`, `--data-dir` / `SKB_DATA_DIR`, `--log-level` / `SKB_LOG_LEVEL` (`debug`, `info`, `warn`,
`error`), `--open` (open the browser). `SKB_NO_BROWSER=1` stops `run-web.bat` opening a browser.

**Security:** the server listens on `127.0.0.1` only and every API call needs the local token (sent as an
HttpOnly cookie after you open the sign-in link). Requests with a foreign `Host` or `Origin` are refused.

## Testing

| Command | What it checks |
|---|---|
| `npm test` | Unit, integration and component tests (Vitest) |
| `npm run typecheck` | TypeScript 7 across all packages and the E2E suite |
| `npm run lint` / `npm run format` | Biome lint and format (check / write) |
| `npm run test:smoke` | Starts the built server bundle and checks ping, auth, health and the SPA |
| `npm run test:e2e` | Builds, then Playwright end-to-end tests in Chromium (first run: `npx playwright install chromium`) |
| `npm run test:perf` | Generates 10,000 notes and checks the indexing and note-opening budgets |
| **`npm run verify`** | typecheck → lint → tests → build → smoke test (run before every commit) |

## Troubleshooting

- **"Port 4317 is already in use"** — the app is probably already running; use `run-web.bat` to reopen
  it, or set `SKB_PORT`.
- **"Sign-in required"** in the browser — open the link printed in the server window, or start the app
  with `run-web.bat`, which signs you in automatically.
- **"This vault is already open in another process"** — close the other instance; after a crash the lock
  is recovered automatically on the next start.
- **"This note was changed outside the editor"** — another program saved the note while you had unsaved
  changes. Nothing has been overwritten: use **Compare**, then keep your version or reload theirs.
- **A note opens read-only** — the file is not UTF-8 text or is larger than about 5 MB; edit it in another
  program or convert it to UTF-8.

## Documentation

| Where | What |
|---|---|
| [`STATE.md`](./STATE.md) | Current state of the project |
| [`FEATURES.md`](./FEATURES.md) | Feature inventory and statuses |
| [`DECISIONS.md`](./DECISIONS.md) | Architecture decision records |
| [`docs/guide/`](./docs/guide/README.md) | User guides: notes and the Markdown dialect |
| [`AGENTS.md`](./AGENTS.md) | How to work on this repository (agents and humans) |
| [`docs/`](./docs/README.md) | Research, PRD, checklists, journal, backlog |

## Licence and notices

Personal project; licence to be decided by the owner. Third-party notices (including ideas adapted from
[Graphify](https://github.com/Graphify-Labs/graphify), Apache-2.0) are in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
