# Phase 27 — Web pane placement and verification feedback

**Status:** Implementation, live confirmation and automated/package checks complete; uncommitted follow-up · **Branch:** `phase/27-web-pane-right`

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
- [x] **27.06** Manually verify the live ScienceDirect challenge in the integrated browser: if the site offers
  a challenge, the student completes it and records whether access to the article follows.
  On 14 October the user reported ticking the checkbox repeatedly: it disappears and returns without granting
  access. A fresh-profile agent observation showed the checkbox at 45 seconds, but did not attempt a solve.
  The user confirms regular Chrome completes verification and reaches the paper on the same connection.
  Normal, non-automated diagnostic capture confirms the cookie is sent and the response is a fresh challenge.
  Cloudflare's own checker reports **Turnstile Failed Despite Passing All Checks**; the user confirms it loops.
  Minimal secure Electron 44.5.1, 44.7.2 and 45.0.0-beta.3 all fail with 600010; fresh genuine Chrome succeeds.
  A reusable isolated diagnostic launcher is provided; no dependency upgrade was adopted from these experiments.
  On 15 October the integrated WebView2 tab reached the article: user confirmed article access and normal
  clicking/scrolling, with a screenshot showing the paper on the right of the diagnostic note. No automated
  solve, spoofing or token transfer was used. See the [15 October journal](../journal/2026-10-15-gpt-6-astra.md).

### Windows embedded-engine follow-up (user requested, 14 October)

- [x] **27.07** Integrate the verified WebView2 runtime into real Windows child surfaces behind the existing
  tab bridge; validate private IPC and preserve the application/session boundary (ADR-0047).
  Native local frame input, redirects, sessions, popups, history, bounds/resizing, overlays, close/reopen,
  renderer reload and failed-load recovery pass. Human clicking/scrolling and live article access confirmed.
- [x] **27.08** Build/package the pinned native helper and its licence, retain other-platform/legacy fallback,
  and document the runtime requirement and developer diagnostics.
  Unpacked build and separate NSIS candidate succeeded. The installer payload runs WebView2 and supports
  note creation/edit/save/navigation beside the native page in an isolated vault. Guide, ADR and handover updated.
- [x] **27.09** Run Windows-native browser regressions and the full relevant gate checks; manually verify the
  ScienceDirect article in the integrated tab, not only the standalone WebView2 probe.
  Full E2E: 156 passed, 3 opt-in screenshot cases skipped; source and packaged WebView2 tests passed.
  Installer-payload smoke includes native browsing and note creation/edit/save/navigation.

## Gate checks

- [x] Required implementation and documentation tasks complete (27.01–27.09).
- [x] `npm run verify` passed (172 files / 1,069 tests, type-check, lint, build, smoke).
- [x] Full Playwright suite after the fresh build passed (156 passed, 3 opt-in screenshot cases skipped).
- [x] Live verification outcome recorded accurately: actual embedded WebView2 article access and interaction
  confirmed by the user on 15 October (27.06).
- [x] Final diff reviewed; clean initial working tree and no unrelated user changes overwritten.
- [x] Live human verification (27.06) complete. No commit, merge, release or installation made in this session;
  a local installer candidate is available, distinct from the earlier release artefact.

## Recommended commit messages

```text
fix(notes): open web pages to the right of their source note
fix(desktop): preserve web responses and explain browsing failures
fix(desktop): embed WebView2 for Windows research tabs
docs: record web pane investigation and Claude handover
```
