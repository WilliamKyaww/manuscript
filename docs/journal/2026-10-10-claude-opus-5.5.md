# 10 October 2026 — Claude Opus 5.5

- **Date:** Saturday 10 October 2026, evening (about 20:30–23:30)
- **Model:** Claude Opus 5.5 (the session began on Claude Sonnet 5.5; its journal for today,
  `2026-10-10-claude-sonnet-5.5.md`, covers Phases 16–19 and the start of this one)
- **Phase:** 20 — Final UI/UX polish (`phase/20-polish`)
- **Summary:** A screen-by-screen review from screenshots of every screen with realistic content, in both themes and
  at 1440, 1280 and 768 px, and the fixes it called for: the design tokens written down as a direction and shown on a
  new design-system page, live preview in the note editor, deletes that ask first, error states that never pass
  for an answer, approval cards that name their target, a complete shortcuts cheat sheet, motion that respects
  reduced motion, a sidebar rail for narrow windows, and screenshots in the README and guides.

## What was done

**How the review worked.** Claude Sonnet 5.5 wrote `e2e/screens.spec.ts` before handing over: it seeds a realistic
course over the API (two modules with assessments, four lectures, ten concepts with eleven relations, notes with
front matter, a callout, Go code and maths, a slide deck attached to a lecture, a card set, answered questions and a
plan) and photographs every screen in both themes. I added the quiz page and the review session to it, and wrote
`e2e/screens-assistant.spec.ts` for the screens that need a model — a chat's activity and result card, an approval
card, and the drafts it made in the Inbox — on a server of its own with the built-in test model (port 4387, throwaway
vault and data folders, as `chat.spec.ts` does). Both run only when `SKB_SCREENSHOTS` names a folder. I read every
picture and listed what was wrong before changing anything.

**What the screens showed, and what changed** (task by task in `docs/checklist/phase-20-polish.md`):

- *Note editor.* Front matter was drawn as a large bold heading — CodeMirror's Markdown parser reads the lines
  above a closing `---` as a setext heading. It is now small, monospace and muted (`editor/frontmatter.ts`, which
  finds the block as the notes parser does). **Live preview** (`editor/live-preview.ts`) hides the marks of headings,
  emphasis, strikethrough, inline code and links wherever the cursor is not, and shows them again in the element under
  the cursor; atomic ranges make the cursor step over a hidden mark. Links with an address hide `[` and everything
  from `]` on as two ranges (marking each node separately left a stray space before a link title). Wikilinks and
  bare brackets are left alone. A ¶ toggle in the toolbar switches it through a CodeMirror compartment, so text,
  cursor and undo history survive; the choice is remembered, and it is on by default. The details panel's four tabs ran
  off its edge: tabs can now carry an icon, with the name shown on the selected tab once the list has 12rem and on all
  of them from 19rem — container queries, so the names follow the panel as it is dragged, not the window.
- *Deletes.* Deleting a lecture happened on the first click, and so did deleting the cards selected in a set — every
  other delete asks. Both ask now (`ConfirmDialog`, which says what is kept). Delete buttons in page headers were the
  loudest thing on the page; they are outlined (`danger-outline`), and the solid danger button is kept for the
  confirming button.
- *Links among buttons.* "Open the plan", "Open module", "All progress", "Open concept" and "Last result" were ghost
  buttons with one-word labels and read as bold headings; a `link` variant gives them the accent colour, with an arrow
  where they leave the page.
- *Error states.* An audit of every component that loads data found Today's reviews widget saying "Nothing is due.
  Well done." when its request failed, the deadlines widget "Nothing is due in the next fortnight", and the plan widget,
  module readiness, concept mastery and Settings' code graphs going blank. `InlineError` (one line and Try again) is the
  card-sized ErrorState they now use. The test for the reviews widget was checked to fail without the fix.
- *Assistant.* An approval card read "Moved the note note_01M4KX8B9HK02… to the trash": the past tense for something
  not yet done, and an id the student never sees. Tools can now say what an approval is for (`ask(services, input)`,
  used by the registry for approval cards and declined calls): "Move the note “Scratch” to the trash", "Merge the
  concept “Paxos (copy)” into “Paxos”", "Delete 2 flashcards". Activity lines count properly ("Listed 1 note", not "1
  notes") and say what a call will do before it has run. In the Inbox, cloze drafts showed `{{c1::commitment}}`; they
  read as text with the answers highlighted (`revealCloze` in core).
- *Smaller things.* The card table squeezed the card's text into a narrow column; review charts with nothing to plot
  were a row of empty bars and now say why; Plan offered "7 days" beside a 14-day plan, so planning again would
  quietly shorten it; lecture dates read 2026-10-12; Progress's concepts without material were "Name +" beside bare
  sparkle icons and are chips now; the graph's "Between modules" was title-cased by CSS; section headers bled into the
  page gutter; the small upper-case panel labels came in five weights and colours and are one `eyebrow` utility.
- *Shortcuts.* The cheat sheet showed only what was registered at that moment, so the editor's, the notes list's,
  practice's and chat's keys were in no list. It now has **Everywhere** (the registry) and **On a page**
  (`shortcuts/reference.ts`), and the review session's keys have one definition (`session/keys.ts`) used by the
  session and the sheet.
