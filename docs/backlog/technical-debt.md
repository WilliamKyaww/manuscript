# Technical debt register

Every deliberate shortcut is recorded here when it is taken, with how and when it will be repaid.
"Temporary" code without an entry here is a defect.

| ID | Debt | Why taken | Risk | Repayment plan | Phase |
|---|---|---|---|---|---|
| TD-01 | `scripts/run-web.mjs` duplicates `defaultDataDir()` from `apps/server/src/config/config.ts` to find the token of an already-running instance | The launcher is plain JavaScript that must work before anything is built | The two copies drift and the launcher cannot reopen a running instance signed in | Have the server write its data directory to a well-known per-user location the launcher reads, or expose `--print-data-dir` on the bundle | 17 |
| TD-02 | Endpoint contracts always answer `200`; there is no way yet to declare `201`/`204` | No endpoint needs another status in Phase 1 | Handlers might hand-roll responses outside the contract | Add an optional `status` to `defineEndpoint` with the first create/delete endpoint | 3 |
| TD-03 | The Phase 1 status page is a stand-alone page outside an application shell | The shell is Phase 2's deliverable | None if Phase 2 replaces it | Move the status panel to Settings › About in Phase 2 (task 2.14) | 2 |

Template:

```markdown
| TD-NN | <what is incomplete or hacky> | <why it was acceptable now> | <what can go wrong> | <how/when it is fixed> | <phase> |
```
