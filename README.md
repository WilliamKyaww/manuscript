# Study Knowledge Base

A personal **Knowledge & Learning OS**: a Markdown knowledge base, a lecture/source library, a concept
graph and a spaced-repetition learning system that share one data model — with an AI agent that can
search, explain, generate study material and act on the knowledge base through permissioned tools.

> **Status: Phase 0 (research and planning).** No application code exists yet; Phase 1 builds the
> foundation. See [`STATE.md`](./STATE.md) for the current state and
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

## Setup (from Phase 1)

Requirements: **Windows 10/11, Node.js 24+** (npm 11+). Git for development.

```powershell
git clone https://github.com/WilliamKyaww/study-knowledge-base.git
cd study-knowledge-base
npm install
```

## Running

| Mode | Command | Available from |
|---|---|---|
| Daily use (web) | double-click **`run-web.bat`** | Phase 1 |
| Development | `npm run dev` | Phase 1 |
| Production server | `npm run build` then `npm start` | Phase 1 |
| Desktop (development) | `npm run desktop:dev` | Phase 18 |
| Windows installer | `npm run desktop:dist` | Phase 19 |

## Testing

`npm run verify` (type-check, lint, tests, build) and `npm run test:e2e` (Playwright) — from Phase 1.

## Documentation

| Where | What |
|---|---|
| [`STATE.md`](./STATE.md) | Current state of the project |
| [`FEATURES.md`](./FEATURES.md) | Feature inventory and statuses |
| [`DECISIONS.md`](./DECISIONS.md) | Architecture decision records |
| [`AGENTS.md`](./AGENTS.md) | How to work on this repository (agents and humans) |
| [`docs/`](./docs/README.md) | Research, PRD, checklists, journal, backlog |

## Licence and notices

Personal project; licence to be decided by the owner. Third-party notices (including ideas adapted from
[Graphify](https://github.com/Graphify-Labs/graphify), Apache-2.0) are in
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
