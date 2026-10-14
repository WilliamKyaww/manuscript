# Phase 27 — Web pane placement and verification feedback

**Status:** Implementation and automated checks complete; live human verification outstanding · **Branch:** `phase/27-web-pane-right`

## Objective

The student's request of 13 October 2026: keep the note on the left and open its web links on the right;
investigate ScienceDirect's missing human-verification interface without bypassing access controls, changing
browser identity to evade checks or weakening Electron security. Preserve the existing workspace and document
the implementation and remaining verification for Claude.

## Dependencies

Phase 26 is complete (1.4.0). The user explicitly authorised this follow-up. ADR-0046 supersedes ADR-0045's
placement rule; the rest of its separate-session and local-command architecture remains in force.

## Atomic tasks

- [x] **27.01** Review repository instructions, current state, Phase 26, relevant PRD/ADRs, guides, backlog,
  research, screenshot references and latest journals; trace the Notes → workspace → preload → native-view flow.
  The left placement was intentional pane ordering, not a CSS or native-bounds defect.
- [x] **27.02** Open web pages to the right of their source note; handle an existing split and remembered web
  panes without losing tabs or changing ordinary note splits. Preserve note focus and native bounds tracking.
  Workspace regressions and real Electron bounds, resize, close/reopen and note-editing checks pass.
- [x] **27.03** Diagnose the ScienceDirect reproduction, preserve legitimate HTTP response/challenge HTML,
  expose HTTP/load/crash failures with retry and external-browser actions, and retain the native browser identity.
  Baseline: publisher HTTP 403/CPE00001. Rebuilt: HTTP 403 with a visible Cloudflare **Verifying…** widget.
  Desktop/component and local interactive HTTP-response tests pass. The differing response's cause is not
  established; successful live verification remains a separate open task (27.06).
- [x] **27.04** Run focused unit/component and Electron regressions: note editing/navigation, right placement,
  resize, close/reopen, navigation/history, storage, redirects, popups, HTTP errors and failed loads; inspect
  screenshots and native view bounds. Run type-check, lint, unit tests, build, smoke and relevant web E2E checks.
  `npm run verify` passed (1,056 tests); `npm run desktop:build` passed; full `npm run test:e2e` passed
  (154 passed, 3 screenshot-only cases skipped, 0 failed). Native bounds and light/dark screenshots reviewed;
  the new browser chrome has no serious/critical axe violations in either theme. Detailed evidence in the journal.
- [x] **27.05** Update STATE, FEATURES, ADR-0046, relevant guides/PRD, backlog and the dated GPT-6 Astra journal
  with a self-contained handover for Claude.
  Final code, commands, test results, diagnostic limits and Claude's next steps are recorded.
- [ ] **27.06** Manually verify the live ScienceDirect challenge in the integrated browser: if the site offers
  a challenge, the student completes it and records whether access to the article follows.

## Gate

- [x] Required implementation and documentation tasks complete (27.01–27.05).
- [x] `npm run verify` passed (170 files / 1,056 tests, type-check, lint, build, smoke).
- [x] `npm run test:e2e` passed (154 passed, 3 opt-in screenshot cases skipped).
- [x] Live verification outcome recorded accurately; the human step remains explicitly open (27.06).
- [x] Final diff reviewed; clean initial working tree and no unrelated user changes overwritten.
- [ ] Live human verification (27.06) complete or explicitly deferred by the user; branch merged only after
  the gate permits it. No commit, merge, release or installation made in this session.

## Recommended commit messages

```text
fix(notes): open web pages to the right of their source note
fix(desktop): preserve web responses and explain browsing failures
docs: record web pane investigation and Claude handover
```
