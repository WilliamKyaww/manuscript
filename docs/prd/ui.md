# User interface

> PRD v0.1 — 4 October 2026. Functional first (Phases 2–19); the visual polish pass is Phase 20.

## 1. Principles

Clean, calm, fast, information-dense without clutter, keyboard-first, accessible (WCAG 2.2 AA target),
suitable for long sessions (comfortable type, low-glare dark theme, no attention-grabbing motion).
One coherent design system with its own identity — inspired by, not copied from, Notion, Obsidian,
NotebookLM and Quizlet.

## 2. Layout architecture and the sticky-header rule (permanent requirement)

> **When scrolling any page, header sections remain fixed and do not scroll away, unless a specific
> component has a documented UX reason.**

This is enforced by architecture, not by per-page CSS:

```text
<AppShell>                          CSS grid: [sidebar | main], height 100dvh, overflow hidden
  <Sidebar/>                        own scroll container
  <Page>                            flex column, min-height 0
    <PageHeader/>                   flex: none — OUTSIDE the scroll container (cannot scroll away)
    <PageBody>                      flex: 1; overflow: auto — the only scroll container
      <StickySection header=…/>     secondary headers (tables, lists, groups): position: sticky; top: 0
    </PageBody>
  </Page>
</AppShell>
```

Rules:
1. **Every route renders `<Page>`**; no route may introduce its own top-level scroll container.
2. The page header holds title, breadcrumbs, primary actions and tabs/filters for the page.
3. Secondary headers inside the body use `<StickySection>` (sticky within `PageBody`).
4. Split views (editor | preview | side panel) use `<Page layout="panes">` with `<Pane>`s: the page
   body no longer scrolls, and each pane has its own fixed header above its own scroll container
   (implemented in Phase 3 for the Notes section — the editor's scroller is CodeMirror's own — and in
   Phase 5 for the source viewer, whose thumbnails, pages and contents are panes; `e2e/library.spec.ts`
   checks that the page and pane headers stay put while the pages scroll).
5. **Enforcement (implemented in Phase 2):** `e2e/shell.spec.ts` visits every route in
   `apps/web/src/app/sections.ts` plus the question bank, diagnostics, the design system and the
   not-found page, pads the body to force scrolling, scrolls
   `PageBody` to the bottom and asserts that exactly one page header exists, its position is unchanged,
   it and the `h1` stay in the viewport, and the window itself never scrolls. A second E2E test checks
   that `StickySection` headers stick to the top of the body; `Page.test.tsx` checks the structure.
   The check was mutation-tested: moving the header into the scroll container makes it fail.
   For paned pages (Phase 3) it scrolls every pane's body (or the scroller inside it, such as Chat's
   message log, which leaves the message box pinned) and asserts each pane header stays put;
   `e2e/notes.spec.ts` does the same with a long note in the editor.
6. **Documented exceptions** (must be listed here):
   - None. *Focus mode* in a review session (Phase 8) was planned as one, but it keeps the header and
     only hides the description, actions and secondary buttons. **There are currently no exceptions
     in the code.**

## 3. Information architecture

