# Phase 20 — Final UI/UX polish

**Status:** In progress — every task done but the sticky-header audit, which completes with the gate's full E2E run · **Branch:** `phase/20-polish`

## Objective
Make the whole application feel like one polished production product: visual design direction, token
values, component polish and a screen-by-screen review of every major screen.

## Why it exists
The brief defers visual polish until the functional system is stable (`ui.md` §10).

## Dependencies
Phase 19.

## How the review was done
`e2e/screens.spec.ts` seeds a realistic course (two modules, four lectures, ten related concepts, notes with front
matter, a callout, code and maths, a slide deck, a card set, answered questions and a plan) and photographs 24 screens
in both themes; `e2e/screens-assistant.spec.ts` does the same for chat, its approvals and the Inbox with the built-in
test model on a server of its own. Every screen was looked at in both themes at 1440 px, and in the light theme at
1280 and 768 px. What was found and changed is under each task; the 10 October journal (Claude Opus 5.5) has the
account.

## Atomic tasks
- [x] **20.01** Visual direction and token values (colour, type scale, spacing, radii, elevation) for light and dark
  — Direction written down (`ui.md` §8): warm paper neutrals, one green accent, a compact Segoe UI scale, three radii
  and shadows. The values were reviewed screen by screen in both themes and kept (every text colour meets AA on every
  surface; axe is clean everywhere); motion tokens now also drive enter animations.
- [x] **20.02** Component polish and a design-system reference page — `/design-system` (Settings › About): every
  colour token with its resolved value, type, radii, elevation, buttons, form controls, badges, progress, keys, tabs,
  states and dialogues, live; a test fails if `tokens.css` defines a token the page does not list. New: the `link` and
  `danger-outline` button variants, `ConfirmDialog`, `InlineError`, icon tabs for narrow panels, one `eyebrow` style
  for panel labels (there were five), section headers that no longer bleed into the gutter, header actions that
  wrap below the title.
- [x] **20.03** Today dashboard — "Open the plan" reads as a link; "Practise" matches across widgets; every widget
  says when its data could not be loaded instead of "Nothing is due" or a blank (`InlineError`).
- [x] **20.04** Knowledge explorer (notes tree, search results) — Reviewed; the tree's chevron now follows the
  motion tokens (it ignored reduced motion); search results needed nothing.
- [x] **20.05** Note editor, including live-preview decorations in CodeMirror — Live preview hides the marks of
  headings, emphasis, strikethrough, inline code and links away from the cursor (toolbar toggle, remembered, on by
  default; wikilinks stay as written); front matter is small and muted instead of a big bold setext heading; the
  details tabs no longer run off the panel.
- [x] **20.06** Document/source viewer — Reviewed; its labels use the shared `eyebrow` style.
- [x] **20.07** Library — Reviewed; nothing needed.
- [x] **20.08** Graph — "Between modules" is no longer title-cased by CSS; insight and node-detail labels use
  `eyebrow`.
- [x] **20.09** Module and course views — Delete in the header is outlined; "All progress" reads as a link;
  lecture dates read as dates; readiness says when it could not be worked out.
- [x] **20.10** Lecture view — Deleting a lecture asks first (it happened on the first click); the date reads as a
  date; the page's sections move to `LectureSections.tsx`.
- [x] **20.11** Concept page — Delete outlined; mastery says when it could not be worked out.
- [x] **20.12** Review session and flashcard sets — Deleting selected cards asks first, and the message says
  "deleted" not "updated"; the Card column takes the table's room; empty statistics charts say why; Delete set is
  outlined; the session's keys have one definition shared with the cheat sheet.
- [x] **20.13** Quizzes, practice and mock exams — "Last result" reads as a link; feedback labels use `eyebrow`;
  the quiz page was reviewed with answered questions.
- [x] **20.14** Progress / mastery — Concepts with nothing to practise are chips (name links to the concept, labelled
  buttons to write or make questions) instead of "Name +" beside bare icons; "Open module" and "Open concept" read as
  links.
- [x] **20.15** Study plan — The length beside Plan again starts at the current plan's (it offered 7 days beside a
  14-day plan).
- [x] **20.16** Chat (activity rows, approvals, result cards) — An approval card read "Moved the note
  note_01M4KX… to the trash": it now asks "Move the note “Scratch” to the trash" (tools may name their target
  for approvals, `ask`); activity lines count properly ("Listed 1 note"); before a call has run they say what it will
  do, not what it did.
- [x] **20.17** Inbox — Cloze drafts read as text with the answers highlighted, not `{{c1::…}}`.
- [x] **20.18** Settings — Reviewed; the design system is linked from About.
- [x] **20.19** Empty, loading and error states across all screens — Audited every component that loads data:
  `InlineError` in Today's widgets, the plan widget, module readiness, concept mastery and code graphs; empty charts
  explain themselves; optional extras may stay hidden (`ui.md` §5).
- [x] **20.20** Keyboard shortcuts review and cheat sheet — The cheat sheet lists **Everywhere** (the registry) and
  **On a page** (`shortcuts/reference.ts`: editor, notes list, review session, practice, chat, quick switcher,
  dialogues), wherever it is opened; key caps learn F-keys and Click; the Markdown guide points to it.
- [x] **20.21** Motion and micro-interactions (reduced motion respected) — Dialogues fade and rise, menus and
  popovers fade in, on the duration tokens (0 ms under reduced motion); an E2E test checks both; the other E2E tests
  run with reduced motion so axe never samples a half-faded dialogue.
- [x] **20.22** Responsive pass (768–1920 px) — Below 1024 px the sidebar is the icon rail (opening it there is not
  remembered); header actions wrap; icon tabs; an E2E test checks every route at 800 px for the rail and no sideways
  overflow. Side panels stay resizable panes rather than drawers (B-PL-09).
- [ ] **20.23** Sticky-header audit (E2E test passes; exceptions documented) — The design system joined the audited
  routes and passes; exceptions: still none (`ui.md` §2).
  Remaining: the gate's full E2E run.
- [x] **20.24** Docs: screenshots in README and guide; STATE/FEATURES/journal updated — Thirteen screenshots in
  `docs/screenshots/`, in the README, the guides' index and ten guides; `ui.md` §§2, 5, 6, 8–10; the Markdown guide (live preview,
  the cheat sheet); README status brought up to date (it still said Phases 0–10).

## Gate
- [ ] All tasks `[x]` · [ ] verify + E2E green · [x] docs updated · [ ] merged

## Recommended commit messages
```text
style: apply final design tokens and component polish
style(web): polish <screen> for consistency and states
```
