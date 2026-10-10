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
- **A menu** with the usual Edit and View commands, zoom, full screen, and *Show the vault folder* / *Show the
  data folder*. Manuscript's own shortcuts (`Ctrl+K`, `Ctrl+O`, `?` …) work as in the browser.
- **One copy at a time**: starting it again brings the open window forward.

## What it keeps to itself

- **The window shows only Manuscript.** A link to a web page opens in your system browser (plain `http` and
  `https` links only); the window never navigates to another address.
- **The page can ask for four things**, and nothing else: pick files, pick a folder, show a path (only inside
  the vault or the data folder) and say which application this is. It has no access to Node or to your files.
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
