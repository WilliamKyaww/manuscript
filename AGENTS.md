# AGENTS.md — working on Manuscript

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
| `npm run test:perf` | Generates 10,000 notes (and a library of 10,000 PDF pages) and checks the performance budgets (`architecture.md` §14); run before a gate that touches indexing or search |
| `npm run test:perf:mastery` | Generates a year of learning (1,000 concepts, 5,000 reviewed cards, 20,000 answers) and times the mastery pass (budget 500 ms); run before a gate that touches mastery |
| `npm run test:soak -- --minutes 480` | Runs the built server for hours through imports, search, notes and reviews, paced (`--pace` ms); fails on a failed request, a growing live heap or a broken budget (Phase 21). Needs `npm run build` |
| `npm run report:calibration -- <vault>` | How well predicted recall matches what happened, from a vault's review log, read-only; `--simulate` for simulated students |
| `npm run eval:ai` | Fifty grounding questions over eight documents: retrieval with the test model, or a real model with `SKB_EVAL_PROVIDER`, `SKB_EVAL_MODEL`, `SKB_EVAL_API_KEY` (and `SKB_EVAL_BASE_URL`). Needs `npm run build` |
| `SKB_FUZZ_RUNS=2000 npx vitest run fuzz` | The parser fuzz tests with more inputs than the default |
| `npm run docs:tools` | Regenerates the tool catalogue in `docs/guide/agent-tools.md` from the tool registry (a test fails when it is out of date); run after changing a tool |
| `npm run desktop:dev` | The desktop shell (Electron 44) against the built server; builds the application when it is missing and downloads Electron the first time |
| `npm run desktop:build` | An unpacked desktop build in `apps/desktop/release/<platform>-unpacked` (Electron's distribution + `resources/app` + `resources/server`) |
| `npx playwright test e2e/desktop.spec.ts` | Launches the shell and the unpacked build with Playwright's Electron driver; run `npm run build` (and `desktop:build`) first |
| `run-web.bat` | One-click Windows launcher for daily use (`SKB_NO_BROWSER=1` to suppress the browser) |

### Environment pitfalls (seen in the Claude Code / VS Code environment)

- **Anything that starts the application without `SKB_VAULT` opens the user's real vault** (the default is
  `Documents\Manuscript`, or the old `Documents\Study Knowledge Base`). A test that launches the whole
  application — the Electron spec, a script — must replace `USERPROFILE`, `HOME`, `APPDATA` and
  `LOCALAPPDATA` with folders of its own as well as setting `SKB_VAULT` and `SKB_DATA_DIR`
  (`isolatedEnvironment` in `e2e/desktop.spec.ts`), because `SKB_VAULT` is deliberately dropped once the
  student has chosen another vault in the application. (This happened once: a test opened the real vault and
  migrated its database; the pre-migration backup made by Phase 17 was what made it harmless. See the
  10 October journal.)
- `ELECTRON_RUN_AS_NODE=1` is inherited from VS Code's extension host and makes `electron` run as
  plain Node (`require('electron').app` is undefined). Unset it before launching Electron.
- `NoDefaultCurrentDirectoryInExePath=1` stops `cmd.exe` finding `run-web.bat` by a relative name; call
  batch files by their full path in automation (double-clicking in Explorer is unaffected).
- Another local project may already use Vite's default port 5173 — this project's dev server uses 5317.
  E2E ports: 4399 for the shared Playwright server, and 4398 down to 4386 for the tests that run a
  server of their own (`e2e/server.ts`, which can pass extra environment such as
  `SKB_AI_PROVIDER=mock`); 4385 for the soak, 4384 for AI on a selection (`e2e/links-selection.spec.ts`)
  and 4383 for the grounding evaluation. The next free one is 4382, then 4381.
- **The desktop shell treats web-pane pages differently** (Phase 26, ADR-0045): `web-contents-created` sends
  every contents of the `persist:web` session to `WebViews.harden` instead of the window's rules. A screenshot
  of the window (`capturePage`) does not include the native views; check them from the main process
  (`contentView.children`) as `e2e/desktop.spec.ts` does.
- **`fork()` passes on the parent's Node flags**: a script run with `tsx` that forks the built server
  runs it through tsx's loader (six times the memory, slower). Pass `execArgv` explicitly (`[]`, or
  `['--expose-gc', …]` as the soak does).
- **The application's day starts at 04:00** local time (as in Anki, `modules/cards/days.ts`): between midnight
  and 04:00 it is still the previous day. A test that seeds dates relative to today must use `studyDay()` from
  `e2e/days.ts`, not the calendar, or it fails when a run passes midnight (it happened in the Phase 20 gate).
