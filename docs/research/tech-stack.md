# Technology evaluation

> Evaluated 4 October 2026 by Claude Opus 5.5. Versions are the npm `latest` tags on that date.
> The *selected* stack, with rationale, is summarised in `docs/prd/tech-stack.md`; durable decisions are
> recorded in `DECISIONS.md`. This file keeps the comparison evidence.

## 0. Environment facts verified on the development machine

| Fact | Evidence |
|---|---|
| Node.js **24.14.0**, npm **11.9.0**; pnpm and Bun not installed | `node --version`, `npm --version` |
| `node:sqlite` on Node 24.14 bundles **SQLite 3.51.2 with FTS5 and JSON1** (prints an `ExperimentalWarning`) | Local test creating an FTS5 virtual table and running `MATCH` — **contradicts** older web claims that `node:sqlite` lacks FTS5 |
| Electron **44** bundles **Node 24.18.1**, Chromium 152 | [Electron v44.0.0 release notes](https://releases.electronjs.org/release/v44.0.0) |
| Visual Studio Community 2022 (17.13) present (native builds possible if ever required) | `vswhere` |
| Python 3.14.3 present (not needed by the app) | `python --version` |

## 1. Language and tooling

| Option | Version | Notes | Verdict |
|---|---|---|---|
| **TypeScript 7** (Go-native "Project Corsa") | 7.0.2 (shipped 8 July 2026) | 8–12× faster builds; `strict` on by default, `module` defaults to `esnext`, `baseUrl`/ES5/AMD removed; **programmatic JS API not available**, so tools that import `typescript` as a library (typescript-eslint, some plugins) do not work yet ([summary](https://www.developersdigest.tech/blog/typescript-7-native-compiler-migration-guide)) | **Selected** for type-checking (`tsc --noEmit`). Transpilation is done by Vite/esbuild, which do not depend on the TS API. Fallback: pin TS 6.0 if a needed tool breaks |
| TypeScript 6.0 | 6.0.x | Last JS-implemented compiler with the full API | Fallback only |
| **Biome** | 2.5.15 | Lint + format in one fast binary; React hooks rules; no dependency on the TS JS API | **Selected** |
| ESLint + typescript-eslint + Prettier | — | Blocked by the TS 7 API gap; three tools to configure | Rejected for now |
| npm workspaces | npm 11.9 | Installed; hoisted `node_modules` suits Electron packaging | **Selected** |
| pnpm workspaces | — | Not installed; Electron tooling often needs `node-linker=hoisted` | Rejected (no compelling gain) |
| esbuild (direct) | 0.28.2 | Bundles server and Electron main/preload into single ESM files | **Selected** |
| tsup / tsdown | 8.5.1 / 0.23.0 | tsup in maintenance mode; tsdown pre-1.0 | Rejected |
| tsx | 4.23.15 | Dev-time TS execution with watch mode | **Selected** (dev only) |

## 2. Frontend

| Concern | Options (version) | Verdict and reason |
|---|---|---|
| Framework | **React 19.3** · Vue · Svelte · Solid | React: largest ecosystem for editors, graph and accessibility primitives |
| Build / dev server | **Vite 8.3** (Rolldown) · Next.js · TanStack Start | Vite SPA: no SSR needed (local app with its own server); same bundle runs in browser and Electron |
| Routing | **TanStack Router 1.170** · React Router 7 | Type-safe search params and loaders; code-based routes (no codegen step) |
| Server state | **TanStack Query 5.104** | Caching, invalidation, optimistic updates |
| UI state | **Zustand 5** | Small, explicit stores for panels, selection, preferences |
| Styling | **Tailwind CSS 4.3** + CSS custom properties | Design tokens as variables; utility classes for speed; final polish phase restyles tokens, not components |
| Accessible primitives | **Radix UI** (`radix-ui` 1.6.7) · Base UI 1.8 | Radix: broadest, most battle-tested set (dialogues, menus, popovers, tooltips, tabs, selects). Base UI is a credible alternative if Radix maintenance stalls |
| Command palette | **cmdk 1.1** | De facto standard |
| Toasts | **sonner 2** | Accessible, simple |
| Icons | **lucide-react 1.52** | Consistent stroke icon set |
| Resizable panes | **react-resizable-panels 4** | Editor/preview/side-panel splits |
| Virtual lists | **@tanstack/react-virtual 3** | Large note/card lists |

## 3. Editor and Markdown

| Option | Version | Markdown fidelity | Verdict |
|---|---|---|---|
| **CodeMirror 6** (`@codemirror/*`, `@lezer/markdown` 1.7) | 6.43 | Edits the source text itself — byte-faithful round trips; Obsidian uses it | **Selected** (ADR-0009) |
| TipTap 3 + `@tiptap/markdown` | 3.31 | ProseMirror model ⇒ Markdown is re-serialised (normalises syntax; unknown syntax needs extensions) | Rejected for notes; may suit rich card editing later |
| Milkdown (Crepe) | 7.22 | Markdown-first ProseMirror; still re-serialises | Rejected |
| BlockNote | 0.55 | Block model; lossy Markdown | Rejected |

Rendering pipeline: **unified 11** — `remark-parse` 11, `remark-gfm` 4, `remark-frontmatter` 5,
`remark-math` 6 → `rehype-katex` 7 (**KaTeX 0.19**), `rehype-highlight` 7 (lowlight 3), **Mermaid 12**
loaded lazily, rendered with `react-markdown` 10. Custom remark plugins for wikilinks, embeds, tags,
callouts and highlights. Frontmatter edited with **`yaml` 2.9** (Document API preserves comments and
formatting) rather than `gray-matter` 4.0.3 (js-yaml re-serialisation, little maintenance).

## 4. Server

| Concern | Options | Verdict |
|---|---|---|
| HTTP framework | **Hono 4.13** + `@hono/node-server` 2.1 · Fastify 5 · Express 5 | Hono: Web-standard `Request`/`Response` (AI SDK streams return `Response`), typed RPC client (`hc`), tiny, used by OpenCode |
| Validation | **Zod 4.6** + `@hono/zod-validator` 0.9 | One schema language for HTTP, persistence boundaries and AI structured outputs |
| File watching | **chokidar 5** · `fs.watch` | chokidar: debouncing and atomic-write handling across editors (VS Code, Obsidian) |
| IDs | **ULID** (`ulid` 3) with type prefixes · UUIDv7 (`uuid` 14) | Prefixed ULIDs (`note_01J…`) are sortable, URL-safe and self-describing for agent tools |

## 5. Persistence and search

| Concern | Options | Verdict |
|---|---|---|
| SQLite driver | **`node:sqlite`** (built-in) · better-sqlite3 13 · libSQL · sql.js/wa-sqlite | **`node:sqlite`** behind a thin adapter: zero native modules ⇒ no Electron ABI rebuilds; FTS5 verified; Electron 44 ships the same Node major. Synchronous API is fine in a dedicated server process. Fallback: better-sqlite3 (same synchronous shape) — ADR-0006 |
| Query layer | **Plain SQL migrations + typed repositories** · Drizzle 0.45 · Kysely 0.29 | Plain SQL: FTS5 virtual tables, triggers and recursive CTEs stay first-class; no driver adapter needed for `node:sqlite`; schema readable by any SQLite tool (portability). Revisit Kysely if query composition grows painful — ADR-0007 |
| Full-text search | **SQLite FTS5** (`porter unicode61 remove_diacritics 2`, BM25, `snippet()`) · MiniSearch 7 · Orama 3 | FTS5: persistent, incremental, no duplicate in-memory index |
| Vector search | **Brute-force cosine over float32 BLOBs** → `sqlite-vec` 0.1.9 later · LanceDB | Brute force is fast enough for a personal corpus (≤ 100k chunks) with zero dependencies; `sqlite-vec` via `loadExtension` if needed |
| Embeddings | AI SDK `embed`/`embedMany` (OpenAI, Google, Ollama) · local `@huggingface/transformers` 4.3 | Pluggable provider; optional. Local model support evaluated in Phase 10 (onnxruntime size/packaging cost) |

## 6. Knowledge graph

| Option | Version | Notes | Verdict |
|---|---|---|---|
| **graphology** + communities-louvain 2.0, metrics 2.4, shortest-path 2.1, traversal 0.3, layout-forceatlas2 0.10 | 0.26 | One graph library usable **on the server (analytics)** and **in the client (rendering model)** | **Selected** |
| **Sigma.js** (+ `@react-sigma/core` 5) | 3.0.3 | WebGL rendering of graphology graphs; scales to tens of thousands of nodes | **Selected** for the global graph |
| Cytoscape.js | 3.34 | Excellent layouts (dagre/cola/fcose), canvas renderer | Candidate for small hierarchical prerequisite views |
| vis-network (Graphify's choice) | 10.1 | Canvas; Graphify caps rendering at 5,000 nodes | Rejected |
| react-force-graph | 1.29 | d3-force; nice 3D | Rejected (analytics would need a second graph model) |

## 7. Ingestion

| Input | Options | Verdict |
|---|---|---|
| PDF (text + viewer) | **pdfjs-dist 6.4** (Mozilla pdf.js) · unpdf 1.8 (serverless pdf.js build) | pdf.js for the viewer; text extraction via pdf.js or unpdf decided in the Phase 5 spike (per-page text, item positions, Node/Electron packaging) |
| PPTX | **Small in-house parser**: `fflate` 0.8 (zip) + `fast-xml-parser` 5.11 · officeparser 8.1 | In-house gives per-slide text, titles and speaker notes with slide locators; officeparser flattens structure |
| DOCX | **mammoth 1.13** → HTML → `turndown` 7.2 → Markdown | Semantic structure (headings, lists, tables) preserved |
| Markdown / text / code | Native | |
| Web pages | fetch + readability-style extraction with Graphify-style URL safety | Phase 5 (optional task) |
| Images (OCR) | tesseract.js 7 · vision model | Phase 11 |
| Audio / video | AI SDK `transcribe` (provider) · local whisper.cpp | Phase 11 |

## 8. AI layer

| Package | Version | Use |
|---|---|---|
| `ai` | 7.0.127 | Tool loop, structured output, streaming, embeddings, rerank, transcribe |
| `@ai-sdk/anthropic` · `@ai-sdk/openai` · `@ai-sdk/google` | 4.0.x | First-party providers |
| `@ai-sdk/openai-compatible` | 3.0.62 | Ollama, LM Studio, OpenRouter, DeepSeek and other OpenAI-compatible endpoints |
| `@ai-sdk/react` | 4.0.130 | `useChat` with tool parts and approvals |
| `@ai-sdk/mcp` · `@modelcontextprotocol/sdk` | 2.0.66 · 1.32.0 | MCP client (later) · MCP server adapter (Phase 12) |
| `ts-fsrs` | 5.4.2 (FSRS-6) | Scheduling |

## 9. Testing

| Tool | Version | Use |
|---|---|---|
| **Vitest** | 5.0.3 | Unit and integration tests (projects per package) |
| **@testing-library/react** + user-event | 16.3 / 14.6 | Component tests |
| **happy-dom** | 20.14 | Fast DOM for component tests (jsdom 30 as fallback) |
| **Playwright** | 1.63 | Web E2E; Electron smoke tests via `_electron` |
| `ai/test` mock models | (in `ai`) | Deterministic agent and generation tests |

## 10. Desktop packaging

| Option | Version | Notes | Verdict |
|---|---|---|---|
| **Electron** | 44.5.1 | Node 24.18.1 inside; `utilityProcess` for the server | **Selected** |
| **electron-builder** | 26.15.3 | Defaults to NSIS on Windows (wizard, install directory choice, uninstaller), mature auto-update metadata, widest format support ([comparison](https://www.deskifier.com/blog/electron-forge-vs-electron-builder)) | **Selected** (ADR-0016) |
| Electron Forge | 8.0.1 | Official, all-in-one; Windows default maker is Squirrel; NSIS via a community maker | Rejected — our renderer is already built by Vite and main/preload by esbuild, so Forge's bundling adds little |
| electron-vite | 5.0.0 | Vite for main/preload/renderer | Rejected for the same reason |
| Tauri | — | Rust shell + system WebView; would need a Rust or sidecar backend for our Node server | Rejected (contradicts the "same Node server in both modes" architecture) |

With `node:sqlite`, the packaged app has **no native Node modules**, so `@electron/rebuild` is not
needed — the largest single source of Electron packaging pain is removed.

## 11. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| `node:sqlite` API changes (experimental in Node 24) | Low–medium | Thin adapter; integration tests on both Node 24 (dev) and Electron's Node; better-sqlite3 fallback |
| A dependency requires the TS 7-incompatible API | Medium | Keep tooling minimal; pin TS 6 as fallback |
| AI SDK major-version churn (v5 → v6 → v7 within a year) | High | All AI SDK usage confined to `apps/server/src/modules/ai/` and `agent/`; tests with mock models catch breakage |
| pdf.js worker bundling in Node/Electron | Medium | Phase 5 spike before committing to an approach |
| Large local embedding models bloat the installer | Medium | Embeddings optional; API/Ollama providers first |
