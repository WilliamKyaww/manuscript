# Phase 19 — Windows packaging and installer

**Status:** Complete · **Branch:** `phase/19-installer`

## Objective
Produce a Windows installer with electron-builder (NSIS) and verify install, first run, upgrade and
uninstall on the development machine.

## Why it exists
UC-15; surfaces packaging issues before polish so the release build is routine.

## Dependencies
Phase 18.

## Atomic tasks
- [x] **19.01** electron-builder configuration: NSIS, per-user install, choosable directory, shortcuts, uninstaller that keeps user data unless asked
- [x] **19.02** Application icon, product metadata, version from `package.json`
- [x] **19.03** `npm run desktop:dist` producing the installer
- [x] **19.04** Manual verification recorded: install, first-run vault creation, upgrade in place, uninstall
  Run on the development machine on 10 October 2026 with the user's go-ahead (journal: Phase 19). Results: a silent
  per-user install (exit 0) made `%LOCALAPPDATA%\Programs\Manuscript`, an Apps entry (0.1.0, publisher
  "Manuscript contributors"), a Start Menu and a desktop shortcut, and nothing under `%APPDATA%\Manuscript`; the
  installed program started with a vault, data folder and profile of its own, made the vault on first run, answered
  its health check and quit cleanly; installing 0.1.1 over it kept the folder, replaced the program, left a single
  Apps entry (0.1.1) and changed no file of the real vault or data folder; the uninstaller removed the program, the
  entry and both shortcuts and left the vault and data folders as they were. `scripts/check-installed.mjs` is the
  start-up check.
- [x] **19.05** Code-signing and SmartScreen notes in README
- [x] **19.06** Docs: installation guide; STATE/FEATURES/journal updated

## Gate
- [x] All tasks `[x]` · [x] installer verified · [x] docs updated · [x] merged

## Recommended commit messages
```text
build(desktop): add NSIS installer configuration with electron-builder
```
