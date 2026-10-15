# The desktop app

Manuscript runs as its own window as well as in your browser. It is the same application — the same
server, the same vault, the same data folder — so you can use either, one at a time (a vault is open in
one place only).

## Starting it

| How | What you get |
|---|---|
| `npm run desktop:dev` | The window, run from the repository against the built application (it builds it when it is missing, and downloads Electron the first time). |
| `npm run desktop:build`, then `apps\desktop\release\win32-unpacked\Manuscript.exe` | An unpacked build you can copy anywhere: it needs no Node.js and no repository. The installer is [Phase 19](../checklist/phase-19-installer.md). |

You are signed in as the window opens: there is no sign-in link, because the window and the server
share a token made for that run.

## What the window adds

- **Browse…** beside the folder and file fields in **Settings → Data** (restoring an export, opening another
  vault), and **Show in folder** for the vault and the exports folder. In a browser these are typing a path and
  *Copy path*.
- **Opening another vault** restarts the engine under the same window and returns you to Today.
- **A window that remembers** where it was, its size and whether it was maximised (a position on a screen that
  is no longer there is forgotten).
- **A slim title bar** in Manuscript's colours (1.1): no system title bar or menu bar, a 32-pixel strip with the
  page's title that you drag the window by, and Windows' own minimise, maximise and close buttons over the top
  right, coloured to follow the light or dark theme. The menu is hidden but its shortcuts still work: zoom
  (`Ctrl+-`, `Ctrl+=`, `Ctrl+0`), full screen (`F11`), reload (`Ctrl+R`), and the Edit commands. *Show the
  vault folder* is in the vault menu at the foot of the Notes page's Files pane, and the data folder in
  *Settings → Data*. Manuscript's own shortcuts (`Ctrl+K`, `Ctrl+O`, `?` …) work as in the browser.
- **The Notes page's file commands** that a browser cannot do: **Open in default app** (a note or attachment in
  the program Windows uses for it — only files inside the vault), **Show in system explorer**, **Export to
  PDF…** straight to a file you choose, and **Open in new window** for a note in a window of its own (closed
  with the main window).
- **Web pages beside your notes** (1.4): a click on a link to the web in a note opens the page in a pane on
  the right of the note (Phase 27), with back, forward, reload, an address bar, *Copy link* and *Open in browser*; the
  note stays open beside it. Pages are tabs like notes (drag the divider, close the tab when done) and come
  back after a restart. Ctrl+click opens a link in your browser instead, and *Settings → Editor* can turn the
  pane off. Sign-ins you make there are remembered for the pane only; some sites (Google's sign-in among
  them) refuse embedded browsers — use *Open in browser* for those.
- **One copy at a time**: starting it again brings the open window forward.

## Website verification and browsing failures

A website can ask you to verify that you are human. When it supplies a verification page, complete the
challenge yourself in the web pane. Manuscript retains the website's response, including an HTTP 403 response,
so a verification form is not replaced by an application error. A website-response notice can appear above the
page; it does not mean the application knows why that website refused the request.

If a page fails to load or stops responding, its address remains available for retry or **Open in browser**.
The system browser has its own cookies and sign-ins: verification performed there is not transferred into
Manuscript. Manuscript uses its browser engine's normal identity and does not bypass verification or change
security settings to gain access.

The reported ScienceDirect paper is tracked in [Phase 27](../checklist/phase-27-web-pane-right.md). Its Cloudflare
widget looped in Electron. On 15 October the user confirmed article access and normal interaction in the
integrated Windows WebView2 tab; the [15 October journal](../journal/2026-10-15-gpt-6-astra.md) records this result.
Some sites offer different content or refuse embedded browsers.

## What it keeps to itself

- **The window shows only Manuscript.** It never navigates to another address. Web pages are shown only in the
  web pane, as separate pages in a browsing session of their own: they cannot see Manuscript's sign-in, your
  notes or your files, have no access to Node, are allowed no camera, microphone, location or notifications,
  and cannot open Manuscript's own address. Only plain `http` and `https` links open, there or in your system
  browser.
