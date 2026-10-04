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
4. Split views (editor | preview | side panel) give each pane its own sticky pane header.
5. **Enforcement (implemented in Phase 2):** `e2e/shell.spec.ts` visits every route in
   `apps/web/src/app/sections.ts` plus the not-found page, pads the body to force scrolling, scrolls
   `PageBody` to the bottom and asserts that exactly one page header exists, its position is unchanged,
   it and the `h1` stay in the viewport, and the window itself never scrolls. A second E2E test checks
   that `StickySection` headers stick to the top of the body; `Page.test.tsx` checks the structure.
   The check was mutation-tested: moving the header into the scroll container makes it fail.
6. **Documented exceptions** (must be listed here):
   - *Focus mode* in a review session may collapse the header to a slim progress bar (user-toggled) —
     planned for Phase 8; not implemented yet. **There are currently no exceptions in the code.**

## 3. Information architecture

Sidebar (collapsible, `Ctrl+\`):

| Section | Route | Contents |
|---|---|---|
| Today | `/` | Due reviews, plan for today, upcoming deadlines, weak areas, recent items |
| Notes | `/notes` | Folder tree, note editor/preview, backlinks, local graph |
| Library | `/library` | Sources by module/lecture; import; viewer |
| Modules | `/modules` | Modules → lectures, topics, assessments, mastery, mark calculator |
| Concepts | `/concepts` | Concept index and concept pages |
| Graph | `/graph` | Global knowledge graph |
| Review | `/review` | Flashcard sets, due queue, review sessions |
| Practice | `/practice` | Quizzes, mock exams, adaptive sessions, results |
| Progress | `/progress` | Mastery, retention, coverage, calibration |
| Plan | `/plan` | Study plan calendar/timeline |
| Chat | `/chat` | Agent and tutor threads |
| Inbox | `/inbox` | AI proposals awaiting decision (concepts, links, cards, edits) |
| Settings | `/settings` | Vault, AI providers, study preferences, permissions, appearance, data |

Global: command palette (`Ctrl+K`), quick switcher (`Ctrl+O`), search (`Ctrl+Shift+F`), quick-add
card (`Ctrl+Shift+A`), chat side panel (`Ctrl+J`) available on every page with the page as context.

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
| Quiz / practice | Question, answer input by kind, feedback, explanation, source link, progress |
| Chat | Threads list, messages with citations, activity rows, approval cards, result cards, mode + scope pickers, `@mentions` |
| Inbox | Grouped proposals with evidence, accept/edit/reject, bulk actions |
| Settings | Sections listed in §3 |

## 5. States

Every data view implements **loading** (skeletons that match the final layout), **empty** (what this is,
why it is empty, the primary action), **error** (plain-language message, retry, details disclosure) and
**partial** (e.g. source still processing, with progress). Not-yet-implemented areas say so honestly
("Arrives in Phase 8") rather than showing fake data.

## 6. Keyboard model

Shortcut registry with scopes (global, page, editor, session) and a cheat sheet (`?` / `Ctrl+/`).
Everything reachable by keyboard; visible focus; no shortcut conflicts with the editor's defaults.

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

## 9. Responsive behaviour

Primary target: laptop/desktop (≥ 1280 px). Usable down to 768 px (sidebar collapses to icons, side
panels become drawers). Phone layouts are best-effort (review and quiz sessions should work).

## 10. Final polish phase (Phase 20) scope

Every screen in §4 reviewed for spacing, typography, iconography, component states, empty/loading/error
states, responsive behaviour, keyboard shortcuts, accessibility, micro-interactions, and consistency;
editor live-preview decorations; graph styling; a design-system page documenting components.
