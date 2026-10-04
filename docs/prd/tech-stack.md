# Selected technology stack

> PRD v0.1 — 4 October 2026. Evidence and alternatives: `docs/research/tech-stack.md`.
> Versions are those current on this date; the lockfile is the source of truth once installed.

| Layer | Choice | Why (one line) | ADR |
|---|---|---|---|
| Runtime | **Node.js 24** (dev 24.14; Electron 44 ships 24.18) | LTS; built-in `node:sqlite`; AI SDK 7 needs ≥ 22 | 0003 |
| Language | **TypeScript 7.0** (type-check only) | Fast native compiler; strict by default | 0017 |
| Monorepo | **npm workspaces** | Already installed; hoisted layout suits Electron | 0017 |
| Lint/format | **Biome 2.5** | One tool; no dependency on the TS 7 JS API | 0017 |
| Server | **Hono 4.13** + `@hono/node-server` | Web-standard Request/Response, typed RPC client, tiny | 0003 |
| Validation | **Zod 4** | One schema language for HTTP, persistence and AI outputs | 0007 |
| Database | **SQLite via `node:sqlite`** (FTS5) | Zero native modules; FTS5 verified; open file format | 0006 |
| Data access | **Plain SQL migrations + typed repositories** | Explicit, FTS/CTE-friendly, driver-agnostic | 0007 |
| Notes | **Markdown files** (Obsidian dialect) + `yaml` for frontmatter | Data ownership; Obsidian compatibility | 0004 |
| File watching | **chokidar 5** | Robust across editors' write patterns | 0004 |
| IDs | **Prefixed ULIDs** | Sortable, readable, type-checked | 0007 |
| Frontend | **React 19 + Vite 8** SPA | Same bundle for browser and Electron | 0002 |
| Routing / data | **TanStack Router + TanStack Query**; **Zustand** for UI state | Type-safe routes; cache/invalidation | 0018 |
| Styling | **Tailwind CSS 4** + CSS-variable tokens; **Radix UI** primitives; lucide icons; cmdk; sonner | Accessible primitives; tokens enable a late polish pass | 0018 |
| Editor | **CodeMirror 6** | Byte-faithful Markdown editing | 0009 |
| Rendering | **unified/remark/rehype**, KaTeX, Mermaid (lazy), lowlight | Maths, diagrams, code | 0009 |
| Search | **SQLite FTS5** (BM25) → hybrid with embeddings (Phase 10) | Persistent, incremental | 0010 |
| Graph | **graphology** (+ Louvain, metrics, shortest path) and **Sigma.js 3** | Same graph model on server and client; WebGL scale | 0015 |
| PDF | **pdf.js** (`pdfjs-dist` 6) | Viewer + text layer; extraction approach confirmed in a Phase 5 spike | 0019 |
| PPTX / DOCX | fflate + fast-xml-parser (in-house PPTX) · mammoth + turndown | Per-slide locators; structural DOCX | 0019 |
| Spaced repetition | **ts-fsrs** (FSRS-6) | State of the art, MIT | 0011 |
| AI | **AI SDK 7** (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/openai-compatible`, `@ai-sdk/react`) | Provider abstraction, tool loop, approvals, streaming UI | 0012 |
| MCP | **@modelcontextprotocol/sdk** (spec 2026-07-28) | External agents use our tools | 0014 |
| Testing | **Vitest 5**, Testing Library, happy-dom, **Playwright 1.63** | Unit → E2E incl. Electron | 0017 |
| Server bundling | **esbuild** | Single-file ESM bundle for web and desktop modes | 0017 |
| Desktop | **Electron 44** + **electron-builder 26** (NSIS) | Mature Windows installer; no native rebuilds needed | 0016 |

## Dependency policy

1. A new runtime dependency needs a reason in the PR/commit description; a *major* one (framework,
   database, AI, editor) needs an ADR.
2. Prefer permissive licences (MIT, Apache-2.0, BSD, ISC). No GPL/AGPL in shipped code. Record notable
   third-party code in `THIRD_PARTY_NOTICES.md`.
3. Pin exact versions in workspace `package.json` files; upgrade deliberately (one area at a time, with
   tests).
4. Keep AI SDK usage confined to `apps/server/src/modules/ai` and `modules/agent` (major-version churn
   is high).
