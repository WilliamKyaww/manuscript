# 17 October 2026 — Claude Sonnet 5.5

- **Date:** 17 October 2026
- **Time:** afternoon, after the 14:13 checkpoint commit `8d91184`
- **Agent model:** Claude Sonnet 5.5
- **Phase:** 28 — read-only file previews (user-requested; branch `phase/28-file-previews`)
- **Work performed:** took over the GPT-6 Astra handover ([earlier entry](./2026-10-17-gpt-6-astra.md)) and did its
  five steps: data fidelity, converter hardening, screenshot review, wider verification and packaging. Nothing was
  committed, merged, pushed or installed.

## What the handover said, and what was true

- The handover calls the implementation uncommitted. It was already committed as `8d91184`, and the branch matched
  `origin`; everything below sits on top of it as uncommitted changes.
- The project folder has been renamed to `Manuscript`, but the `node_modules/@skb/*` workspace links still pointed at
  `…\study-knowledge-base\…`, so no test could resolve `@skb/core`. `npm install --prefer-offline` re-linked the four
  workspaces ("changed 4 packages"); `package-lock.json` did not change. Now in `AGENTS.md` §5.

## Findings and fixes

1. **JSON was changed on its way to the screen** (handover item 2, worse than described). Parse-and-stringify rounded
   `12345678901234567890`, turned `1e400` into `null`, dropped the sign of `-0.0` and kept only the last of a repeated
   key. `preview/json.ts` now validates with `JSON.parse` but re-indents the text itself, copying every lexeme; output
   is capped (a hundred thousand nested brackets would otherwise need terabytes of indentation). A file over 500,000
   characters is now formatted whole and cut afterwards, so it is no longer reported as "not valid JSON".
2. **Sparse XLSX rows**: a row's place is its `r` address, so blank rows keep their numbers (the viewer already printed
   `index + 1`); an unaddressed or backwards row follows the previous one; nothing past row 1,000 is read.
3. **A maximum-size sheet blocked the server for 3.4 s** (7.9 MB of XML from a 0.4 MB file, inside every limit; up to
   three such parts are allowed). Only the first 1,000 rows are shown, so the text is now cut at the 1,001st `<row>` and
   only as many shared strings as those rows use are parsed: **233 ms, flat from 1 MB to 7.9 MB**. The XML reader's
   `<!DOCTYPE>` refusal is the test oracle: a `<!DOCTYPE>` placed after the cut is never seen.
4. **Converter process handling** (`preview/layout.ts`, rewritten). On this machine killing the `soffice.exe` launcher
   also ended `soffice.bin` (probed with a 15 MB input: no PDF, no process left), so `execFile`'s timeout was adequate
   *here*; on macOS/Linux `soffice` is a script and would leave the child running. It now spawns the launcher itself and
   ends the whole tree on timeout or cancel (`taskkill /T /F` on Windows, the process group elsewhere) and settles only
   when the tree is gone. One conversion runs and three more wait in order (a fifth request is told to retry); an
   abandoned request gives up its place at once; closing the tab or switching back to Reading cancels the conversion
   through `request.signal` (`@hono/node-server` aborts it when the connection closes early). Clean-up failure no longer
   fails the preview: the next conversion sweeps `manuscript-preview-*` folders over an hour old.
5. **A damaged `.docx` was drawn as text.** LibreOffice guesses the format, so unreadable bytes became a PDF of junk
   while Reading correctly said "damaged". The OOXML filters are now named (`--infilter`); `.doc` stays guessed because
   Word writes RTF, HTML and OOXML under that name. Empty files, inputs that grew after the size check and layouts over
   64 MB each get their own message. Converter failures are `503` (so the diagnostics log records them with a cause);
   a file that is too large, empty or of the wrong kind stays `400`.
6. **A workbook that is too large was called damaged.** `SourceParseError` messages are written for the student and
   were being replaced by "may be damaged"; they now pass through. The "too large" message states the limit.
