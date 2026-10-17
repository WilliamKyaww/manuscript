# Installing Manuscript on Windows

Manuscript can be used straight from the repository (`run-web.bat`, [the browser version](../../README.md))
or installed as a desktop application. This page is about the installer.

## Getting the installer

Build it yourself from the repository, on a Windows machine with Node.js 24:

```powershell
npm install
npm run desktop:dist
```

This builds the application and the desktop shell and writes
`apps\desktop\release\Manuscript-Setup-<version>.exe` (about 120 MB). The first run downloads the installer
tooling (NSIS and its helpers, a few megabytes) and Electron; after that it works offline. It takes a couple of
minutes.

## Installing

For the Phase 27 WebView2 follow-up, the tested local candidate is
`apps\desktop\release\Manuscript-Setup-1.4.0-WebView2.exe`. The older
`Manuscript-Setup-1.4.0.exe` in the release root does not contain that fix. Both report version 1.4.0;
use the distinctly named candidate, close Manuscript fully, and install over the existing application.
No uninstallation or deletion of the vault/browser profile is needed. A formal release should use a new version.

For the Phase 28 file previews (which include the Phase 27 follow-up), the local candidate is
`appsdesktopeleaseManuscript-Setup-1.4.0-FilePreviews.exe`, built on 17 October 2026; the file's SHA-256 is
`1d0d8eaad9113fddb6b72616afec0dfb73c163d0e4a7f21f9b732eeab608db4a`. It also reports 1.4.0, so check the file name, and
install it the same way (close Manuscript fully first). **Page layout** for Word and Excel files needs LibreOffice,
installed separately (`winget install TheDocumentFoundation.LibreOffice`); everything else, including the readable view
of those files, works without it. A formal release should use a new version.

Run `Manuscript-Setup-<version>.exe`.

- **It installs for you only.** No administrator prompt: the program goes to
  `%LOCALAPPDATA%\Programs\Manuscript` by default, and you can choose another folder on the second page.
- **It adds** a Start Menu entry and a desktop shortcut, and an entry under *Settings → Apps → Installed apps*.
- **It does not touch your notes.** Your vault is a folder you own (`Documents\Manuscript` by default, or
  whichever you open from *Settings → Data*), and the application's own data (your AI settings and keys, the
  list of vaults, exports) is in `%APPDATA%\Manuscript`. Neither is part of the installation.

### The Windows SmartScreen warning

An installer that is not signed with a code-signing certificate makes Windows show *"Windows protected your
PC"* the first time: choose **More info → Run anyway**. The warning is about the file being unknown, not about
what is in it; you built it yourself from the repository. A certificate costs money every year, so personal builds
are not signed. If you have one, set `CSC_LINK` (the certificate file or a base64 string) and `CSC_KEY_PASSWORD`
before `npm run desktop:dist` and the installer and the executable are signed.

## First run

Start Manuscript from the Start Menu. With no vault yet it makes `Documents\Manuscript` and opens Today; if you
used an earlier name of the project and `Documents\Study Knowledge Base` exists, that is what opens. To use
another folder (an Obsidian vault, for instance) open it from *Settings → Data*; see
[Your data](./portability.md) and [The desktop app](./desktop.md).

## Updating

Run a newer `Manuscript-Setup-<version>.exe`: it replaces the program in the same place and keeps your settings,
vault and data. Close Manuscript first (the installer asks). The first start after an update takes a copy of the
database before changing it ([backups](./portability.md)).

## Uninstalling

*Settings → Apps → Installed apps → Manuscript → Uninstall.* This removes the program and its shortcuts and **keeps
your vault and `%APPDATA%\Manuscript`**. To remove those as well, delete the folders yourself — export first if you
might want them back ([Your data](./portability.md)).

## For developers

To check an installer without trusting it to your own profile, `node scripts/check-installed.mjs "<path to
Manuscript.exe>"` starts a program (installed or unpacked) with a vault, a data folder and a user profile of its
own, and checks that it comes up signed in, answers, and quits cleanly. `SKB_DIST_VERSION=1.0.1 npm run
desktop:dist` builds an installer with another version, to see an update install over a release in place.

The configuration is `apps/desktop/electron-builder.yml`; `npm run desktop:build` makes an unpacked build without
the installer (`apps\desktop\release\win32-unpacked`). The installer is built from the same bundles, and
`e2e/desktop.spec.ts` launches both layouts.
