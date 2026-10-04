# 4 October 2026 — Claude Opus 5.5

## Session 1 — Research and planning

- **Date:** 4 October 2026
- **Time:** approx. 13:56–14:45 BST
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** 0 — Research and product discovery
- **Work performed:** inspected both repositories, researched the PKM, EdTech, learning-science and
  agent ecosystems, and wrote the research, PRD, ADRs, gated roadmap and documentation backbone.

### What was done

1. **Target repository** (`study-knowledge-base`): empty — `.git` only, branch `main` with no commits,
   remote `origin = https://github.com/WilliamKyaww/study-knowledge-base`. Git user "Will".
2. **Graphify** (`../graphify`, release 0.9.75, commit `48d7c0e`): read `ARCHITECTURE.md`, README,
   `docs/how-it-works.md`, `llm.py` extraction prompt and injection defences, `cluster.py`,
   `analyze.py`, `serve.py` query engine and MCP tools, `dedup.py`, `reflect.py`, `wiki.py`,
   `exporters/html.py`, licence files. Findings in `docs/research/graphify.md`.
3. **Toolchain check:** Node 24.14.0, npm 11.9.0, no pnpm/Bun, Python 3.14.3, Git 2.50.1, Visual Studio
   Community 2022 (17.13).
4. **Web research** (official sources preferred; secondary sources flagged):
   - PKM: Notion 3.x agents, Obsidian 1.14.4 and Bases/JSON Canvas, Anytype/any-sync, Capacities,
     Heptabase, Tana, Logseq DB (SQLite, one-way Markdown Mirror), Roam, Mem 2.0, Reflect, AFFiNE;
     discovered SiYuan (FSRS flashcards), Recall (spaced-repetition quizzes), Smart Connections.
   - EdTech: NotebookLM — **renamed Gemini Notebook on 16 July 2026**; NotebookLM 2.0 (8 June 2026);
     study features (flashcards/quizzes with source links, Learning Guide); TurboLearn/Turbo AI; Quizlet
     Learn mechanics and the 4 August 2026 launch (spaced repetition, lecture recording); Anki FSRS;
     RemNote; StudyFetch; Knowt; Gizmo; lab study modes; Math Academy FIRe.
   - Learning science: Dunlosky et al. 2013; Bastani et al. 2025 (PNAS; +48 %/+127 % in practice,
     −17 % on the closed-book exam for unguarded GPT-4); Kestin et al. 2025 (AI tutor > active learning);
     FSRS-6 formulas; FIRe.
   - Agents: AI SDK 6 → **AI SDK 7** (`ai@7.0.127`: ToolLoopAgent/WorkflowAgent, `toolApproval`, typed
     tool context, ESM-only), Mastra, LangGraph.js, OpenAI Agents SDK, Claude Agent SDK, OpenCode
     (Hono + AI SDK + SQLite; allow/ask/deny permissions), **DeepSeek Harness** (MIT developer preview,
     Cordis plugin architecture), **MCP 2026-07-28** (stateless core), contextual retrieval,
     GraphRAG/LightRAG.
   - Stack versions on npm today: TypeScript 7.0.2 (Go-native), Vite 8.3, React 19.3, Vitest 5.0,
     Electron 44.5 (Node 24.18.1), electron-builder 26.15, Hono 4.13, Zod 4.6, ts-fsrs 5.4.2 (FSRS-6),
     pdfjs-dist 6.4, sigma 3.0, graphology 0.26, Tailwind 4.3, Biome 2.5.
5. **Documents written:** `docs/research/*` (6 + index), `docs/prd/*` (8 + index), `DECISIONS.md`
   (ADR-0001…0023), `docs/checklist/*` (Phases 0–22 + README), `FEATURES.md`, `AGENTS.md`,
   `CLAUDE.md`, `README.md`, `STATE.md`, `THIRD_PARTY_NOTICES.md`, `docs/backlog/*`, `docs/README.md`,
   this journal.

### Important decisions

- One SPA + one local Hono server for both web and Electron (ADR-0002/0003).
- Hybrid storage: Markdown notes canonical on disk; SQLite canonical for learning data and as a
  rebuildable index (ADR-0004) — informed by Logseq's 2026 file→DB migration.
