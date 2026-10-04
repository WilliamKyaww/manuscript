# Phase 18 — Electron desktop application

**Status:** Not started · **Branch:** `phase/18-electron`

## Objective
Run the same application as a secure Electron 44 desktop app: server in a `utilityProcess`, hardened
BrowserWindow, minimal preload bridge, encrypted secrets, development and production build commands.

## Why it exists
UC-15; desktop integration (native pickers, Explorer reveal) and a better daily-use experience
(ADR-0016).

## Dependencies
Phase 17.

## Atomic tasks
- [ ] **18.01** `apps/desktop` scaffold (Electron 44; esbuild for main and preload)
- [ ] **18.02** Main process: single-instance lock, server in a `utilityProcess`, ready handshake, crash detection and restart prompt
- [ ] **18.03** BrowserWindow: `contextIsolation`, `sandbox`, no `nodeIntegration`, CSP, navigation restricted to the app origin, external links via validated `shell.openExternal`
- [ ] **18.04** Auth cookie injection for the server origin
- [ ] **18.05** Preload bridge (`pickFiles`, `pickFolder`, `revealInExplorer`, `appInfo`) with web fallbacks in the UI
- [ ] **18.06** `safeStorage`-backed secrets for AI keys
- [ ] **18.07** Window state persistence, application menu, shortcut parity with the web app
- [ ] **18.08** `npm run desktop:dev` and `npm run desktop:build` (unpacked)
- [ ] **18.09** Playwright Electron smoke test (launch, health, open note, quit cleanly)
- [ ] **18.10** Docs: desktop section in README; STATE/FEATURES/journal updated

## Gate
- [ ] All tasks `[x]` · [ ] verify + Electron smoke green · [ ] docs updated · [ ] merged

## Recommended commit messages
```text
feat(desktop): add Electron shell running the server in a utility process
feat(desktop): add secure preload bridge and encrypted secrets
```
