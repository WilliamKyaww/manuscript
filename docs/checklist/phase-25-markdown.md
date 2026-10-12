# Phase 25 — Markdown as Obsidian writes it

**Status:** Complete · **Branch:** `phase/25-markdown`

## Objective
From the student's request of 12 October (two screenshots, Manuscript and Obsidian side by side): implement every
Markdown feature Obsidian has, comprehensively, so that a note looks in Manuscript's editor and reading view as it does
in Obsidian. The screenshots showed the gap: tables as raw pipes, list items as raw `- `, no bullets, no indentation.

## Dependencies
Phase 24 (1.2.1). Decisions: ADR-0044. Research: Obsidian's own help pages on basic and advanced formatting syntax,
callouts, internal links, embeds, tags, properties and Mermaid, checked against what was already supported.

## Atomic tasks
- [x] **25.01** Research the Obsidian dialect and list what was missing: lists and tasks, tables, callouts' types,
  aliases and icons, highlight colours, inline footnotes, block ids, nested heading links, image sizes, PDF page and
  height, non-strict line breaks. — recorded in the journal.
- [x] **25.02** One definition of callouts in `@skb/core` (`callouts.ts`): the thirteen types, their aliases, the
  parsing of `[!type]+/- Title`, labels; used by the editor and the reading view. — `callouts.test.ts`.
- [x] **25.03** Live preview draws lists (bullets, numbers, indentation, hanging lines), tasks (clickable boxes, any
  status character, done tasks struck), quotes, callouts (colour, icon, title), rules, code blocks. —
  `editor/live-preview.ts`, `editor/live/*`; `live-rules.test.ts`.
- [x] **25.04** Live preview draws tables (alignment, inline formatting, wikilinks; click to edit the source) and
  display maths from a state field, and inline maths, images embedded with `![[…]]`, highlights with colour,
  footnote marks, block ids and comments. — `editor/live/blocks.ts`, `inline-render.ts`, `math.ts`.
- [x] **25.05** Reading view: callout aliases and icons, highlight colours, inline footnotes, custom task statuses,
  block ids (hidden, linkable), nested heading links, `![alt|300x200](img)`, PDF `#page=3&height=400`. —
  `remark-obsidian.ts`, `rehype-plugins.ts`, `FileEmbed.tsx`, `preview.css`; `markdown-features.test.tsx`.
- [x] **25.06** Obsidian's line breaks: a single line break is a line break in the reading view, with *Strict line
  breaks* in Settings → Appearance for standard Markdown. — `remarkSoftBreaks`, `notes-store.ts`.
- [x] **25.07** Tests: unit (callouts, scan, table parsing, inline rendering, live-preview rules, reading view),
  component, end to end (`e2e/markdown.spec.ts`: table, bullets, tasks, callout and maths in the editor; a ticked box
  written to the file; line breaks and the setting). Screenshots reviewed in both views.
- [x] **25.08** Documentation: `docs/guide/markdown.md` (dialect table, live preview, differences from Obsidian),
  `docs/guide/appearance.md`, FEATURES, STATE, CHANGELOG, ADR-0044, journal.
- [x] **25.09** Release 1.3.0: verify, end-to-end suite, merge, tag, installer. — `npm run verify` (162 files, 1,002
  tests, smoke test on 1.3.0) and the whole Playwright suite on 12 October: 146 passed, 3 skipped, 2 failed. One was a
  selector made ambiguous by this phase (UC-01 found the editor's maths widget in the hidden editor; now scoped to the
  reading view); the other (the PDF export menu item, 30 s timeout under load) passed twice on its own and in its
  whole spec file again. Both were rerun green; the suite was not rerun in full.

## Known limits (recorded, not hidden)
- A table is edited as its source (click it); there is no cell-by-cell editing. A table inside a quote or a list is
  left as source.
- Callouts do not fold in the editor, and a task's box cannot be ticked in the reading view.
- Markdown images `![](path)` and embedded notes are drawn in the reading view only.
- `[[Note#^block]]` scrolls to the block in the reading view; the editor opens the note at the top.

## Gate
- [x] All tasks `[x]` · [x] `npm run verify` · [x] `npm run test:e2e` · [x] merged into `main`

## Recommended commit messages
```text
feat(markdown): Obsidian's Markdown in the editor and the reading view
chore(release): v1.3.0
```
