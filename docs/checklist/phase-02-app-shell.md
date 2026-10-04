# Phase 2 — Application shell and layout system

**Status:** Not started · **Branch:** `phase/02-app-shell`

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
- [ ] **2.01** `tokens.css`: colour, spacing, radius, typography, elevation and motion tokens for light and dark; Tailwind 4 theme mapped to tokens
- [ ] **2.02** Theme provider (light / dark / system), persisted, no flash of the wrong theme on load

### Layout architecture
- [ ] **2.03** `AppShell` (grid: sidebar | main; `100dvh`; collapsible sidebar with `Ctrl+\`; state persisted)
- [ ] **2.04** `Page`, `PageHeader`, `PageBody` implementing the header-outside-scroll-container rule (`ui.md` §2)
- [ ] **2.05** `StickySection` for secondary headers inside `PageBody`
- [ ] **2.06** Sidebar navigation for all sections (Today, Notes, Library, Modules, Concepts, Graph, Review, Practice, Progress, Plan, Chat, Inbox, Settings) with active state and keyboard focus
- [ ] **2.07** Routes for every section rendering `Page` with honest placeholders naming the delivering phase

### Components
- [ ] **2.08** Primitives: Button, IconButton, Input, Textarea, Kbd, Badge, Card, Separator, Spinner
- [ ] **2.09** Radix-based: Dialog, DropdownMenu, Tooltip, Tabs, Popover
- [ ] **2.10** State components: EmptyState, ErrorState (retry + details), Skeleton, route-level error boundary
- [ ] **2.11** Toasts (sonner) wired to API error normalisation

### Interaction
- [ ] **2.12** Keyboard shortcut registry (scopes, conflict detection) and cheat-sheet dialogue (`?`, `Ctrl+/`)
- [ ] **2.13** Command palette (`Ctrl+K`, cmdk) with navigation, theme and sidebar commands

### Pages
- [ ] **2.14** Settings skeleton: vault (path, id), appearance (theme), about (versions)
- [ ] **2.15** Today page skeleton: server status, honest placeholders for later widgets

### Accessibility
- [ ] **2.16** Skip link, landmarks, visible focus styles, reduced-motion handling, labelled icon buttons

### Tests
- [ ] **2.17** Component tests: Page/PageHeader/StickySection, theme provider, shortcut registry, command palette
- [ ] **2.18** E2E: sticky-header test across every route (scroll body to bottom; header unchanged and visible)
- [ ] **2.19** E2E: command-palette navigation, sidebar collapse, theme switch persistence
- [ ] **2.20** E2E: axe scan of every route with zero serious or critical violations

### Documentation
- [ ] **2.21** `ui.md` exceptions list confirmed; FEATURES/STATE/journal updated

## Tests
See 2.17–2.20.

## Acceptance criteria
- Every route uses `Page`; scrolling never moves a page header (automated).
- Keyboard-only navigation reaches every section and the palette.
- No serious/critical axe violations.
- Placeholders state which phase delivers each area; no fake data.

## Documentation requirements
Component usage notes in `apps/web/src/components/README.md`; `ui.md` updated if the architecture
changes.

## Gate
- [ ] All tasks `[x]`
- [ ] `npm run verify` and `npm run test:e2e` green
- [ ] STATE.md, FEATURES.md, journal updated
- [ ] Merged into `main` with `--no-ff`

## Recommended commit messages
```text
feat(web): add design tokens and light/dark theme provider
feat(web): add app shell with sticky page header architecture
feat(web): add UI primitives, state components and toasts
feat(web): add keyboard shortcut registry and command palette
test(e2e): enforce sticky headers and accessibility across all routes
```
