# Phase 19 — Windows packaging and installer

**Status:** Not started · **Branch:** `phase/19-installer`

## Objective
Produce a Windows installer with electron-builder (NSIS) and verify install, first run, upgrade and
uninstall on the development machine.

## Why it exists
UC-15; surfaces packaging issues before polish so the release build is routine.

## Dependencies
Phase 18.

## Atomic tasks
- [ ] **19.01** electron-builder configuration: NSIS, per-user install, choosable directory, shortcuts, uninstaller that keeps user data unless asked
- [ ] **19.02** Application icon, product metadata, version from `package.json`
- [ ] **19.03** `npm run desktop:dist` producing the installer
- [ ] **19.04** Manual verification recorded: install, first-run vault creation, upgrade in place, uninstall
- [ ] **19.05** Code-signing and SmartScreen notes in README
- [ ] **19.06** Docs: installation guide; STATE/FEATURES/journal updated

## Gate
- [ ] All tasks `[x]` · [ ] installer verified · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
build(desktop): add NSIS installer configuration with electron-builder
```
