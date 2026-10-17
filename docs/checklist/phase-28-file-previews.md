# Phase 28 — Read-only file previews

**Status:** Partial; paused for Claude handover at the user's request · **Branch:** `phase/28-file-previews`

The user explicitly requested non-Markdown file viewers on 16 October, followed by Reading / Page layout
toggles for Word and spreadsheets, selecting a local LibreOffice renderer. This authorises the new feature
while retaining Phase 27 and the pending installation handover changes; no merge or release is implied.

- [~] **28.01** Open attachments in persistent read-only workspace tabs; preserve notes and web tabs.
  File-tree/file-link integration and persistent tabs are implemented; browser restoration/note regression and
  desktop attachment-only-vault/close checks pass.
  - Remaining: wider workspace/browser regressions and visual inspection.
- [~] **28.02** PDF/image/text/code/JSON/XML/HTML/CSV viewers and readable DOC/DOCX/XLSX previews.
  Real-format all-format browser test passes, including binary DOC and all requested image encodings.
  HTML scripts stay sandboxed; CSV accessibility check passes.
  - Remaining: malformed/oversized/empty-file regression coverage; review JSON numeric fidelity and sparse XLSX rows.
- [~] **28.03** Reading / Page layout toggle using private local LibreOffice conversion to PDF.
  LibreOffice 26.8.1.1 installed. Real DOC/DOCX/XLSX conversions, original integrity, missing-renderer unit test,
  browser and desktop mode-switch tests pass. PDF bytes go directly to PDF.js without weakening CSP.
  - Remaining: review timeout/process-tree cleanup and broader failure cases; packaged renderer/worker smoke.
- [~] **28.04** Full verification, relevant browser/desktop E2E, visual/accessibility review and Claude handover.
  `npm run verify` passed (1,075 tests); focused E2E passed (2 tests); Impeccable detector returned no findings.
  Screenshots captured in `.e2e/file-preview-screens/`; 17 October handover written.
  - Remaining: inspect screenshots, run wider/full E2E, complete final review and package with a distinct version.

## Gate

- [x] Type-check, lint, unit/integration tests, build and smoke pass (`npm run verify`, 1,075 tests).
- [ ] File viewers and toggles verified end to end; existing note/browser behaviour preserved.
- [ ] Documentation, dependency notices and architectural decision reflect actual results and limitations.
