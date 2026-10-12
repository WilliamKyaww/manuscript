# 12 October 2026 — Claude Sonnet 5.5

- **Date:** Monday 12 October 2026, afternoon
- **Model:** Claude Sonnet 5.5
- **Phase:** 25 — Markdown as Obsidian writes it (`phase/25-markdown`), after 1.2.1
- **Summary:** The student sent two screenshots — Manuscript's editor beside Obsidian's — and asked for every
  Markdown feature Obsidian has. The editor now draws tables, lists with bullets and indentation, task lists with
  clickable boxes, callouts with icons, quotes, rules and maths; the reading view gained highlight colours, inline
  footnotes, block ids, all callout aliases, nested heading links, image and PDF sizes and Obsidian's line breaks.
  Version 1.3.0.

## What was asked

"Please comprehensively search the web for all markdown features and implement them here." Screenshot 1 (Manuscript)
showed a table as raw pipes, list items as raw `- ` with no bullets or indentation; screenshot 2 (Obsidian) showed the
same note drawn. No question was put back: the request was clear and the fixed constraints (the file stays canonical,
no HTML injection, works without AI) decided the approach.

## Research

Obsidian's help pages (basic formatting syntax, advanced formatting syntax, callouts, internal links, embeds, tags,
properties) were compared with `docs/guide/markdown.md` §1. What was already there: GFM, wikilinks, embeds, tags,
callouts (a few types), highlights, comments, maths, Mermaid. What was missing or wrong:

- in the **editor**: tables, lists (bullets, numbers, indentation), tasks, callouts' look, rules, code blocks, maths,
  images, footnotes, block ids;
- in the **reading view**: callout aliases and icons, highlight colours (🔴🟠🟡🟢🔵🟣), inline footnotes `^[…]`, block
  ids, task statuses other than `x`, nested heading links, `![alt|300x200](…)`, PDF `#page=3&height=400`, and the
  default of **non-strict line breaks**.

## What was done

- **`@skb/core`**: `markdown/callouts.ts` — the thirteen types, aliases, fold marks, labels; `splitFragment` takes the
  last `#` segment of a nested heading link.
- **Editor** (`features/notes/editor/`): `live-preview.ts` rewritten to draw lists, tasks, quotes, callouts, rules and
  code blocks from the syntax tree, plus per-line scanning (`live/lines.ts`) for highlights, wikilinks, images, maths,
  footnotes and block ids; `live/blocks.ts` — tables and display maths from a **state field** (a plugin may not
  replace across line breaks), source back when the selection touches the block; `live/inline-render.ts` builds
  table cells as DOM nodes (nothing injected); `live/widgets.ts`, `live/math.ts` (KaTeX loaded lazily),
  `live/theme.ts`; `live/context.ts` resolves `![[image]]` through the note's attachments.
- **Reading view**: `remark-obsidian.ts` (callouts, highlight colours, inline footnotes numbered after the ordinary
  ones, task statuses, block ids, image sizes, `remarkSoftBreaks`), `rehype-plugins.ts` (allow-lists extended,
  block-id anchors), `FileEmbed.tsx` (PDF page and height), `preview.css` and generated `callout-icons.css`
  (lucide icon data as masks, so no icon font and no network).
- **Preference**: `strictLineBreaks` in the notes store; a switch in Settings → Appearance.
- **Release**: version 1.3.0 in the five `package.json` files and the lock file.

## Decisions

ADR-0044: blocks are drawn in the editor from the file's text on every change; callouts are defined once in core; the
reading view follows Obsidian's line breaks unless *Strict line breaks* is on. The last changes how existing notes look
in the reading view, so it is the first thing in the release notes.

## Tests

- Unit and component: core 248 tests (callouts, nested heading links); web 282 (live-preview rules incl. checkbox
  toggling, table parsing, inline rendering without HTML injection, 15 reading-view tests).
- End to end: `e2e/markdown.spec.ts` (2 tests) — table, bullets, task boxes, callout and maths in the editor, a ticked
  box written to the file, line breaks and the setting.
- `npm run verify`: typecheck, Biome, 162 test files / 1,002 tests, build and smoke test on 1.3.0 — all green.
- Whole Playwright suite: 146 passed, 3 skipped, 2 failed. UC-01 failed because the editor, hidden in the reading
  view, now holds a KaTeX widget and `.katex` matched it first — a real consequence of this phase, fixed by scoping
  the selectors to `.markdown-body`. The workspace test for *Export to PDF…* timed out at 30 s in the full run and
  passed alone and again in its spec file (1.8 s); nothing in this phase touches that menu, so it is recorded as a
  load-related flake, not explained further. The full suite was not run a second time.
- Screenshots of the editor and the reading view reviewed (a temporary capture spec, deleted); two defects found and
  fixed from them — the callout icon touching a written title, and the `[?]` task badge's text out of line with a
  checkbox's.

## Problems

- Shell here-documents collapsed a backslash in a test again (`'\n'` became a real line break); fixed with the editor
  tools, as AGENTS.md advises.
- The router encodes `^` in a block link's address (`%5E`) and decodes it before looking for the element; the test
  compares the decoded address.
- Reading-view tests need to wait for the router to mount the page before querying it.

## Unresolved

Recorded as backlog B-KM-26 to B-KM-29: cell-by-cell table editing, folding callouts in the editor and ticking tasks in
the reading view, drawing Markdown images and embedded notes in the editor, scrolling the editor to a block.

## Next steps

Install 1.3.0 over the installed application, use it on real notes, and report what looks different from Obsidian.
