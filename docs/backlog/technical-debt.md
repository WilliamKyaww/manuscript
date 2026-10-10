# Technical debt register

Every deliberate shortcut is recorded here when it is taken, with how and when it will be repaid.
"Temporary" code without an entry here is a defect.

| ID | Debt | Why taken | Risk | Repayment plan | Phase |
|---|---|---|---|---|---|
| TD-01 | `scripts/run-web.mjs` duplicates `defaultDataDir()` from `apps/server/src/config/config.ts` to find the token of an already-running instance | The launcher is plain JavaScript that must work before anything is built | The two copies drift and the launcher cannot reopen a running instance signed in | Have the server write its data directory to a well-known per-user location the launcher reads, or expose `--print-data-dir` on the bundle | 17 |
| ~~TD-02~~ | ~~Endpoint contracts always answer `200`~~ | | | **Repaid in Phase 3:** `defineEndpoint` takes `status` (201 for creation) | 3 |
| ~~TD-03~~ | ~~The Phase 1 status page is a stand-alone page outside an application shell~~ | | | **Repaid in Phase 2:** status moved to Settings › About; sign-in/unreachable handling moved to the session gate | 2 |
| ~~TD-04~~ | ~~The SPA ships as one JavaScript bundle~~ | | | **Repaid in Phase 3 (task 3.24):** lazy routes and a lazily loaded preview; initial bundle 466 kB (148 kB gzip) with the editor added | 3 |
| TD-05 | An npm `overrides` entry pins KaTeX to 0.19.0 for rehype-katex, micromark-extension-math and Mermaid, whose ranges ask for `^0.16` | Their 0.16 copies carry a (low-severity) advisory and would render HTML that the 0.19 stylesheet does not match; npm audit is clean with the override | An upstream change incompatible with KaTeX 0.19 would break maths rendering (`npm ls` reports the copies as "invalid") | Remove the override when the three packages accept KaTeX ≥ 0.19; the preview tests cover inline and display maths | 17 |
| TD-06 | The file tree renders every row of expanded folders (no virtualisation) | Typical folders hold tens to hundreds of notes; the 10,000-note tree listing takes 74 ms on the server | Expanding a folder with thousands of notes makes the tree sluggish | Virtualise the rows (the tree is already a flat list of `aria-level` rows) | 17 |
| TD-07 | An npm `overrides` entry pins `shell-quote` to 1.12.0 | The development tool `concurrently` (used by `npm run dev`) asks for a version with a critical advisory; npm audit is clean with the override | A future dependency incompatible with shell-quote 1.12 would fail at install or run time | Remove the override once the dependents ask for a fixed version (`npm ls shell-quote`) | 17 |
| TD-08 | Source parsing runs in the server's main thread (between awaits) | pdf.js yields between pages, and lecture files parse quickly (a 40-slide PDF deck in 0.4 s; an 18-page paper in 2.5 s, including loading pdf.js the first time) | A very large PDF slows API responses while it parses | Move parsers into a worker thread behind the same `SourceParser` interface (ADR-0008 consequences) | 17 |
| TD-09 | The PDF viewer reserves room for every page with the first page's size until a page renders | Lecture decks and papers have uniform pages; reading every page's size first would delay opening long PDFs | In documents with mixed page sizes a jump to a far page can land slightly off until the pages before it render | Read page sizes in the background after opening (B-SO-06) | 17 |
| TD-10 | Copies of files kept for undo in `.skb/history/` are never deleted | Each is a small Markdown note, and undoing needs the copy as long as the change can be undone | The folder grows with every edit by the assistant; a vault with heavy agent use could collect hundreds of megabytes | Delete copies of actions older than a retention period (e.g. 90 days) when the app starts, and mark those actions as no longer undoable | 12 |

Template:

```markdown
| TD-NN | <what is incomplete or hacky> | <why it was acceptable now> | <what can go wrong> | <how/when it is fixed> | <phase> |
```