- End-to-end tests run with **reduced motion** (`playwright.config.ts`), so dialogues appear at once and axe never
  measures colour contrast half-way through a fade; a test that checks motion turns it back on itself.
- **Screenshots of every screen**: `SKB_SCREENSHOTS=<folder> npx playwright test e2e/screens.spec.ts
  e2e/screens-assistant.spec.ts` (after `npm run build`; `SKB_SCREENSHOT_WIDTH` sets the width). Both are skipped
  otherwise; read the pictures before and after a visual change.
- Switching vault exits the server with code 75 and `scripts/run-web.mjs` starts it again when
  `SKB_RESTARTABLE=1` (the launcher sets it); under `npm run dev` or in tests there is no launcher, so the
  choice is only recorded in the data directory's `vaults.json`.
- Zip entries written by `modules/portability/zip.ts` are always deflated (level 0 for compressed formats):
  a streamed "stored" entry cannot be read back in one pass, because its size is only in a data descriptor.
- axe (`@axe-core/playwright`) only checks colour contrast for elements inside the viewport, and page
  bodies scroll internally: grow the viewport to the page height first (`seriousViolations` and
  `fitViewportToContent` in `e2e/axe.ts`), otherwise below-the-fold content is silently skipped.
- jsdom has no WebGL: the graph canvas (Sigma) is loaded lazily and only where WebGL exists, so
  component tests see its fallback text and test the lists beside it. Headless Chromium draws it
  with software WebGL — correct but slower than a real GPU, so judge frame rates by hand. Wait for
  `[data-graph-canvas][data-layout="done"]` before clicking nodes in E2E tests.
- AI in tests: `SKB_AI_PROVIDER=mock` replaces every model with deterministic built-in models (no
  network, no key). Unit tests stand in for a provider's HTTP API by passing `fetch` to the registry.
  Never put a real API key in tests, fixtures or logs. The mock answers structured requests by the
  `Task:` line of their instructions (`apps/server/src/modules/ai/mock-generation.ts`); test
  recordings and images carry their own text between `MOCK TRANSCRIPT`/`END TRANSCRIPT` or
  `MOCK TEXT`/`END TEXT` (see `apps/server/src/modules/sources/parsers/media.test.ts`).
- Never test against the user's real vault (`Documents\Manuscript`, or the pre-rename
  `Documents\Study Knowledge Base`) or data directory (`%APPDATA%\Manuscript` or
  `%APPDATA%\StudyKnowledgeBase`): set `SKB_VAULT` and `SKB_DATA_DIR` to temporary folders.
- The product is **Manuscript** (ADR-0027), but internal identifiers keep the `skb` prefix (`.skb/`,
  `skb-id`, `@skb/*`, `SKB_*`). Do not rename them without a vault migration and a new ADR. The local
  folder may still be called `study-knowledge-base` until the user renames it.
- Python's `write_text` on Windows writes CRLF line endings unless given `newline='\n'`; Biome then
  rejects the file. Git normalises committed text to LF, but the working copy must be LF too.
- Shell here-documents in the agent's Bash tool can collapse a double backslash to a single one,
  turning `'\n'` in generated code into a real line break. Edit code that contains backslash escapes
  with the editor tools instead.
- Notes test vaults: write CRLF, byte-order marks or non-UTF-8 bytes from code (see
  `apps/server/test/fixtures/obsidian-vault.ts`), not as committed files, which git would normalise.
  Source fixtures (PDF, PPTX, DOCX, zip bombs) are built in code too
  (`apps/server/test/fixtures/sources/builders.ts`).
- Windows PowerShell 5.1: `Set-Content -Encoding utf8` writes a byte-order mark — a commit message
  written that way starts with an invisible character. Write message files with
  `[IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding $false))` or the editor
  tools. PowerShell also treats curly quotes (“ ”) as string delimiters, so a script containing them
  fails to parse: edit such text with the editor tools or a small Node script.
- Timings on this machine vary two- to three-fold with background load (chat, music, browsers). When a
  performance budget looks broken, measure the previous gate's code at the same time (a temporary
  `git worktree` of the last merge, sharing `node_modules` through a junction) before optimising.
  On battery the laptop throttles about three-fold (`Get-CimInstance Win32_Battery`: `BatteryStatus`
  1 means discharging), so judge budgets on mains power. Remove the junctions with `cmd /c rmdir`
  before `git worktree remove`, so that nothing deletes the shared `node_modules` through them.

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
