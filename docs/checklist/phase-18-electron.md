# Phase 18 — Electron desktop application

**Status:** Complete · **Branch:** `phase/18-electron`

## Objective
Run the same application as a secure Electron 44 desktop app: server in a `utilityProcess`, hardened
BrowserWindow, minimal preload bridge, encrypted secrets, development and production build commands.

## Why it exists
UC-15; desktop integration (native pickers, Explorer reveal) and a better daily-use experience
(ADR-0016).

## Dependencies
Phase 17.

## Atomic tasks
- [x] **18.01** `apps/desktop` scaffold (Electron 44; esbuild for main and preload)
- [x] **18.02** Main process: single-instance lock, server in a `utilityProcess`, ready handshake, crash detection and restart prompt
- [x] **18.03** BrowserWindow: `contextIsolation`, `sandbox`, no `nodeIntegration`, CSP, navigation restricted to the app origin, external links via validated `shell.openExternal`
- [x] **18.04** Auth cookie injection for the server origin
- [x] **18.05** Preload bridge (`pickFiles`, `pickFolder`, `revealInExplorer`, `appInfo`) with web fallbacks in the UI
- [x] **18.06** `safeStorage`-backed secrets for AI keys
- [x] **18.07** Window state persistence, application menu, shortcut parity with the web app
- [x] **18.08** `npm run desktop:dev` and `npm run desktop:build` (unpacked)
- [x] **18.09** Playwright Electron smoke test (launch, health, open note, quit cleanly)
- [x] **18.10** Docs: desktop section in README; STATE/FEATURES/journal updated

## Gate
- [x] All tasks `[x]` · [x] verify + Electron smoke green · [x] docs updated · [x] merged

## Recommended commit messages
```text
feat(desktop): add Electron shell running the server in a utility process
feat(desktop): add secure preload bridge and encrypted secrets
```
