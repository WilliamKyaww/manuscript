# Technical debt register

Every deliberate shortcut is recorded here when it is taken, with how and when it will be repaid.
"Temporary" code without an entry here is a defect.

| ID | Debt | Why taken | Risk | Repayment plan | Phase |
|---|---|---|---|---|---|
| TD-01 | `scripts/run-web.mjs` duplicates `defaultDataDir()` from `apps/server/src/config/config.ts` to find the token of an already-running instance | The launcher is plain JavaScript that must work before anything is built | The two copies drift and the launcher cannot reopen a running instance signed in | Have the server write its data directory to a well-known per-user location the launcher reads, or expose `--print-data-dir` on the bundle | 17 |
| TD-02 | Endpoint contracts always answer `200`; there is no way yet to declare `201`/`204` | No endpoint needs another status in Phase 1 | Handlers might hand-roll responses outside the contract | Add an optional `status` to `defineEndpoint` with the first create/delete endpoint | 3 |
| ~~TD-03~~ | ~~The Phase 1 status page is a stand-alone page outside an application shell~~ | | | **Repaid in Phase 2:** status moved to Settings › About; sign-in/unreachable handling moved to the session gate | 2 |
| TD-04 | The SPA ships as one JavaScript bundle (625 kB minified, 196 kB gzip at the end of Phase 2) | No heavy route-specific dependencies yet | Start-up slows as the editor, KaTeX, Mermaid, pdf.js and Sigma arrive | Lazy-load route components (TanStack Router lazy routes) and heavy libraries before they land — first in Phase 3 with CodeMirror | 3 |

Template:

```markdown
| TD-NN | <what is incomplete or hacky> | <why it was acceptable now> | <what can go wrong> | <how/when it is fixed> | <phase> |
```
