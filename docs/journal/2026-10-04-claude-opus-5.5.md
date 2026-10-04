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
