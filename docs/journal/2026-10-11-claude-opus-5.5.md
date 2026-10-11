# 11 October 2026 — Claude Opus 5.5

- **Date:** Sunday 11 October 2026, the first hour after midnight
- **Model:** Claude Opus 5.5
- **Phase:** 20 — Final UI/UX polish, the gate (`phase/20-polish`), then Phase 21 begins
- **Summary:** The full end-to-end suite found three regressions from the polish and a test that could not pass after
  midnight; all four were fixed, the suite and verify passed, and Phase 20 was merged. The review itself is in
  `2026-10-10-claude-opus-5.5.md`.

## What was done

**First full run (late on 10 October): 4 failed, 123 passed.**

- *Card set, axe `target-size` (three tests: light, dark, and the review spec).* Giving the card's text the table's
  width (yesterday's fix for cramped questions) pushed each row's checkbox against the card's button, so it was no
  longer a target of its own (WCAG 2.5.8). The checkbox cell keeps a gap.
- *Cheat sheet, axe `scrollable-region-focusable`.* With every page's keys in it, the cheat sheet now scrolls, and
  nothing inside it takes focus, so a keyboard user could not scroll it. A dialogue's body that scrolls becomes a
  focusable, named region. (Its unit test caught that the first version never fired: Radix mounts a dialogue's
  content after the first render, so the ref was empty when the effect ran; a callback ref fixed it.)

**Second run (across midnight): 3 failed, 124 passed.**

- *Practice.* The new region took the dialogue's title as its name, so `getByLabel('Question')` matched both the
  "New question" region and the question field. The region was more than was needed: axe asks for a scrollable
  region to be focusable *or to contain something focusable*, and a form's fields already bring it along. Only a
  body that scrolls with nothing focusable inside becomes a region now (a unit test for each case).
- *Loop and plan.* "Before the lecture **tomorrow**" was not found, nor "due in **5** days". The clock had passed
  midnight: the application's day runs from 04:00 to 04:00 (as in Anki), so at 00:05 the server still counted
  10 October, while the tests seeded dates from the calendar's 11 October. The product is consistent; the tests were
  not. `e2e/days.ts` (`studyDay`) counts from the application's day using the server's own `DAY_STARTS_AT_HOUR`, and
  `loop`, `plan` and `screens` use it. Written into `AGENTS.md`.

**Third run (after midnight): 127 passed, 3 skipped** (the screenshot specs, which run only when asked). `npm run verify`
passed. The checklist, FEATURES, STATE, README and AGENTS (the 04:00 day, reduced motion in E2E, the screenshot specs,
port 4387 taken) were brought up to date, and `phase/20-polish` was merged into `main`.

## Decisions

- **Test dates follow the application's day**, not the calendar; the day's 04:00 start is deliberate (a late-night
  session counts as the evening's) and stays.
- **A dialogue's body takes focus only when it must** (it scrolls and nothing in it can be focused), so long forms do
  not gain a tab stop and their fields keep unique labels.

## Tests run

| Command | Result |
|---|---|
| `npx playwright test --workers=2` (first) | 123 passed, **4 failed** — target size ×3, a scrollable region |
| `npx playwright test --workers=2` (second) | 124 passed, **3 failed** — a label collision, two dates after midnight |
| `npx playwright test --workers=2` (third) | **Pass** — 127 passed, 3 skipped (screenshots only on request) |
| `npm run verify` | **Pass** — type-check, Biome, **886** Vitest tests (core 237, server 443, web 198, desktop 8), build, smoke |

All at below-normal priority with two workers.

## Problems encountered

- A run that crosses midnight is a test of its own: worth remembering for the long suites of Phases 21 and 22.

## Unresolved issues

- Side panels as drawers in narrow windows (B-PL-09). The check of chat and generation against a real provider
  remains the user's.

## Next steps

Phase 21 — verification (`phase/21-verification`, `docs/checklist/phase-21-verification.md`).

---

# Phase 21 — Full verification (`phase/21-verification`), afternoon and evening

- **Time:** 11 October, from about 16:00 (the session resumed after the night)
- **Summary:** Every use case now has an end-to-end walk; accessibility is checked on every page in the browser and
  the desktop window, by keyboard alone and for what a screen reader walks; fuzzing found two backtracking patterns,
  fixed; a soak harness, a recall-calibration report and a fifty-question grounding evaluation exist and have run;
  performance was measured in both modes and compared with `main`; security and dependencies were re-reviewed. The
  eight-hour soak is running (started 17:24 with the user's go-ahead), and three checks are the user's.

## Verification report

### 21.01 Use cases → end-to-end specs

| Use case | Walked through by |
|---|---|
| UC-01 Notes with maths, code and diagrams; backlinks | `notes.spec` (links, backlinks, edits elsewhere, rename, trash, restart); `use-cases.spec` (KaTeX, highlighted code, a Mermaid diagram) |
| UC-02 Find anything | `search.spec` (filters, hostile queries, quick switcher, palette) |
| UC-03 Import lecture material and read it | `library.spec`, `course.spec` |
| UC-04 Modules, lectures, topics, concepts, assessments, deadlines | `course.spec`; `use-cases.spec` (a topic; a deadline on Today) |
| UC-05 The graph: core concepts, gaps, bridges | `graph.spec`, `loop.spec` (between modules) |
| UC-06 FSRS reviews from the keyboard | `review.spec`, `keyboard.spec` |
| UC-07 Quizzes and mock exams; mastery and weak areas | `practice.spec`; `use-cases.spec` (a mock exam that moves mastery) |
| UC-08 Answers from my material, with citations | `ask.spec` |
| UC-09 Flashcards from three slides of a lecture | `generation.spec`, `chat.spec` |
| UC-10 A Markdown summary from lectures and my notes | `chat.spec` |
| UC-11 Socratic tutoring ending in a check question | `plan.spec` |
| UC-12 A seven-day plan | `plan.spec` |
| UC-13 A lecture becomes notes, concepts, cards, a quiz | `loop.spec` |
| UC-14 Export, Obsidian, back up, restore | `portability.spec`; `use-cases.spec` (a backup); notes are plain files (`notes.spec` reads them) |
| UC-15 The desktop application from an installer | `desktop.spec` (shell, both packaged layouts, every page); the installer by hand (Phase 19) |
| UC-16 Claude Code or Desktop through MCP | `agent.spec` |

### 21.02 Accessibility

- **axe** (WCAG 2.0–2.2 A/AA; no serious or critical violation allowed): every route in both themes, the pages with
  content in both themes, open dialogues, and — new — every page inside the desktop window (axe run in the page,
  since an Electron window cannot open the blank page axe normally finishes in).
- **Keyboard alone** (`keyboard.spec`): skip link → a note by name (`Ctrl+O`, `Shift+Enter`) and written in →
  `Ctrl+S` → a flashcard from inside the editor (`Ctrl+Shift+A`, Tab to each field) → `Ctrl+K` "Review due cards" →
  Space, 4 → the cheat sheet → Settings by name. **Found:** a new note opened with focus on its title, so the text
  was many Tab presses away; it now opens with the editor focused.
- **What a screen reader walks:** every route and every page with content has one `h1`, the Main navigation and the
  main landmark, and no heading that skips a level.
- **For the user — a screen-reader spot check (10 minutes):** start Narrator (`Ctrl+Win+Enter`); on Today press `H`
  to move by heading and `D` by landmark; open a note and type a line (Narrator should read "Saved" after a moment);
  open a review session and press Space then 3 (it should read the answer and the next question); open the cheat
  sheet with `?` and Tab into it (it should read "Keyboard shortcuts, region"); close Narrator with the same keys.

### 21.03 Reliability

- **Fuzzing, text:** 300 seeded random notes per run (2,000 in a deeper one) through the Markdown analysis, front
  matter, search queries and cloze, and long runs of single characters. **Found and fixed:** unclosed cloze text
  ("{{c1::" × 1,000, 6,000 characters) took **9.8 s** — cubic backtracking between answer and hint, on the server's
  card checks; now instant. A line of 20,000 "[" took **659 ms** (a link's text could swallow brackets) — now 6 ms,
  with one level of brackets still allowed in link text; unclosed comments were also quadratic, now one scan.
- **Fuzzing, documents:** PPTX, DOCX, PDF, Markdown and zip files damaged at random (bytes changed, cut, garbage
  appended, noise): 25 per format by default, 150 in a deeper run — each read or refused with a `SourceParseError`;
  nothing else, no hang.
- **Soak** (`npm run test:soak`, the built server as its own process, paced): 12 minutes (643 rounds) and 20 minutes
  (538 rounds) with **no failed request**; the live heap after a collection went 35 → 38.6 MB (about 10 KB a round,
  the content each round adds), while the working set levelled off near 285 MB — memory V8 keeps, not a leak.
  p95s: search 13–32 ms (budget 150), note save 26–55 ms (200), next review 5–8 ms (50), queue 11–19 ms (200). A first
  harness made the server look 810 MB at rest: `fork()` had passed on tsx's loader; the server under plain Node is
  113 MB at rest. **The eight-hour run** started at 17:24; its report will be added here.

### 21.04 Calibration of predicted recall

`npm run report:calibration -- --simulate` (500 faces over a year each; reviews of faces in the review state):

| Simulated student | Reviews | Predicted | Recalled | Calibration error | Brier |
|---|---|---|---|---|---|
| Forgets as FSRS predicts | 3,518 | 89.8 % | 90.3 % | **0.5 %** | 0.088 |
| Memories half as long | 5,210 | 89.2 % | 84.8 % | 4.3 % | 0.130 |
| Memories a quarter as long | 10,107 | 87.6 % | 76.1 % | 11.5 % | 0.192 |

The measurement finds calibration where there is some and the gap where there is one; FSRS-6's flat curve makes even
halved memories a gap of only four points, worth knowing when reading a real report. The real report needs the
student's own reviews (a few hundred): `npm run report:calibration -- "<vault folder>"`, read-only.

### 21.05 Grounding evaluation

`npm run eval:ai` with the built-in test model (which cites what retrieval gives it, so this measures retrieval):
the passage holding the answer was **retrieved for 42 of 42** questions, **in the top 3 for all**, and cited for
**95.2 %**; citation precision 48.8 % and declining 0 % reflect the test model, not the system. Against a real
provider the same command scores answers, citations and declining:
`SKB_EVAL_PROVIDER=anthropic SKB_EVAL_MODEL=<model> SKB_EVAL_API_KEY=<key> npm run eval:ai` (or `openai`, or
`openai-compatible` with `SKB_EVAL_BASE_URL` for a local model). That run is the user's (RQ-04).

### 21.06 Performance, web and desktop

On mains power, below-normal priority, with the soak running beside it and the user at the machine. "Web" is the
system Node (24.14), "desktop" Electron's (24.21) — the runtime the desktop app's server runs in; `main` is the
Phase 20 merge in a temporary worktree, measured back to back.

| Budget | Web | `main` (same time) | Desktop | Phase 17 |
|---|---|---|---|---|
| Full index of 10,000 notes (< 60 s) | 24.8 s | 20.4 s | 19.1 s | — |
| Start-up with an index (< 3 s) | 1.5 s | 1.2 s | 0.94 s | — |
| Note open p95 (< 100 ms) | 2 ms | — | 1 ms | — |
| Search p95 (< 150 ms) | 45 ms | 45 ms | 52 ms | 40 ms |
| Search with 10,000 PDF pages p95 (< 150 ms) | **179 ms** | **168 ms** | **218 ms** | 112 ms |
| Graph first build (< 3 s) | **4.1 s** | **3.7 s** | **3.7 s** | 2.5 s |
| Graph payload from the cache p95 (< 500 ms) | 155 ms | 178 ms | 184 ms | 175 ms |
| Graph after an edit (< 1 s) | **1.27 s** | **1.27 s** | **1.22 s** | 0.76 s |
| Retrieval p95 (< 500 ms) | **874 ms** | **825 ms** | **754 ms** | 434 ms |
| Mastery pass (< 500 ms) | 298 ms | — | 326 ms | 254 ms |

The four over budget are over by about the same amount on `main`'s code at the same time, so they come from the
machine's load, not from Phase 21's changes (AGENTS.md §5); desktop mode is no slower than web mode. Desktop
start-up, launch to Today, is 2.0 s (`desktop.spec` annotation). **A run on a quiet machine after the soak**
decides the four.

### 21.07 Parity

`desktop.spec` "every page works in the desktop window as it does in the browser": every route's heading, one sticky
page header, axe, the outline and no console error inside the window; the desktop-only Browse and Show in folder where
the browser has Copy path. With the engine's budgets under both runtimes above, the two modes behave alike.

### 21.08 Security and dependencies

- `npm audit --omit=dev`: **0 vulnerabilities**. With development tools: 8 moderate, all in electron-builder's chain
  (`global-agent` via `@electron/get`) — installer tooling only, unchanged since Phase 19 (TD-14).
- Code review: one raw-HTML insertion (Mermaid's SVG, strict security level, which sanitises); no `eval` or `new
  Function`; SQL from fixed strings, the backup path escaped; `shell: true` only in the local launchers, whose command
  lines are fixed strings; no API keys in the repository (`git grep` for key formats). CSP: scripts only from the app,
  no objects, no framing, inline styles only. Every API route is still exercised against the guards in the server
  suite. The Phase 21 tools keep keys in the environment, send them only to a loopback server whose data folder is
  deleted, and never write them to a report.

## Decisions

- **Day boundaries:** the deadline widget's calendar day against the server's 04:00 day is recorded (B-LE-38) rather
  than changed in a verification phase.
- **The soak judges memory on the live heap after a collection**, not the working set, which Node does not hand back.
- **Real-provider and real-data checks are the user's**: the tools run end to end here with the test model and
  simulated students, and need only a command.

## Tests run

| Command | Result |
|---|---|
| `npx playwright test e2e/use-cases.spec.ts` | **Pass** — 4/4 |
| `npx playwright test e2e/keyboard.spec.ts` | **Pass** (after rating Easy: a Good new card returns after a learning step) |
| `npx playwright test e2e/accessibility.spec.ts` | **Pass** — 26/26 with the outline check |
| `npx playwright test e2e/desktop.spec.ts -g "every page"` | **Pass** — once axe ran in the page |
| fuzz tests (core 2 tests, server 5) | **Pass**, also with `SKB_FUZZ_RUNS=2000` / `150` |
| `npm run test:soak` (12 and 20 minutes) | **Pass** — 0 failures, flat live heap |
| `npm run test:perf`, `test:perf:mastery` (web, desktop, `main`) | see 21.06 |
| `npm run verify` | **Pass** — **898** Vitest tests, build, smoke |

## Problems encountered

- `node -e` edits of `package.json` from Bash hung twice without applying (quoting); the editor tools did it.
- A cancelled background command left a Vitest worker spinning on the old cubic pattern; it was found and stopped
  (only the processes from that run, checked by command line first).
- `fork()` inherits the parent's flags: under tsx the server ran through tsx's loader. Both new harnesses pass
  `execArgv` explicitly.

## Next steps

When the soak ends (about 01:25): add its report here, run `npm run test:perf` on a quiet machine, then the full
Playwright suite and the gate. The user's three checks (Narrator, calibration on real reviews, real providers) can be
done at any time and recorded.
