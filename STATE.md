# State

_Last updated: 4 October 2026, 14:16 BST — Claude Opus 5.5._

## Current phase

**Phase 0 — Research and product discovery: in progress** (documentation complete; review and merge
pending). Branch: `phase/00-research`. Next: **Phase 1 — Foundation**.

## What works

- Documentation backbone: research, PRD, decisions (ADR-0001…0023), gated checklist (Phases 0–22),
  features inventory, backlog, journal, agent guide.
- No application code yet.

## In progress

- Phase 0 review (task 0.18) and presentation to the user (0.19).

## Incomplete / not started

- Everything in Phases 1–22.

## Broken

- Nothing known.

## Next steps

1. Merge Phase 0 into `main`.
2. Phase 1: workspace and tooling (1.01–1.05), shared core (1.06), server foundations (1.07–1.18),
   web skeleton (1.19–1.23), scripts and `run-web.bat` (1.24–1.27), E2E (1.28), Electron spike (1.29).

## Relevant decisions

- ADR-0003 local Node server · ADR-0004 hybrid storage (Markdown canonical) · ADR-0005 localhost
  security · ADR-0006 `node:sqlite` · ADR-0007 plain SQL + prefixed ULIDs · ADR-0017 tooling ·
  ADR-0023 git workflow (no AI trailers).

## Technical debt

None yet (`docs/backlog/technical-debt.md`).

## Open questions for the user

See `docs/backlog/research-questions.md` — most important: RQ-01 (workflow), RQ-02 (modules and
assessments), RQ-03 (VLE/recordings), RQ-04 (AI providers and budget).
