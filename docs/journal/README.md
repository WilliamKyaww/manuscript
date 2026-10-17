# Engineering journal

Useful engineering history — not a diary.

## Conventions

- One file per day per agent model: `YYYY-MM-DD-<model-slug>.md`, e.g. `2026-10-04-claude-opus-5.5.md`.
  If several sessions happen on the same day with the same model, append a new `## Session N` section.
- Title: `# <D Month YYYY> — <Model name>`, e.g. `# 4 October 2026 — Claude Opus 5.5`.
- Header block at the top of each entry/session: **Date**, **Time**, **Agent model**, **Phase**,
  **Work performed** (one line).
- Then: What was done · Important decisions · Files changed · Tests run (commands and results) ·
  Problems encountered · Unresolved issues · Next steps.
- Record facts (commands, results, evidence). Link ADRs and checklist task IDs.

## Entries

| Date | Model | Phase | Summary |
|---|---|---|---|
| [17 October 2026](./2026-10-17-claude-sonnet-5.5.md) | Claude Sonnet 5.5 | 28 | Phase 28 hardening: JSON and sheet fidelity, converter process tree and queue, stacked-pane layout bug, lazy sheet parsing, full E2E, candidate installer |
| [17 October 2026](./2026-10-17-gpt-6-astra.md) | GPT-6 Astra | 28 | User-requested checkpoint: verified file previews, LibreOffice layouts, remaining hardening and Claude relay |
| [16 October 2026](./2026-10-16-gpt-6-astra.md) | GPT-6 Astra | 27 | Confirmed installer identity/hash and documented the older installed-build mismatch |
| [15 October 2026](./2026-10-15-gpt-6-astra.md) | GPT-6 Astra | 27 | Windows embedded WebView2 integration; user-confirmed ScienceDirect article access and native regression checks |
| [14 October 2026](./2026-10-14-gpt-6-astra.md) | GPT-6 Astra | 27 | User-reported ScienceDirect verification loop; fresh-profile checkbox observation and remaining diagnosis |
| [13 October 2026](./2026-10-13-gpt-6-astra.md) | GPT-6 Astra | 27 | Browser placement review, ScienceDirect diagnosis, browsing feedback and Claude handover; verification tracked in the phase checklist |
| [4 October 2026](./2026-10-04-claude-opus-5.5.md) | Claude Opus 5.5 | 0, 1, 2 | Research, PRD, ADRs, roadmap (Phase 0); foundation and Electron spike (Phase 1); application shell (Phase 2) |
| [7 October 2026](./2026-10-07-claude-opus-5.5.md) | Claude Opus 5.5 | 3 | Markdown core, notes index and watcher, notes API, editor/preview/tree UI, code splitting, E2E, Obsidian and performance checks |
| [8 October 2026](./2026-10-08-claude-opus-5.5.md) | Claude Opus 5.5 | 3, —, 4 | `.skb` rebuild test, Markdown guide, ADR-0025/0026, Phase 3 merge; renamed the project to Manuscript (ADR-0027); Phase 4 search and quick switcher |