Sidebar (collapsible, `Ctrl+\`; since 1.1 it starts collapsed, and the open sidebar is 13.5 rem wide and
can be dragged by its edge between 12 and 22 rem, remembered, double-click to reset — task 23.01):

| Section | Route | Contents |
|---|---|---|
| Today | `/` | Due reviews, plan for today, upcoming deadlines, weak areas, recent items |
| Notes | `/notes` | Files pane (toolbar, sort orders, bookmarks, tree, the open vault), notes in tabs and up to two panes, the Details panel for the active note (outline, backlinks, outgoing links, properties, local graph — closed by default) — §11 |
| Library | `/library` | Sources by module/lecture; import; viewer |
| Modules | `/modules` | Modules → lectures, topics, assessments, mastery, mark calculator |
| Concepts | `/concepts` | Concept index and concept pages |
| Graph | `/graph` | Global knowledge graph |
| Review | `/review` | Flashcard sets, due queue, review sessions |
| Practice | `/practice` | Learn, quizzes and mock exams; `/practice/questions` the question bank; `/practice/attempts/$id` taking a quiz or exam and its results; `/practice/learn/$id` a Learn session |
| Progress | `/progress` | Readiness, mastery and coverage by course, module, topic and concept with their components; weak areas (Phase 9); retention and calibration (Phase 14) |
| Plan | `/plan` | Study plan calendar/timeline |
| Chat | `/chat`, `/chat/$threadId` | Conversations (search, rename, delete) and the open one: answers with citations, activity rows, approval and result cards, the composer with mode, scope and @mentions (Phase 13) |
| Inbox | `/inbox` | AI proposals awaiting decision (concepts, links, cards, edits) |
| Settings | `/settings` | Vault, AI providers, study preferences, permissions, appearance, data |

Global: command palette (`Ctrl+K`), quick switcher (`Ctrl+O`), search (`Ctrl+Shift+F`), quick-add
card (`Ctrl+Shift+A`), chat side panel (`Ctrl+J`, docked beside the page; closes with `Esc`) available on every page with the page as context.

## 4. Key screens (functional requirements)

| Screen | Must show / allow |
|---|---|
| Today | Reviews due (count, estimated minutes, start), today's plan items with reasons, deadlines (7 days), weak concepts with actions, progress towards 85 % |
| Note editor | CodeMirror editor, preview/split toggle, frontmatter property panel, backlinks + unlinked mentions, outline, local graph, "make card from selection" |
| Source viewer | PDF/slide view, page thumbnails, selection actions, derived artefacts per page, citations jump here |
| Module page | Lectures timeline, topics/concepts with mastery, assessments with weights/dates, mark calculator, readiness |
| Concept page | Summary, backing note, sources with locators, relations by type, cards/questions, mastery components |
| Graph | Canvas, legend, filters, side panel, search-to-focus, mastery overlay toggle |
| Review session | Card, reveal, ratings with intervals, progress, undo, edit, source |
| Quiz / practice | Question, answer input by kind, hint (marks the answer helped), confidence, feedback with per-option reasons, explanation, source link, self-grading (missed / partly / got it), progress |
| Mock exam | Every question on one page, clock, draft saved as you go, submit (automatic when time runs out), results with self-grading |
| Learn session | The question the engine chose, its rung (recognise / recall / explain), feedback, concepts in the session with their level and whether secure |
| Chat | Threads list, messages with citations, activity rows, approval cards, result cards, mode + scope pickers, `@mentions` |
| Inbox | Grouped proposals with evidence, accept/edit/reject, bulk actions |
| Settings | Sections listed in §3 |

## 5. States

Every data view implements **loading** (skeletons that match the final layout), **empty** (what this is,
why it is empty, the primary action), **error** (plain-language message, retry, details disclosure) and
**partial** (e.g. source still processing, with progress). Not-yet-implemented areas say so honestly
("Arrives in Phase 8") rather than showing fake data.

Inside a card, widget or panel a failed request shows `InlineError` (one line and *Try again*) — never a
blank, and never a zero or "nothing due" standing in for an answer that did not arrive (Phase 20). A
chart with nothing to plot says why instead of showing a row of empty bars. Optional extras that add to
a page (related notes, AI usage, "before what's next") may simply stay hidden when they fail.

## 6. Keyboard model

Shortcut registry with scopes (global, page, editor, session) and a cheat sheet (`?` / `Ctrl+/`).
Everything reachable by keyboard; visible focus; no shortcut conflicts with the editor's defaults.

The cheat sheet has two parts (Phase 20): **Everywhere**, from the registry, and **On a page**, from
`apps/web/src/app/shortcuts/reference.ts` — the keys handled where they apply (editor, notes list, review
session, practice, chat, quick switcher, dialogues), listed wherever the sheet is opened. A key handled
in a component must be added there. The review session's keys live in `session/keys.ts`, used by both.

## 7. Accessibility

Landmarks and a skip control ("Skip to main content", first in tab order); Radix primitives for
dialogues/menus/popovers; colour never the only signal (graph confidence styles also use dash patterns;
mastery uses labels); contrast ≥ 4.5:1 for text; reduced-motion support; screen-reader labels for icon
buttons; focus moves to the page heading after client-side navigation.

Automated checks (Phase 2 baseline, full audit Phase 21): axe (WCAG 2.0–2.2 A/AA tags) on every route
in both themes, on open dialogues and on the collapsed sidebar; no serious or critical violations are
allowed. axe only evaluates colour contrast for elements inside the viewport, so the tests first grow the
viewport to fit the whole page body — otherwise anything below the fold would be silently skipped.

## 8. Design tokens (functional baseline in Phase 2)

CSS custom properties for colour (surface, text, border, accent, semantic success/warning/danger,
mastery stages, confidence styles), spacing scale (4 px base), radius, typography (UI sans, reading
serif optional, mono for code), elevation, motion durations. Light, dark and system themes from Phase 2.
The polish phase changes token *values* and component details, not the layout architecture.

**Visual direction (Phase 20).** Calm and paper-like, so that the material is the loudest thing on
screen: warm neutral surfaces (a cream page, white cards, sunken wells), near-black warm text in three
strengths that all meet AA on every surface, and **one** green accent for primary actions, links, focus
and selection. Status colours appear only as small badges and banners on their subtle backgrounds.
Segoe UI Variable on Windows (the system font elsewhere) at a compact scale — page titles `text-xl`
semibold, section titles `text-sm` semibold, body `text-sm`, notes `text-base` — with Cascadia for code.
Three radii, three shadows, used sparingly. The dark theme keeps the same roles at lower luminance.

The values live in `apps/web/src/styles/tokens.css`; **`/design-system`** (Settings › About) shows
every token with its resolved value in the current theme and every shared component live, and a test
fails if a token is not listed there. Component conventions: one primary button per view; `link` for a
way to another page among buttons; `danger-outline` for Delete in a header, with the solid `danger`
only on the confirming button of `ConfirmDialog`; `eyebrow` for the small upper-case labels in panels;
icon tabs (name on the selected tab) in narrow panels.

**Motion.** Hover and state changes use `--skb-duration-fast` (120 ms); dialogues fade and rise, menus and
popovers fade in, over `--skb-duration-normal` (200 ms). Both are 0 ms under `prefers-reduced-motion`,
and spinners and skeleton pulses stop. `e2e/shell.spec.ts` checks a dialogue's animation both ways; the
other end-to-end tests run with reduced motion so that axe never measures a half-faded dialogue.

## 9. Responsive behaviour

Primary target: laptop/desktop (≥ 1280 px). Usable down to 768 px (sidebar collapses to icons, side
panels become drawers). Phone layouts are best-effort (review and quiz sessions should work).

As built (Phase 20): below 1024 px the sidebar is the rail of icons whatever was chosen for wide
windows (opening it there lasts until the window widens and is not remembered); a page header's actions
move below the title rather than cut it short; narrow panels use icon tabs. Side panels (a note's
details, the graph's insights) stay **resizable panes** rather than drawers — usable at 768 px, and the
drawers are in the backlog (B-PL-09). `e2e/shell.spec.ts` checks every route at 800 px: the rail, and no
page wider than the window.

## 10. Final polish phase (Phase 20) scope

Every screen in §4 reviewed for spacing, typography, iconography, component states, empty/loading/error
states, responsive behaviour, keyboard shortcuts, accessibility, micro-interactions, and consistency;
editor live-preview decorations; graph styling; a design-system page documenting components.

The review was done from screenshots of every screen with realistic content in both themes and at
768 px (`e2e/screens.spec.ts`, run with `SKB_SCREENSHOTS=<folder>`); what it found and changed is listed
in `docs/checklist/phase-20-polish.md` and the 10 October journal.

## 11. The notes workspace (Phase 23, ADR-0042)

The Notes page follows Obsidian's layout and words, so that a student who knows one knows the other:

```text
<Page density="compact">  title = the active note; actions: Details toggle, New note
  Files pane              toolbar (new note, new folder, sort, attachments, Expand/Collapse all, trash)
                          · Bookmarks · tree (right-click: the file menu) · vault switcher (footer)
  Editor panes (1 or 2)   each: tab bar (+, ×, middle click, drag to reorder, tab menu)
                          · the active tab's note: breadcrumb, status, study tools, view toggles, ⋮
  Details (optional)      Outline · Backlinks · Outgoing · Properties · Graph, for the active pane's note
```

- **Menus are data** (`components/MenuEntries.tsx`): the ⋮ menu and the file tree's right-click menu are
  built by `features/notes/menus/file-menu.tsx` from the same actions (`useFileActions`), so one file's
  commands read the same in both. Items a browser cannot do stay listed, disabled, with *Desktop app* beside
  them. Long menus scroll within the window.
- **Tabs and panes are browser state** (`workspace/workspace-store.ts`); the address always shows the
  active tab's note (`workspace/route-sync.ts`). A pop-out window (`?window=note`) has no sidebar or Files
  pane and does not change the main window's tabs.
- **Narrow panes** keep the note's name: the breadcrumb's folders give way first, the save status becomes
  screen-reader-only, the three study buttons fold into one menu and the view toggles show icons only
  (container queries on the pane).
- **The desktop title bar** (task 23.10) is a 32-pixel strip drawn by the page (`app/TitleBar.tsx`) above the
  shell, with the window's own buttons over its right end; nothing interactive sits in it.

## 12. Appearance: palettes and Simplified UI (Phase 24, ADR-0043)

- **Three attributes on `<html>`:** `data-theme` (light, dark), `data-palette` (manuscript — the default and the
  original look — graphite, sand, slate, sage, iris) and `data-ui` (simplified — the default — or standard), set by
  `public/theme-init.js` before the first paint and kept in step by `app/theme/appearance.ts`.
- **Palettes override neutrals and the accent only**, per theme, in `tokens.css`; meaning-bearing colours (status,
  mastery, graph) are the same in every palette. `features/design/palettes.test.ts` checks every text, accent,
  button and focus pairing for WCAG AA; `e2e/appearance.spec.ts` runs axe on Notes and Today in every palette and
  theme.
- **Chrome tokens** draw the frame: `--skb-chrome-line` (header and strip lines; none when simplified),
  `--skb-divider` (between resizable panes and beside the sidebar; fainter when simplified), `--skb-pane-header-bg`
  (pane headers on their own surface when simplified) and `--skb-active-line`. New components draw their frame with
  these (`border-chrome-line`, `bg-divider`, `bg-pane-header`) so they follow the setting.
- **`simplified:` is a Tailwind variant** for the few styles that differ (the file tree's rows, the note status chip,
  the view switch's frame). Structure differs in one place only: the Notes page folds its title row into the tab row
  (`Page headerHidden`; the h1 stays for screen readers and focus). Both modes offer the same controls — an
  end-to-end test compares them.
