# Phase 2 — Application shell and layout system

**Status:** Complete (4 October 2026) · **Branch:** `phase/02-app-shell`

## Objective
A navigable, accessible application shell with the permanent sticky-header layout architecture,
design tokens with light/dark themes, core UI primitives, state components, keyboard shortcut registry,
command palette, and honest placeholder pages for every section.

## Why it exists
Every feature phase renders into this shell. Enforcing the sticky-header rule and the
loading/empty/error state patterns once, centrally, prevents per-page inconsistency.

## Dependencies
Phase 1.

## Atomic tasks

### Tokens and theme
- [x] **2.01** `tokens.css`: colour (surfaces, text, accent, semantic), radius, shadow, typography, motion and sidebar tokens for light and dark (AA contrast); mapped to Tailwind 4 utilities with `@theme inline`; `dark:` variant bound to `data-theme`
- [x] **2.02** Theme store (light / dark / system, persisted, follows OS changes) + `public/theme-init.js` applying the theme in `<head>` before React mounts (CSP-safe external script) — no flash, verified by E2E after reload; 4 unit tests

### Layout architecture
- [x] **2.03** `AppShell` (viewport-filling flex frame; collapsible sidebar with `Ctrl+\`, persisted; skip control; focus moves to the page title after navigation)
- [x] **2.04** `Page` (fixed header with breadcrumbs, title, description, actions and toolbar; body is the only scroll container; document title) — the sticky-header architecture
- [x] **2.05** `StickySection` for secondary headers inside the page body (sticky, labelled region)
- [x] **2.06** Sidebar for all 13 sections in Home/Knowledge/Learning/Assistant groups + Settings, active state (`aria-current`), tooltips and accessible names when collapsed, "Jump to…" palette button
- [x] **2.07** Routes for every section from `sections.ts` (single source of truth for sidebar, palette, router and E2E); unbuilt sections render honest placeholders naming their phase; not-found page inside the shell

### Components
- [x] **2.08** Primitives: Button (variants, sizes, loading, `asChild`), IconButton (required label + tooltip + shortcut), Input, Textarea, Kbd, Badge, Card, Separator, Spinner
- [x] **2.09** Radix-based: Dialog (required title), DropdownMenu, Tooltip, Tabs, Popover; usage notes in `apps/web/src/components/README.md`
- [x] **2.10** State components: EmptyState, ErrorState (retry + technical details), Skeleton, LoadingState; route-level error page (`defaultErrorComponent`); session gate (connecting / sign-in required / unreachable + retry)
- [x] **2.11** Toasts (sonner, themed) wired to failed mutations through the query client's `MutationCache`; `describeError` maps API errors to plain language; 4 unit tests

### Interaction
- [x] **2.12** Keyboard shortcut registry (canonical key strings, `mod` = Ctrl/⌘, input-awareness, most-recent-wins overrides, conflict detection, live cheat sheet via `?` and `Ctrl+/`); 11 unit tests
- [x] **2.13** Command palette (`Ctrl+K`, cmdk in a titled Radix dialogue): go to any section, theme commands, sidebar and shortcuts commands

### Pages
- [x] **2.14** Settings: Vault (name, location, identifier), Appearance (theme radio group), Keyboard, About (health, version, SQLite, migrations, uptime) — replaces the Phase 1 status page (TD-03 repaid)
- [x] **2.15** Today: greeting and British long date; four upcoming widgets each labelled with its delivering phase (no fake data); "Available now" section

### Accessibility
- [x] **2.16** Skip control, landmarks (`nav` "Main", `main`), one `h1` per page, visible focus styles, reduced-motion tokens, labelled icon buttons, focus management on navigation

### Tests
- [x] **2.17** Component/integration tests: `Page.test.tsx` (4: header outside the scroll container, title, one `h1`, `StickySection`), `App.test.tsx` (11: shell, placeholders, not-found, sidebar navigation + focus, session gate 401/unreachable, `Ctrl+K` navigation, `Ctrl+\` persistence, `?` cheat sheet, settings details, theme switching), plus registry, theme, format and notify units — 48 web tests in total
- [x] **2.18** E2E sticky-header test on all 14 routes (13 sections + not-found) and a sticky-section test — mutation-tested (a header moved into the scroll container fails the check)
- [x] **2.19** E2E: palette navigation, sidebar collapse persistence across reload, theme before render after reload, skip control, cheat sheet open/close, no console errors on any route
- [x] **2.20** E2E axe scans (WCAG 2.0–2.2 A/AA tags) of every route in light and dark themes, open dialogues and the collapsed sidebar: zero serious/critical violations; harness mutation-tested and fixed to check below-the-fold contrast (viewport grown to fit the page body)

### Documentation
- [x] **2.21** `ui.md` §2 enforcement + exceptions (none in code yet) and §7 automated checks; component README; FEATURES/STATE/journal/backlog updated

## Tests
Totals at the gate: **169 Vitest tests** (core 14, server 107, web 48) and **56 Playwright tests**
(foundation 5; shell 51: sticky 15, navigation/keyboard 6, accessibility 30), bundle smoke test — all green.

## Acceptance criteria
- [x] Every route uses `Page`; scrolling never moves a page header (automated, all routes).
- [x] Keyboard-only navigation reaches every section and the palette (skip control, sidebar links, `Ctrl+K`, `?`).
- [x] No serious/critical axe violations (both themes, whole page).
- [x] Placeholders state which phase delivers each area; no fake data.

## Documentation requirements
Component usage notes in `apps/web/src/components/README.md`; `ui.md` updated — done.

## Gate
- [x] All tasks `[x]`
- [x] `npm run verify` and `npm run test:e2e` green
- [x] STATE.md, FEATURES.md, journal updated
- [x] Merged into `main` with `--no-ff`

## Recommended commit messages
```text
feat(web): add design tokens and light/dark theme provider
feat(web): add app shell with sticky page header architecture
feat(web): add UI primitives, state components and toasts
feat(web): add keyboard shortcut registry and command palette
test(e2e): enforce sticky headers and accessibility across all routes
```
