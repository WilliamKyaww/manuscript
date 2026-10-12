# Phase 24 — Appearance: Simplified UI and colour palettes

**Status:** In progress · **Branch:** `phase/24-appearance`

## Objective
From the student's request of 12 October: a quieter, more minimal interface in the spirit of Obsidian that stays
recognisably Manuscript — a **Simplified UI** setting (on by default) that softens the chrome without removing a
single feature, an Obsidian-like file tree on the Notes page when it is on, and **colour palettes** for light and
dark, all remembered. Done with Impeccable (`apps/web/PRODUCT.md`), as a refinement of the existing design system.

## Dependencies
Phase 23 (1.1.0). Decisions: ADR-0043. Confirmed with the student: today's colours stay the default ("Manuscript");
with Simplified UI on, the Notes page's title row folds into the tab row and the file tree shows no icons.

## Atomic tasks
- [ ] **24.01** Appearance preferences: palette and Simplified UI in one store, applied as `data-palette` and
  `data-ui` on the document before the first paint (`theme-init.js`), remembered; Simplified UI on unless turned off.
- [ ] **24.02** Palettes as token overrides (no duplicated stylesheets): Manuscript (today's), Graphite, Sand, Slate,
  Sage and Iris, each for light and dark; every text, accent and focus pairing checked for WCAG AA by a test.
- [ ] **24.03** Simplified UI chrome: dividers judged one by one (gone where a change of surface already separates,
  softened where they carry structure), pane headers on the pane's own surface, a quieter tab strip, view toggles
  and sidebar; save status and word count in a corner of the note, as in Obsidian.
- [ ] **24.04** Notes page, simplified: the title row folds into the tab row (the title stays for screen readers);
  an icon-free, compact file tree with indent guides, file-type tags for attachments and full names on hover.
- [ ] **24.05** Settings → Appearance: Theme, Palette (with previews of both modes) and the Simplified UI switch.
- [ ] **24.06** Everything that reads colours follows the palette: the desktop title bar's buttons, the graph canvas,
  the editor's caret.
- [ ] **24.07** Tests and documentation: unit (store, boot script, contrast of every palette), component (settings,
  tree, Notes page in both modes), end to end (both modes, every palette in both themes under axe, persistence);
  screenshots reviewed; guides, `ui.md`, FEATURES, STATE, CHANGELOG, journal; DESIGN.md recorded.
- [ ] **24.08** Release 1.2.0: verify, end-to-end suite, merge, installer.

## Gate
- [ ] All tasks `[x]` · [ ] `npm run verify` · [ ] `npm run test:e2e` · [ ] merged into `main`

## Recommended commit messages
```text
feat(appearance): Simplified UI and colour palettes
chore(release): v1.2.0
```