7. **Screenshot review found a real layout bug.** `PdfViewer` is two `h-full` panes made for a row (the source page
   gives it one). `FileTab` and `LayoutPreview` put it in a column, so the panes stacked at twice the height: in Page
   layout the file header and tab row were pushed out of view and the page area was empty beside the thumbnail. The
   earlier E2E passed because `canvas.first()` matched the *thumbnail's* canvas. New `files/PdfFrame.tsx` gives it a row;
   the E2E now asserts that the pages pane sits beside the thumbnails, within the frame, with the header in view.
   Also: the active tab is scrolled into view (a dozen open files hid it); the sheet selector is hidden for a
   single-sheet CSV; CSV and workbook notices are separate and accurate; errors have their own titles ("This file
   cannot be previewed", "Page layout is not available") and keep Download and the Reading toggle; images sit on white
   so a transparent diagram stays legible in the dark theme; `LayoutPreview` no longer throws on a non-JSON error body.

## Unrelated failure found, and its cause

`loop.test.ts` (Phase 15) began failing on 17 October for any code. It sets an exam date from the real `Date.now() + 9
days` while the test bed's clock is fixed at 4 October, so the exam is 22 days from the planner's "today", outside its
21-day mock-exam window. Weekday availability was my first guess; pinning it did not help (reverted). The test now
takes the date from `bed.ctx.clock`. This is outside Phase 28; it is a one-line change that can be dropped if unwanted.

## Decisions

ADR-0048 has a dated amendment covering items 1–5 and what was considered and not done (Windows Job Objects, a
LibreOffice instance pool). No new ADR. New backlog: B-KM-39 to B-KM-42 (`.doc` that is really OOXML/RTF/HTML,
workbook number/date formats and limits, workbooks whose sheet XML exceeds 8 MB, page-range Page layout).

## Tests

- `npm run verify` (after all code changes): **175 files, 1,086 tests passed**, type-check, lint, build and smoke all
  green. (Before the loop-test fix the first run had three failures: that one, one real-LibreOffice case that hit the
  45 s deadline while the whole suite shared the machine — the real-converter tests now pass a 110 s deadline, and only
  the deadline tests use a short one — and `NotesPage.test.tsx › shows the file tree…`, which passes alone and on the
  rerun, so load, as `AGENTS.md` §5 warns.)
- New unit tests: JSON lexemes, truncation and hostile nesting; sparse row addresses; absolute part paths and chartsheets;
  lazy rows and strings; too-large workbook message; the process tree really ends (a fake launcher with a grandchild,
  timeout and cancel); the queue (order, turn-away, abandoned places); real LibreOffice deadline, cancellation, leftover
  folders, damaged/empty/oversized inputs.
- Full E2E (`npm run test:e2e`, 16.6 min, after rebuilding the unpacked build and the installer payload): **160 passed,
  3 skipped (the optional screenshot cases), 1 failed**: `desktop.spec.ts › the desktop shell starts…`, at the
  keyboard-zoom step (`webContents.sendInputEvent` Ctrl+`-` → the menu's `zoomOut` role, which needs the window to have
  OS focus). Six runs of unchanged code: fail (full run), pass, fail (whole file), pass, fail, fail. Nothing in
  `apps/desktop` is changed, and Phase 27's full run had passed it; treated as environmental, not proven so (a
  baseline comparison needs two rebuilds and was not made). It needs re-running with the window in front.
- All five Phase 28 specs passed in that run, including the two packaged-build tests; the first two were then extended
  with axe in both themes (CSV, Word reading, Page layout, PDF, errors, empty, unsupported, sparse table: no serious
  findings) and passed again alone.
- The geometry assertion was proved to bite: with `PdfFrame` mutated back to a column the test fails (pages pane at
  x=321 inside the thumbnail pane that ends at 496); restored and rebuilt.
- Over a real socket against the built server (`.e2e/abort-probe.mts`, git-ignored scratch): while converting, 2 office
  processes and 1 temp folder; the client aborts; 3 s later 0 processes and 0 folders; the next request returns the PDF.
- A conversion takes about 11 s with a new profile and about 4.2 s with a reused one (`.e2e/warm-probe.mts`); recorded
  as B-KM-43, not implemented, because it changes the isolation ADR-0048 chose.

## Packaging

`SKB_DIST_VERSION=1.4.0-FilePreviews npm run desktop:dist` →
`apps\desktop\release\Manuscript-Setup-1.4.0-FilePreviews.exe` (128,226,711 bytes, SHA-256
`1d0d8eaad9113fddb6b72616afec0dfb73c163d0e4a7f21f9b732eeab608db4a`, unsigned). It contains Phase 27 and Phase 28 and is
**not installed**. `Manuscript-Setup-1.4.0-WebView2.exe` (Phase 27 only) and `Manuscript-Setup-1.4.0.exe` are untouched.
`win32-unpacked` and `win-unpacked` were rebuilt, and both hold `resources/server/file-preview-worker.mjs`. The new
packaged-app test reads a real binary `.doc` through that worker and prepares Page layout for it and an XLSX, in both
layouts (it fails, deliberately, on a stale package).

## Not done / left open

- macOS and Linux: the process-group kill (`process.kill(-pid)`) has not run anywhere; the tree test passes through
  `taskkill` here. The same test will exercise it on those platforms.
- The desktop keyboard-zoom check above.
- Reading shows a date as its stored serial number and no merged cells (B-KM-40); a workbook whose sheet XML expands
  past 8 MB is refused (B-KM-41).
- Installing the candidate over the user's app is theirs to ask for.

## Next steps

1. The user installs `Manuscript-Setup-1.4.0-FilePreviews.exe` (close Manuscript first) and tries a real Word file,
   a real workbook and a PDF; LibreOffice 26.8.1.1 must be installed on that machine.
2. Gate: review the diff, commit, and merge `phase/28-file-previews` with the version bump when happy.