- `node:sqlite` instead of better-sqlite3 (ADR-0006): **verified locally** that Node 24.14's built-in
  SQLite 3.51.2 includes FTS5 and JSON1, contradicting a web claim; removes native modules from the
  Electron build. Spike in Phase 1 to confirm inside Electron 44.
- Plain SQL + prefixed ULIDs (ADR-0007); CodeMirror 6 (ADR-0009); FSRS-6 via ts-fsrs (ADR-0011);
  AI SDK 7 + in-house tool runtime (ADR-0012); risk-classified tools with undo (ADR-0013); MCP adapter
  (ADR-0014); graphology + Sigma with Graphify ideas ported under Apache-2.0 attribution (ADR-0015);
  electron-builder NSIS (ADR-0016); TypeScript 7 + Biome (ADR-0017); concepts as entities with
  provenance-tagged relations (ADR-0020); transparent mastery that AI cannot assert (ADR-0021).
- Roadmap revised from the brief: 23 phases; non-AI value first; generation before agent; Electron
  de-risked in Phase 1, installer before polish, rebuilt at release.
- Git: phase branches merged into `main` at gates; **no AI attribution trailers** (ADR-0023).

### Files changed

All files are new (repository was empty): see list in §5 above.

### Tests run

| Check | Result |
|---|---|
| `node -e` creating an FTS5 table in `node:sqlite` and querying `MATCH` | **Pass** — SQLite 3.51.2, FTS5 and JSON1 work (with `ExperimentalWarning`) |
| `vswhere` | Visual Studio Community 2022 17.13 present |
| No application code yet | — |

### Problems encountered

- Quizlet's AI-tools page, PNAS and SSRN returned HTTP 403 to automated fetches; Quizlet claims were
  corroborated via its Learn pages and a press release; Bastani figures via the Wharton summary and the
  authors' PDF listing.
- Several consumer study apps (StudyFetch, Knowt, Gizmo) have only review-site coverage; marked as
  secondary in `docs/research/edtech.md`.

### Unresolved issues

- Research questions RQ-01…RQ-12 (`docs/backlog/research-questions.md`), especially the real weekly
  workflow, module list/assessments, VLE/recording availability, AI provider budget.
- Product name is provisional (ADR-0022).

### Next steps

1. Consistency/British English pass (0.18), present the plan (0.19), commit and merge Phase 0.
2. Begin Phase 1 on `phase/01-foundation`.

## Session 2 — Phase 1: foundation

- **Date:** 4 October 2026
- **Time:** approx. 14:50–15:25 BST
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** 1 — Foundation (repository, tooling, server and web skeletons)
- **Work performed:** built and verified the monorepo, shared core, secure local server, storage layer,
  web skeleton, launcher and test harnesses; ran the Electron spike.

### What was done

- **Workspace:** npm workspaces (`packages/core`, `apps/server`, `apps/web`), TypeScript 7.0.2
  (type-check only), Biome 2.5.15 (config migrated to the new `preset` syntax), Vitest 5.0.3 projects,
  Playwright 1.63, esbuild 0.28; exact version pins.
- **`@skb/core`:** prefixed ULID IDs (`note_01…`), typed `AppError` hierarchy + RFC 9457 schema,
  shared endpoint contracts (`defineEndpoint`, `EndpointInput/Output`, `buildPath/buildQuery`),
  ping/health schemas.
- **Server:** config resolution; redacting logger; `node:sqlite` adapter with savepoint transactions and
  a precise experimental-warning filter; checksummed migrations; vault with lock + strict path
  containment; atomic writes; localhost security (token, Host, Origin, Fetch Metadata, `/auth`);
  problem details; contract-based routes; static SPA serving with CSP; `startServer()` + `main.ts` with
  IPC ready/shutdown messages.
- **Web:** Vite 8 + React 19 + Tailwind 4 + TanStack Router/Query; typed client with response validation;
  status page.
- **Scripts:** `scripts/build-server.mjs` (self-contained `apps/server/dist`), `scripts/smoke-server.mjs`
  (bundle check incl. graceful shutdown over IPC), `scripts/run-web.mjs` + `run-web.bat`.
