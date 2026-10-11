# Phase 22 — Release and final documentation

**Status:** Complete · **Branch:** `phase/22-release`

## Objective
Produce the final web production build, the Electron build and the Windows installer, complete the
documentation, and tag v1.0.0.

## Dependencies
Phase 21 (closed at the user's request on 11 October; its open checks are listed in STATE and the changelog).

## Atomic tasks
- [x] **22.01** Final web production build; `run-web.bat` verified on a clean clone — Every package at 1.0.0. A clone
  of `phase/22-release` into a temporary folder, with the vault, data, home and app-data folders all inside it (only
  npm's and Electron's download caches shared): `run-web.bat` installed the dependencies, built and started
  Manuscript 1.0.0 in 80 s; the page was served, the API refused requests without sign-in (401), the sign-in link was
  printed, and a second `run-web.bat` said "Already running" and exited 0. The folder was removed afterwards.
- [x] **22.02** Final Electron build and installer; install test recorded — `npm run desktop:dist` →
  `Manuscript-Setup-1.0.0.exe` (121 MB, not signed) and `desktop:build` (both 1.0.0); `e2e/desktop.spec.ts` 4/4 (the
  shell, both packaged layouts, every page in the window). With the user's go-ahead, **installed to keep**: a silent
  per-user install (exit 0) made the Apps entry "Manuscript 1.0.0", publisher "Manuscript contributors", Start Menu
  and desktop shortcuts and `%LOCALAPPDATA%\Programs\Manuscript`; `scripts/check-installed.mjs` started the installed
  program with a vault and profile of its own (packaged, server 1.0.0) and it quit cleanly; the real vault and data
  folders had the same fingerprint (names, sizes and times of their 7 files) before and after.
- [x] **22.03** README complete; user guide (`docs/guide/`) complete — The README opens with version 1.0.0, a
  Getting started table (the desktop app, the browser, where to begin) and every command; the guide index is grouped
  for a newcomer (getting started, notes and material, learning, AI, your data and help) with all eighteen guides.
- [x] **22.04** CHANGELOG and v1.0.0 release notes — `CHANGELOG.md`: what Manuscript is, how to run it, where your
  data lives, coming from a 0.1 build, everything added by area, how it was verified, and the known limitations.
- [x] **22.05** Tag `v1.0.0` locally; final STATE.md and FEATURES.md — STATE says 1.0.0 is released and what is open;
  FEATURES is dated for 1.0.0; `v1.0.0` is an annotated tag on the merge into `main` (not pushed: the user pushes).

## Gate
- [x] All tasks `[x]` · [x] builds verified · [x] merged and tagged

## Recommended commit messages
```text
chore(release): v1.0.0
```
