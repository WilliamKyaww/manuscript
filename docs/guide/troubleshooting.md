# When something is wrong

Most problems have a message that says what to do; this page collects them, and what to look at when
there is none. Two places help in every case: **Settings → About → Diagnostics** (what the installation is
doing, failed background jobs, the recent log, and a bundle you can send to someone who is helping) and the
log files in the vault's hidden `.skb\logs` folder.

## It will not start

| You see | What it means | What to do |
|---|---|---|
| “Port 4317 is already in use. Is Manuscript already running?” | Another copy (or another program) holds the port | Close the other copy, or start with another port: set `SKB_PORT` (for example `4318`) before `run-web.bat` |
| “This vault is already open in another Manuscript process (PID …)” | A copy is running on that vault, or one was killed and left its lock | Close the other copy. If you are sure nothing is running, delete `.skb\lock` in the vault |
| “This vault is locked by another computer” | The vault is on a synced or shared drive and another computer has it open | Close Manuscript there; do not run two copies on one vault |
| “Vault folder not found” | The folder was moved or renamed | Start with `--vault "<folder>"`, or open the right folder from Settings → Data once it runs |
| The sign-in link is “not valid” | The page was opened without the token | Start with `run-web.bat`, which opens the right link; a bookmark of `/` works while the same token is in use |
| “…migration … newer version of the application” | The vault's database was last used by a newer Manuscript | Update the application; do not open it with an older one |

## It is running, but something is off

- **Search, links or the graph look out of date** (you changed files while Manuscript was closed, or a sync
  tool is behind): **Settings → Data → Read the files again**. It changes none of your files.
- **“…changed on disk” when saving a note**: another program saved the file after you opened it. The editor
  offers to keep your version, take theirs, or look at the difference. Nothing is overwritten silently.
- **“Manuscript is not allowed to change that file or folder: it may be read-only, or open in another
  program”**: the note is marked read-only (Properties → Read-only), or an antivirus, backup or sync program has it
  open. Clear the flag or close the other program and save again. Your text stays in the editor.
- **“That would make the full path … longer than Windows allows (260 characters)”**: Windows refuses very long
  paths. Use a shorter name, a shallower folder, or keep the vault nearer the top of the drive.
- **A file in Sources is listed as failed**: the reason is under its name — *empty*, *its contents do not match
  its extension*, *larger than 200 MB*, *encrypted*, *more than 3,000 pages*. Fix or replace the file and it is
  read again, or press **Retry**.
- **“The disk is full”** or **“A disk error”**: free space, or check that the drive holding the vault is
  connected. Nothing already saved is lost; a save that failed stays in the editor.
- **“The database is busy”**: something else (a backup tool copying `.skb`) has it locked for a moment. Try
  again.
- **Everything is slow**: look at **Diagnostics → Background jobs** (a large import or a generation may be
  running) and the database size. Search is expected to answer in well under a second at 10,000 notes.

## The database is damaged

Notes are files and are not affected. The rest — concepts, cards, reviews, answers, the Inbox, chats, plans —
is in `.skb\skb.db`, and Manuscript keeps copies in `.skb\backups` (a daily copy, and one before every
update; **Settings → Data → Database backups** lists them).

1. Close Manuscript.
2. In the vault's `.skb` folder, rename `skb.db` to `skb.db.damaged` (keep it), and delete `skb.db-wal` and
   `skb.db-shm` if they are there.
3. Copy the newest backup you trust into `.skb` and rename it `skb.db`.
4. Start Manuscript. The index is brought up to date with the files; what you did after the copy is what you
   lose.

If there is no usable backup but you have an **export** (Settings → Data), restore it into a new folder.

## AI

- **“AI is not set up”**: Settings → AI. Everything that does not need a model works without it.
- **“Could not reach the provider”**: you are offline, the address is wrong, or a local model (Ollama, LM
  Studio) is not running. Nothing else is affected; try again when it is.
- **“The provider refused the key”** (401/403), **“rate-limiting or out of credit”** (429): check the key and
  the provider's account.
- **“Over the monthly budget”**: raise the budget in Settings → AI, or wait for the new month.

## What is kept, and where

Everything is in the vault folder (notes, `Sources`, `.skb`) except AI keys and the list of vaults, which are
in `%APPDATA%\Manuscript`. [Your data](./portability.md) says what is where and how to leave with all of it.

## Asking for help

**Diagnostics → Download the bundle** makes a zip of the state of the installation, the applied migrations,
non-secret settings and the log. It holds no note text, no questions or answers and no AI keys, and shows your
home folder as `~`. Open it and read it before sending it to anyone.
