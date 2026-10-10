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