- *Motion.* Dialogues fade and rise, menus and popovers fade, over the duration tokens, which are 0 ms under reduced
  motion; the notes tree's chevron ignored the setting and now uses them. An E2E test reads a dialogue's animation
  duration with the setting off and on.
- *Narrow windows.* At 768 px the sidebar took a third of the window and titles were cut short. Below 1024 px the
  sidebar is the rail whatever was chosen for wide windows (opening it there is not remembered); header actions move
  below the title instead of truncating it. An E2E test visits every route at 800 px.
- *Design system.* The direction is written down in `ui.md` §8; `/design-system` (Settings › About) shows every token
  with its resolved value and every shared component, and a test fails if `tokens.css` gains a token the page does not
  list.
- *Docs.* Thirteen screenshots (1280 px) in `docs/screenshots/`, in the README (which still said "Phases 0–10
  complete") and the guides; `ui.md` §§2, 5, 6, 8, 9, 10; live preview and the cheat sheet in the Markdown guide.

## Decisions

- **Token values kept.** The review found layout and component problems, not palette ones: every text colour already
  meets AA on every surface in both themes and axe is clean. The direction is recorded rather than the values moved.
- **Side panels stay panes in narrow windows** rather than becoming drawers as `ui.md` §9 planned: at 768 px they are
  narrow but usable and can be dragged. Recorded as B-PL-09 and in `ui.md` §9; no ADR (a deferral, not a change of
  architecture).
- **End-to-end tests run with reduced motion** (`playwright.config.ts`), so axe never measures colour contrast half-way
  through a fade; one test checks the motion with the setting off.
- **Live preview is on by default** — it is what "live-preview decorations" asks for, the marks come back wherever the
  cursor is, and one click turns it off for good.
- **`ask` is optional and only for approvals**: `describe` keeps its job for the activity list, and a tool that cannot
  find its target (deleted meanwhile) falls back to `describe`, so the call itself reports the problem.

## Files changed

- Web: `components/{Button,ConfirmDialog,Dialog,DropdownMenu,ContextMenu,Popover,Page,Pane,States,Tabs}.tsx`,
  `styles/index.css`, `features/design/*` (new), `features/notes/{NoteWorkspace,ViewControls,notes-store}`,
  `features/notes/editor/{extensions,MarkdownEditor,frontmatter,live-preview}`, `app/{Sidebar,layout-store,
  ShortcutsDialog,shortcuts/reference,shortcuts/registry}`, `features/review/{SetPage,Bars,ReviewPage,glimpse,
  session/keys,session/SessionPage}`, `features/learning/{LecturePage,LectureSections,module/LecturesSection,
  module/ModulePage}`, `features/today/*`, `features/progress/*`, `features/plan/PlanPage`, `features/inbox/DraftsPanel`,
  `features/graph/GraphPage`, twelve files for the `eyebrow` labels, `router.tsx`, `vitest.config.ts`.
- Server: `modules/agent/{types,registry}.ts`, `modules/agent/tools/{shared,knowledge,concepts,files,learning,sources}.ts`.
- Core: `learning/cards.ts` (`revealCloze`).
- Tests: `live-preview.test.ts`, `design.test.tsx`, `Bars.test.tsx`, `tools/describe.test.ts`, additions to the
  learning, review, progress, plan, inbox, App, registry, runner and cards tests; `e2e/{screens,screens-assistant,
  shell}.spec.ts`, `playwright.config.ts`.
- Docs: `README.md`, `docs/screenshots/*` (new), `docs/guide/*` (eleven), `docs/prd/ui.md`, `FEATURES.md`, `STATE.md`,
  the Phase 20 checklist, `docs/backlog/backlog.md` (B-PL-09).

## Tests run

| Command | Result |
|---|---|
| `npm run verify` (after the first seven commits) | **Pass** — 874 Vitest tests, build, smoke |
| `npm run verify` (after the error states and screen fixes) | **Pass** — 878 Vitest tests, build, smoke |
| `npx playwright test e2e/shell.spec.ts -g "ease in\|narrow window\|cheat sheet\|design-system"` | **Pass** — 6/6 |
| `SKB_SCREENSHOTS=… npx playwright test e2e/screens*.spec.ts` (1440, 1280, 768 px) | **Pass** — every screen photographed |

Every heavy run was at below-normal priority with two Vitest workers (the laptop runs hot).

## Problems encountered

- **A Bash command expanded backticks** inside a double-quoted Node one-liner, so a FEATURES row lost its route
  (`/design-system` was run as a command). Fixed with the editor; prose with backticks goes through script files.
- **`?raw` CSS imports are empty under Vitest**, whose CSS handling returns nothing for stylesheets: the
  design-system test failed at first, reporting every listed token as unknown. Checking both directions (missing and
  unknown) is what made an empty file fail rather than pass; `css.include` now lets `tokens.css` through.
- **Importing `glimpse` from `SetPage`** into the Inbox would have pulled the card-set page into the Inbox's chunk;
  it moved to `review/glimpse.ts`.

## Unresolved issues

- Side panels as drawers in narrow windows (B-PL-09).
- The check of chat and generation against a real provider remains the user's (the screenshots use the test model).

## Next steps

The gate: the full Playwright suite, then merge `phase/20-polish` into `main` and start Phase 21 (verification).
