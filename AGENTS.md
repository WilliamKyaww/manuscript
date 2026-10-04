# AGENTS.md — working on Study Knowledge Base

Instructions for coding agents (and humans) working in this repository. Read this file fully before
changing anything.

## 1. What this project is

A personal **Knowledge & Learning OS** for a final-year Computer Science & AI student aiming for an
85 %+ average: a Markdown knowledge base, a source library, a concept graph and an FSRS-based learning
system sharing one data model, with a provider-independent AI agent acting through permissioned tools.
It is a local web app (Node server + React SPA) that is also packaged as an Electron desktop app.

## 2. Read first, in this order

1. `STATE.md` — current phase, what works, what is next.
2. The current phase file in `docs/checklist/` — the tasks you may work on.
3. The relevant PRD section in `docs/prd/` and any ADR in `DECISIONS.md` that it references.
4. The latest entry in `docs/journal/`.

Do not start work outside the current phase unless the user asks; if you must, record why in the
journal and in `DECISIONS.md` if it changes a decision.

## 3. Architecture in one minute

```text
apps/web (React SPA) ──HTTP/SSE──► apps/server (Node 24 + Hono) ──► vault folder (Markdown, originals)
                                         │                       └─► SQLite <vault>/.skb/skb.db (node:sqlite)
apps/desktop (Electron, Phase 18) ── runs the same server in a utilityProcess and loads the same SPA
packages/core ── shared Zod schemas, types and pure logic used by server and web
```

Full detail: `docs/prd/architecture.md`. Data model: `docs/prd/data-model.md`.

## 4. Repository layout

| Path | Purpose |
|---|---|
| `apps/server/` | `@skb/server` — API, domain modules (`src/modules/*`), agent, jobs, migrations |
| `apps/web/` | `@skb/web` — SPA (`src/app`, `src/components`, `src/features/*`) |
| `apps/desktop/` | `@skb/desktop` — Electron shell (from Phase 18) |
| `packages/core/` | `@skb/core` — shared schemas, ids, Markdown parsing, FSRS/mastery maths |
| `e2e/` | Playwright end-to-end tests |
| `scripts/` | Build and maintenance scripts |
| `docs/research/` | Phase 0 research (evidence for decisions) |
| `docs/prd/` | Product requirements and architecture |
| `docs/checklist/` | Gated phase checklists — **the source of truth for task status** |
| `docs/journal/` | Engineering journal, one file per session/day |
| `docs/backlog/` | Backlog, technical debt, research questions |
| `docs/guide/` | User-facing guides (created as features land) |

## 5. Commands

All verified on 4 October 2026 (Phase 1):

| Command | What it does |
|---|---|
| `npm install` | Install all workspace dependencies |
| `npm run dev` | API server (`tsx watch`, port 4317) + Vite (port 5317) against `.dev-vault/` and `.dev-data/`; open the printed sign-in link |
| `npm run build` | Build the SPA, then bundle the server into `apps/server/dist` (with `migrations/` and `web/`) |
| `npm start` | Run the built server (serves the SPA and API on 4317) |
| `npm run typecheck` | TypeScript 7 type-check of all packages and the E2E suite |
| `npm run lint` / `npm run format` | Biome check / apply fixes and formatting |
| `npm test` | Vitest unit, integration and component tests (`npx vitest run --project server` for one package) |
| `npm run test:smoke` | Start the built bundle on a free port and check ping, auth, health and the SPA |
| `npm run test:e2e` | Build, then Playwright end-to-end tests (Chromium; `npx playwright install chromium` once) |
| `npm run verify` | typecheck → lint → test → build → smoke — **run before every commit** |
| `run-web.bat` | One-click Windows launcher for daily use (`SKB_NO_BROWSER=1` to suppress the browser) |

### Environment pitfalls (seen in the Claude Code / VS Code environment)

- `ELECTRON_RUN_AS_NODE=1` is inherited from VS Code's extension host and makes `electron` run as
  plain Node (`require('electron').app` is undefined). Unset it before launching Electron.
- `NoDefaultCurrentDirectoryInExePath=1` stops `cmd.exe` finding `run-web.bat` by a relative name; call
  batch files by their full path in automation (double-clicking in Explorer is unaffected).
- Another local project may already use Vite's default port 5173 — this project's dev server uses 5317.
- axe (`@axe-core/playwright`) only checks colour contrast for elements inside the viewport, and page
  bodies scroll internally: grow the viewport to the page height first (see `fitViewportToContent` in
  `e2e/shell.spec.ts`), otherwise below-the-fold content is silently skipped.
- Never test against the user's real vault (`Documents\Study Knowledge Base`) or data directory
  (`%APPDATA%\StudyKnowledgeBase`): set `SKB_VAULT` and `SKB_DATA_DIR` to temporary folders.

## 6. The phase and gate workflow

- Work only on tasks in the current phase file. Tasks are atomic and have IDs (`3.08`).
- Statuses, exactly: `[ ]` unstarted · `[~]` partial (**must** have an indented `Remaining:` line) ·
  `[x]` complete.
- **Definition of done for `[x]`:** implemented, tests written and passing, behaviour verified (by
  test or recorded manual check), integrated with the rest of the app, documentation updated where
  appropriate. Code merely existing is not done.
- A phase is complete only when all required tasks and gate items are `[x]`. Do not begin the next
  phase before the gate passes.
- If you discover new work: add a task to the current phase (if required for the gate) or to
  `docs/backlog/` (if not), in the same commit, and mention it in the journal.

## 7. Documentation rules