- **E2E:** Playwright against the production bundle and a throwaway vault.
- **Electron spike** (scratchpad, not committed): Electron 44.5.1 (Node 24.21.0) — `node:sqlite`
  (SQLite 3.53.4) with FTS5/JSON1 in a `utilityProcess`; the unmodified server bundle ran in a
  `utilityProcess` and served ping/health/SPA.

### Important decisions

- **ADR-0024:** shared Zod endpoint contracts in `@skb/core` instead of Hono RPC (no server types in the
  web build; runtime validation on both sides).
- Dev web port **5317** (another local project already uses Vite's 5173).
- Session cookie name includes the port (`skb_session_4317`) so dev, test and production instances do
  not overwrite each other's cookies.
- `/api/ping` is the only unauthenticated API route and reveals nothing but the app identity.

### Files changed

New: root configs (`package.json`, `package-lock.json`, `tsconfig.base.json`, `biome.json`,
`vitest.config.ts`, `playwright.config.ts`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.nvmrc`),
`packages/core/**`, `apps/server/**`, `apps/web/**`, `scripts/**`, `e2e/**`, `run-web.bat`.
Updated: `README.md`, `AGENTS.md`, `STATE.md`, `FEATURES.md`, `DECISIONS.md` (ADR-0006 spike, ADR-0024),
`docs/prd/architecture.md`, `docs/prd/tech-stack.md`, `docs/checklist/*`, `docs/backlog/technical-debt.md`.

### Tests run

| Command | Result |
|---|---|
| `npm run verify` | **Pass** — typecheck (5 projects), Biome (80 files), 136 Vitest tests, build, smoke test |
| `npm run test:e2e` | **Pass** — 5/5 Playwright tests (Chromium 153) |
| Manual: dev server via proxy | 401 → sign-in → `skb_session_4317` (HttpOnly) → health 200 |
| Manual: crash recovery | Force-killed server; restart recovered the stale lock, same vault ID, DB intact |
| Manual: second instance | Refused with "This vault is already open in another … process (PID …)" |
| Manual: `run-web.bat` | Fresh build + start on a temporary vault; second launch detected the running app (exit 0) |
| Electron spike | Pass (see above) |

### Problems encountered

- Biome 2.5 deprecated `"recommended": true` → migrated with `biome migrate`.
- A temporal-dead-zone bug in the first warning-filter implementation → moved to its own module.
- `@types/node` overloads rejected spreading mixed positional/named SQL parameters → explicit dispatch.
- `cmd.exe` could not run `run-web.bat` by relative name in this sandbox (`NoDefaultCurrentDirectoryInExePath=1`)
  and `electron` ran as Node (`ELECTRON_RUN_AS_NODE=1` inherited from VS Code) — both are environment
  artefacts, documented in `AGENTS.md` §5.
- `run-web.bat` was written with LF endings and printed mojibake for `…` → CRLF, ASCII messages,
  `chcp 65001`.
- Node 24 `DEP0190` for `spawn` with `shell: true` and an argument array → single command string.

### Unresolved issues

- TD-01…TD-03 (`docs/backlog/technical-debt.md`).
- Research questions RQ-01…RQ-12 remain open for the user.

### Next steps

Phase 2 — application shell and layout system (`docs/checklist/phase-02-app-shell.md`).

## Session 3 — Phase 2: application shell and layout system

- **Date:** 4 October 2026
- **Time:** approx. 15:30–19:20 BST (resumed after a pause)
- **Agent model:** Claude Opus 5.5 (`claude-opus-5-5`)
- **Phase:** 2 — Application shell and layout system
- **Work performed:** design tokens and themes, the sticky-header page architecture, sidebar and routes,
  UI primitives, state components, toasts, shortcut registry, command palette, Today and Settings pages,
  session gate, component/integration tests and the all-routes E2E and accessibility suites.

### What was done

- **Tokens and themes:** `tokens.css` (AA-contrast colour pairs for light and dark, radii, shadows,
  motion, sidebar widths) mapped to Tailwind 4 utilities with `@theme inline`; theme store + an external
  `theme-init.js` in `<head>` (the CSP forbids inline scripts) so the saved theme applies before React.
- **Layout:** `AppShell` (sidebar + `main`, window never scrolls), `Page` (fixed header outside the only
  scroll container; title, description, actions, toolbar, breadcrumbs; document title), `StickySection`.
  Focus moves to the new page's `h1` after client-side navigation; a skip control comes first in tab order.
- **Navigation:** `sections.ts` is the single source of truth for the sidebar, command palette, router and
  E2E tests; unbuilt sections show placeholders that name their phase; not-found and route-error pages
  render inside the shell.
- **Components:** Button, IconButton (label required), Input/Textarea, Kbd, Badge, Card, Separator,
  Spinner, Dialog (title required), DropdownMenu, Tooltip, Tabs, Popover, EmptyState, ErrorState,
  Skeleton, LoadingState; `components/README.md` documents the rules.
- **Interaction:** shortcut registry (canonical keys, `mod` = Ctrl/⌘, input awareness, overrides, conflict
  detection) with a live cheat sheet; cmdk command palette in a titled Radix dialogue; sonner toasts for
  failed mutations via the query client's `MutationCache`.
- **Session gate:** replaces the Phase 1 status page's sign-in/unreachable handling for the whole app;
  the server status moved to Settings › About (TD-03 repaid).

### Important decisions

- The skip control is a `<button>` that focuses `main`, not a `#main` fragment link — avoids a router
  navigation and satisfies Biome's `useValidAnchor` rule.
- Palette items match on labels and ids only; matching on long descriptions made fuzzy search useless.
- Sidebar widened to 16rem so the product name fits.
- E2E accessibility scans grow the viewport to the page height first (see Problems).

### Files changed

New: `apps/web/src/app/**` (App, AppShell, Sidebar, SessionGate, CommandPalette, ShortcutsDialog,
GlobalShortcuts, Toaster, sections, section-icons, layout-store, theme, shortcuts), `apps/web/src/components/**`,
`apps/web/src/features/{today,settings,placeholder,errors}/**`, `apps/web/src/lib/{cn,platform,storage,queries,format,notify}.ts`,
`apps/web/src/styles/tokens.css`, `apps/web/public/theme-init.js`, `apps/web/src/test/renderApp.tsx`,
tests, `e2e/shell.spec.ts`. Changed: `index.html`, `main.tsx`, `router.tsx`, `styles/index.css`,
`lib/queryClient.ts`, `e2e/foundation.spec.ts`, `biome.json` (Tailwind directives), root and web
`package.json` (dependencies). Removed: `features/system/StatusPage.tsx` and its test.
Docs: `docs/prd/ui.md` §2/§7, checklists (Phase 2 complete, task 3.24 added), FEATURES, STATE,
README, AGENTS, technical-debt register.

### Tests run

| Command | Result |
|---|---|
| `npm run verify` | **Pass** — typecheck, Biome (127 files), 169 Vitest tests (web 48), build, smoke test |
| `npx playwright test` | **Pass** — 56/56: sticky headers on 14 routes + sticky sections, navigation/keyboard (6), axe on 14 routes × 2 themes + dialogues + collapsed sidebar |
| Mutation test: header moved into the scroll container | Sticky check **fails as intended** (header y 0 → −3870) |
| Mutation test: injected axe violations | `image-alt`, `button-name` caught; low-contrast text below the fold was **not** — harness fixed |
| Screenshots (Today, Settings, Notes, palette, cheat sheet; light/dark; collapsed sidebar) | Reviewed; label wrapping and brand truncation fixed |

### Problems encountered

- **axe skips colour contrast for elements outside the viewport.** Page bodies scroll internally, so
  below-the-fold text was never checked. Fixed by growing the viewport to the page height before each
  scan; verified with an injected low-contrast element. Recorded in `AGENTS.md` and `ui.md` §7.
- Biome's CSS parser rejected Tailwind directives (`@theme`, `@custom-variant`) → enabled
  `css.parser.tailwindDirectives`.
- The SPA bundle grew to 625 kB (196 kB gzip) → TD-04, scheduled as task 3.24 before the editor lands.

### Unresolved issues

- TD-01, TD-02, TD-04 (`docs/backlog/technical-debt.md`); research questions RQ-01…RQ-12.

### Next steps

Phase 3 — notes and Markdown knowledge base, starting with code splitting (3.24).