- **The page can ask for a few things**, and nothing else: pick files, pick a folder, show a path (only inside
  the vault or the data folder, or a PDF it has just saved), open a file of the vault in its program, print
  itself to a PDF, colour the title bar's buttons and say which application this is. A window of its own opens
  only for a note of the application. It has no access to Node or to your files.
- **AI keys are encrypted.** The first time it starts, a random key is made and wrapped by the operating system
  (on Windows, with your login), and the keys file in the data folder is encrypted with it. Copying the data
  folder to another computer or account does not give the keys away. *Settings → About* says whether the
  protection is in place; where a system offers none, keys stay in a file only you can read, as in the browser.
  The browser version cannot open an encrypted keys file (and does not overwrite it): change keys in the app that
  saved them.

## If the engine stops

The server runs in a background process of the window. If it stops unexpectedly the window offers to start it
again; your notes and data are files and a database on disk and are not affected. Its log is under
**Settings → About → Diagnostics**, as in the browser.

## For developers

`apps/desktop` holds the main process (`main.ts`), the preload (`preload.ts`, which must be CommonJS), the engine
(`engine.ts`), and the rules that are pure functions with tests (`policy.ts`). `SKB_SERVER_BUNDLE` points the shell at
another server bundle; `SKB_DEVTOOLS=1` allows the developer tools in an unpacked build. VS Code's extension host
sets `ELECTRON_RUN_AS_NODE`, which makes Electron run as plain Node: the scripts and tests remove it.

On Windows x64, web panes prefer Microsoft Edge WebView2, hosted in native child windows by
`apps/desktop/native/WebPane/`. The helper uses .NET Framework 4.8 and the installed Evergreen WebView2 runtime;
the pinned SDK is needed only at build time. Its profile is `<data>/desktop-webview2`. It has no Node,
application preload, host objects or web-message bridge. Other platforms, or Windows without a working
helper/runtime, retain Electron `WebContentsView`. `SKB_BROWSER_ENGINE=electron` explicitly selects this
fallback for regression testing. Website sessions are separate and are not migrated between engines.

Electron's `persist:web` session lives
under `<data>/desktop`; the application renderer has its own session. `WebTab.tsx` measures a DOM host and sends
its bounds through the preload bridge; the main process owns the view and validates each call. A window
`capturePage` image does not include these native views: inspect their bounds and capture their web contents
separately. Tests must isolate the vault, data directory and all profile folders (see `AGENTS.md`).

For a minimal, secure browser-compatibility reproduction independent of the application, run
`node scripts/diagnose-browser.mjs`. It opens Cloudflare's official checker in a sandboxed Electron window with
a new temporary profile and prints the location of sanitised event logs. Complete any checkbox manually and
close the window afterwards. An optional absolute Electron executable path compares another already-downloaded
runtime without changing the project dependency. Do not share the temporary profile or raw diagnostic reports;
they can contain site cookies or identifying information. The [14 October investigation](../journal/2026-10-14-gpt-6-astra.md)
records the tested versions and the fresh-Chrome control result.

For local fixture regression tests only, `SKB_WEBVIEW2_DIAGNOSTICS=1` enables SDK diagnostic calls on the
private helper pipe when desktop developer tools are enabled (`SKB_DEVTOOLS=1` for a packaged build).
It opens no debugging port and adds no renderer/preload interface. The tests inspect the main-process
driver directly. Do not enable it for live human-verification checks. `e2e/webview2.spec.ts` covers both
the source shell and `desktop:build` output; the Electron-specific tests explicitly select the legacy engine.

The blank hidden controller in the helper keeps the website session alive while no visible web tabs remain.
Closing Manuscript ends that session; persistent website cookies/storage remain in its dedicated profile.
The helper exits on pipe closure or parent-process exit. Packaged resources include `WebPane.exe`, the
WebView2 Core/loader DLLs and their licence; no separate .NET 9 installation is needed.