- **British English everywhere** — docs, comments, commit messages, UI copy: organise, optimise,
  summarise, prioritise, normalise, initialise, behaviour, colour, favour, neighbour, centre, licence
  (noun), practise (verb) / practice (noun), modelling, labelled, cancelled, catalogue, dialogue (prose),
  artefact, judgement, grey, maths. Code identifiers that come from libraries keep their spelling
  (`color` CSS properties, `Dialog` components); our own identifiers use British spelling where
  practical (`normalise`, `colour` in prose and labels).
- **`STATE.md`** — update at the end of every working session: what works, in progress, incomplete,
  broken, next, current phase, relevant decisions, technical debt. Keep it short.
- **`FEATURES.md`** — update a feature's status when it changes; never mark Complete unless it works end
  to end and is tested.
- **`DECISIONS.md`** — add an ADR for any decision that is architecturally or product significant
  (Context · Options · Decision · Reason · Consequences · Date). Supersede rather than rewrite.
- **Journal** — one file per day per agent model: `docs/journal/YYYY-MM-DD-<model>.md`, titled
  `# D Month YYYY — <Model name>` (e.g. `# 4 October 2026 — Claude Opus 5.5`). Start with date, time,
  model, phase and work summary; then what was done, decisions, files changed, tests run (with results),
  problems, unresolved issues, next steps. Append to the day's file if it exists.
- **Backlog** — follow `docs/backlog/README.md`.
- Third-party code adapted into the project (e.g. from Graphify, Apache-2.0) must carry a header
  comment naming the source and licence and be listed in `THIRD_PARTY_NOTICES.md`.

## 8. Architectural principles (non-negotiable without a new ADR)

1. **Notes are Markdown files and are canonical.** Never store note bodies only in the database. Only
   the `id` frontmatter key may be added automatically. Keep the Obsidian-compatible dialect.
2. **The UI only talks HTTP/SSE to the server.** No Node APIs in `apps/web`; desktop-only features go
   through the preload bridge with a web fallback.
3. **Layering in the server:** routes (HTTP + validation) → services (business logic) → repositories
   (SQL). Routes never contain SQL; repositories never contain business rules; agent tools call services.
4. **SQL is plain and versioned:** forward-only numbered migrations; never edit an applied migration;
   derived tables must be rebuildable from files.
5. **AI SDK usage is confined** to `apps/server/src/modules/ai/` and `modules/agent/`.
6. **The model acts only through registered tools** with a declared risk level; destructive tools always
   require approval; every write is logged and undoable. There is no tool that sets mastery.
7. **Security:** the server binds to loopback and requires the token, Host and Origin checks; all paths
   go through `resolveInVault()`; secrets never enter the vault, logs or client responses.
8. **Sticky headers:** every route renders `<Page>`; page headers sit outside the scroll container;
   exceptions are listed in `docs/prd/ui.md` §2.
9. **The app must work without AI**; AI features degrade with a clear explanation.
10. **Time and randomness are injected** (clock, id factory) so tests are deterministic.

## 9. Coding conventions

- TypeScript strict, ESM only, `verbatimModuleSyntax`; no `any` without a comment explaining why.
- Validate every external boundary with Zod (HTTP input, frontmatter, JSON columns, AI output, files).
- Errors: throw typed domain errors from `@skb/core` / `shared/errors`; the error middleware maps them
  to problem-details JSON. Never swallow errors silently.
- Logging through the shared logger (structured, redacting); no stray `console.log` in committed code.
- Files stay focused: aim for < 300 lines; split by responsibility, not by arbitrary size.
- Tests sit beside the code as `*.test.ts(x)`; fixtures in `test/fixtures/`. Every bug fix starts with a
  failing test.
- Comments explain *why*, not *what*. Keep them in British English.
- Accessibility: use the Radix-based components in `apps/web/src/components`; label icon buttons.

## 10. Making changes safely

1. Read the relevant code and tests first; keep changes small and focused on one task.
2. Run `npm run verify` before every commit; run `npm run test:e2e` before a gate.
3. Never delete or rewrite user data in migrations without a backup step; never change the vault file
   format without an ADR and a migration path.
4. Do not add dependencies casually: runtime dependencies need a reason in the commit message; major ones
   need an ADR (`docs/prd/tech-stack.md` → dependency policy). Prefer MIT/Apache-2.0/BSD/ISC licences.
5. Use the disposable dev vault (`.dev-vault/`) — never point development at the user's real vault.

## 11. Handling incomplete work

- Mark partial tasks `[~]` with `Remaining:`; describe gaps in `STATE.md` (Incomplete / Broken).
- Record deliberate shortcuts in `docs/backlog/technical-debt.md` at the time they are taken.
- Placeholder UI must say what is missing and which phase delivers it. Never present mocked data as
  real. Never report "done" for partial work.

## 12. Git conventions (ADR-0023)

- Branch per phase: `phase/NN-short-name`. Small, logically grouped commits.
- Conventional Commits in British English: `feat(scope): …`, `fix: …`, `docs: …`, `test: …`,
  `chore: …`, `refactor: …`, `perf: …`, `style: …`, `build: …`.
- **Never add `Co-authored-by:` trailers for AI tools or any other AI attribution** (including
  "Generated with …" lines) to commits, merge commits, tags or PR descriptions.
- When a phase passes its gate: merge into `main` with `git merge --no-ff phase/NN-…` using the
  recommended message from the phase file, then start the next branch from `main`.
- Do not push, force-push or rewrite published history; the user pushes to `origin`.
