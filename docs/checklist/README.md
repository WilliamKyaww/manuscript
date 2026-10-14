# Implementation checklist

The roadmap is split into **gated phases**. Each phase file lists its objective, why it exists,
dependencies, atomic tasks, tests, acceptance criteria, documentation requirements and its gate.

## Status conventions (exactly these)

```text
[ ]   unstarted
[~]   partially completed — MUST be followed by an indented "Remaining:" line explaining what is left
[x]   fully completed — implemented, tested, verified, integrated and documented where appropriate
```

```markdown
- [ ] **3.08** Implement note rename
- [~] **4.02** Implement note search
  - Remaining: semantic search is not implemented; lexical search works.
- [x] **3.09** Implement note deletion (to trash)
```

Rules:
1. Code existing is **not** enough for `[x]`: the task's tests must pass and the behaviour must be
   verified (by test or by a recorded manual check) and integrated.
2. A phase is **complete** only when every required task is `[x]` and every gate item is `[x]`.
3. Optional tasks are marked *(optional)*; they may stay `[ ]` without blocking the gate, but must
   then be moved to the backlog with a reference.
4. Do not begin a phase until the previous phase's gate is passed (exceptions need a DECISIONS entry).
5. If scope changes, edit the checklist in the same commit as the change and say why in the journal.

## Gate procedure

1. All required tasks `[x]`.
2. `npm run verify` green (type-check, lint, unit/integration/component tests, build) — from Phase 1.
3. Phase-specific E2E tests green (`npm run test:e2e`) where the phase defines them.
4. `STATE.md`, `FEATURES.md`, journal entry and any affected PRD/ADR updated.
5. Phase branch merged into `main` with `--no-ff` (ADR-0023); recommended commit message recorded.

## Roadmap

| # | Phase | Depends on | Status |
|---|---|---|---|
| 0 | [Research & product discovery](./phase-00-research.md) | — | Complete |
| 1 | [Foundation: repository, tooling, server and web skeletons](./phase-01-foundation.md) | 0 | Complete |
| 2 | [Application shell and layout system](./phase-02-app-shell.md) | 1 | Complete |
| 3 | [Notes and Markdown knowledge base](./phase-03-notes.md) | 2 | Complete |
| 4 | [Lexical search and quick navigation](./phase-04-search.md) | 3 | Complete |
| 5 | [Source library and ingestion pipeline](./phase-05-sources.md) | 4 | Complete |
| 6 | [Course structure and concepts](./phase-06-course-structure.md) | 5 | Complete |
| 7 | [Knowledge graph](./phase-07-graph.md) | 6 | Complete |
| 8 | [Flashcards and spaced repetition](./phase-08-flashcards.md) | 6 | Complete |
| 9 | [Questions, quizzes and mastery](./phase-09-quizzes-mastery.md) | 8 | Complete |
| 10 | [AI foundation: providers, retrieval and grounded Q&A](./phase-10-ai-foundation.md) | 7, 9 | Complete |
| 11 | [AI generation and knowledge extraction](./phase-11-ai-generation.md) | 10 | Complete |
| 12 | [Agent runtime, tool layer and MCP](./phase-12-agent-tools.md) | 11 | Complete |
| 13 | [Agentic chat interface](./phase-13-chat.md) | 12 | Not started |
| 14 | [Tutor mode and study planning](./phase-14-tutor-planning.md) | 13 | Not started |
| 15 | [Knowledge–learning integration](./phase-15-integration.md) | 14 | Not started |
| 16 | [Data portability: import, export and backup](./phase-16-portability.md) | 15 | Not started |
| 17 | [Web application hardening](./phase-17-hardening.md) | 16 | Not started |
| 18 | [Electron desktop application](./phase-18-electron.md) | 17 | Not started |
| 19 | [Windows packaging and installer](./phase-19-installer.md) | 18 | Not started |
| 20 | [Final UI/UX polish](./phase-20-polish.md) | 19 | Not started |
| 21 | [Full verification: testing, reliability, accessibility](./phase-21-verification.md) | 20 | Not started |
| 22 | [Release and final documentation](./phase-22-release.md) | 21 | Not started |
| 27 | [Web pane placement and verification feedback](./phase-27-web-pane-right.md) | 26 (complete; its own checklist is authoritative) | In progress |

Why this order (revised from the brief's example after research):
- **Non-AI value first** (3–9): the knowledge base and learning loop must work without a provider
  (principle 6); it also stabilises the data model the AI layer depends on.
- **Generation before the agent** (11 → 12): agent tools wrap generation services, so the services and
  their review UIs exist first.
- **Electron is de-risked early** (spike in Phase 1) but built after hardening, so the desktop app wraps
  a stable web app; the **installer is produced before polish** to surface packaging issues early, and
  rebuilt at release after polish and full verification (the brief's final sequence: polish → full
  verification → web build → Electron build → installer).

Task IDs are `<phase>.<nn>` and are never reused; withdrawn tasks are struck through with a reason.
