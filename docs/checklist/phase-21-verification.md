# Phase 21 — Full verification: testing, reliability and accessibility

**Status:** Closed at the user's request on 11 October — four checks stay open, each recorded below and in STATE ·
**Branch:** `phase/21-verification`

## Objective
Verify the whole system after polish: end-to-end coverage of every use case, accessibility, reliability,
performance, mastery calibration, AI grounding quality, web/desktop parity and security.

## Dependencies
Phase 20.

## Atomic tasks
- [x] **21.01** E2E coverage of use cases UC-01 … UC-16 (`product.md` §8) — Every use case maps to at least one spec
  (the map is in the verification report, 11 October journal); `e2e/use-cases.spec.ts` adds what none walked
  through: maths, code and a diagram in the preview (UC-01), a topic and a deadline on Today (UC-04), a mock exam
  that moves mastery (UC-07), a backup on request (UC-14).
- [~] **21.02** Accessibility audit: axe on all screens, keyboard-only walkthrough, screen-reader spot checks — axe:
  every route in both themes, every page with content, open dialogues, and every page in the desktop window, with
  no serious or critical violations. Keyboard: `e2e/keyboard.spec.ts` (a whole study session, nothing clicked); it
  found that a new note opened with focus on the title, now fixed. What a screen reader walks: one `h1`, the
  landmarks and no skipped heading level on every page (`headingOutline`).
  Remaining: the spot checks with a real screen reader (Narrator, `Ctrl+Win+Enter`), by the user — the checklist
  is in the report.
- [x] **21.03** Reliability: parser fuzz tests; 8-hour soak test of ingestion and review loops — Fuzzing found and
  fixed two pieces of quadratic and worse backtracking (unclosed cloze text took ten seconds; runs of brackets);
  every document parser reads or refuses damaged files in words. The soak (`npm run test:soak`) ran 12, 20 and 45
  minutes (2,400 rounds in all) with no failed request and a live heap growing only with the content. The user
  accepted this in place of the eight hours (11 October: personal use; a fault can be reported and fixed); the
  eight-hour command stays for later.
- [~] **21.04** Mastery calibration check (predicted vs actual recall) with a report — `calibrate()` in core and
  `npm run report:calibration`, validated on simulated students (0.5 % error when calibrated; the gap found when
  memories last half or a quarter as long).
  Remaining: the report on the user's own reviews, once there are a few hundred (`npm run report:calibration --
  <vault>`, read-only).
- [~] **21.05** Personal AI evaluation set (~50 questions) for grounding and citation accuracy across configured providers
  — `apps/server/test/eval/`: 8 documents, 50 questions; with the test model the answering passage is retrieved for
  42 of 42 (all in the top 3) and cited for 95 %.
  Remaining: runs against the user's providers (`SKB_EVAL_PROVIDER=… npm run eval:ai`), which need their keys (RQ-04).
- [~] **21.06** Performance budgets verified in web and desktop modes — Measured in both (Node 24.14 and Electron's
  Node 24.21) on mains power: the mastery pass, start-up, note opening, search over notes and the cached graph are
  within budget in both; desktop start-up is 2.0 s to Today. Four budgets were over in both modes **and on `main`'s
  code at the same time** (a worktree), so the cause is the machine's load during the soak, not a regression.
  The four were also over, by more, on the **Phase 17 code** — which met them on 10 October — measured in the same
  conditions on 11 October: today's machine, not the code.
  Remaining: a run on an idle machine (`npm run test:perf`) to see the four within budget again; left for when the
  laptop is free, with the user's agreement to move on.
- [x] **21.07** Web/desktop parity check — `e2e/desktop.spec.ts`: every page in the desktop window as in the
  browser (heading, sticky header, axe, outline, no console errors), the desktop-only folder controls, and the
  engine's budgets under Electron's runtime alongside plain Node's.
- [x] **21.08** Security re-review and dependency audit — Runtime dependencies: 0 advisories; 8 moderate in the
  installer tooling only (TD-14, unchanged). Code: one raw-HTML insertion (Mermaid, strict mode), no `eval`, SQL
  only from fixed strings or escaped paths, `shell: true` only in launchers built from fixed strings, no keys in
  the repository; the CSP allows scripts only from the app; every API route is still tested against the guards.
- [x] **21.09** Docs: verification report in `docs/journal/`; STATE/FEATURES updated — The report is in the
  11 October journal, with the soak's and the later performance runs; STATE, FEATURES, AGENTS and the guides
  (mastery, AI) are updated.

## Gate
- [ ] All tasks `[x]` (open, by the user's decision: 21.02 a screen reader, 21.04 real reviews, 21.05 real
  providers — all three the user's — and 21.06 an idle machine) · [x] all suites green (898 Vitest, 134 Playwright,
  3 screenshot specs skipped) · [x] report written · [x] merged

## Recommended commit messages
```text
test: complete end-to-end coverage of all primary use cases
```
