# Phase 28 — Read-only file previews

**Status:** Implemented, hardened and verified on 17 October 2026, with one E2E check outstanding (28.04); **not merged,
not released, candidate installer built but not installed** · **Branch:** `phase/28-file-previews`

The user explicitly requested non-Markdown file viewers on 16 October, followed by Reading / Page layout toggles for
Word and spreadsheets, selecting a local LibreOffice renderer. This authorises the new feature while retaining Phase 27
and the pending installation handover changes; no merge or release is implied. Evidence is in the
[17 October journal](../journal/2026-10-17-claude-sonnet-5.5.md).

- [x] **28.01** Open attachments in persistent read-only workspace tabs; preserve notes and web tabs.
  File-tree and file-link integration, persistence across a reload, attachment-only vaults, the open tab kept in view
  when a dozen are open. Full E2E (160 passed) includes the workspace, notes, browser and WebView2 specs.
- [x] **28.02** PDF/image/text/code/JSON/XML/HTML/CSV viewers and readable DOC/DOCX/XLSX previews.
  JSON numbers, key order and repeated keys are shown as written; sheet rows keep their addresses; empty, oversized,
  damaged, unsupported and unreadable files each say why. A sheet of any size opens in about 250 ms. HTML scripts stay
  sandboxed. Known limits: B-KM-39 to B-KM-41.
- [x] **28.03** Reading / Page layout toggle using private local LibreOffice conversion to PDF.
  The converter's whole process tree ends on timeout or cancel; one conversion runs and three wait; a closed tab cancels
  it (verified over a real socket against the built server); OOXML formats are named, so damaged files are refused.
  Both packaged layouts (unpacked build, installer payload) read a real binary `.doc` in the shipped worker and prepare
  Page layout. Not verified: the POSIX process-group path (macOS and Linux were not run). A fresh profile makes each
  conversion about 11 s; reusing one would take about 4 s (B-KM-43, the student's decision).
- [~] **28.04** Full verification, relevant browser/desktop E2E, visual/accessibility review and handover.
  `npm run verify`: 175 files, 1,086 tests, type-check, lint, build, smoke. Full E2E: 160 passed, 3 optional screenshot
  cases skipped, **1 failed** — the desktop shell's keyboard-zoom check (a menu accelerator that needs the window to
  have OS focus; it passed twice and failed four times across six runs of identical code, and nothing in `apps/desktop` changed).
  Screenshots of every format and state were inspected in both themes and at 760 px (they found the stacked-pane bug,
  fixed). Axe: no serious violations on CSV, Word reading, Page layout, PDF and the error/empty/unsupported/table states,
  in both themes. The geometry assertion was confirmed to fail on the old layout.
  - Remaining: a clean full E2E run, which needs the desktop zoom check to pass with the window in front of the
    student (or its focus dependence fixed, which is a Phase 18 test, not a Phase 28 one).

## Gate

- [x] Type-check, lint, unit/integration tests, build and smoke pass (`npm run verify`, 1,086 tests).
- [~] File viewers and toggles verified end to end; existing note/browser behaviour preserved.
  Done: 160 of 161 E2E tests pass. Remaining: the desktop zoom check (above), and a hand check of a real Word file,
  workbook and PDF in the installed candidate.
- [x] Documentation, dependency notices and architectural decision reflect actual results and limitations
  (ADR-0048 and its amendment, the Markdown guide, B-KM-38 to B-KM-43, `THIRD_PARTY_NOTICES.md`).
