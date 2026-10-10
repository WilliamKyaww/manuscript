# Your data: leaving, moving and bringing things in

Nothing you make in Manuscript is held hostage to it. Your notes are Markdown files you can open in any
editor, your slides and papers are kept as the files you imported, and everything else — concepts,
flashcards and their schedules, every review and answer, the Inbox, chats, plans — can be exported as
plain JSON and text. This guide says where each thing lives, how to take it all out, how to bring it back,
and how to open another vault, including an Obsidian one.

Everything here is in **Settings → Data**, and none of it needs an AI model.

## What lives where

| What | Where | Format |
|---|---|---|
| Notes | Your vault folder (`Documents\Manuscript` by default) | Markdown files, Obsidian-compatible |
| Slides, PDFs, documents, recordings | `Sources/` inside the vault, exactly as imported | The original files |
| Attachments | Next to your notes in the vault | The original files |
| Concepts, relations, course, cards, schedules, reviews, questions, quizzes, answers, the Inbox, chats, plans, imported code graphs | `.skb/skb.db` inside the vault (SQLite) | One database; exported as JSON |
| What can be made again: the search index, text read from sources, graph clusters, mastery figures | `.skb/skb.db` | Not exported: Manuscript rebuilds it |
| AI provider keys and settings, exports, the list of vaults | Your data folder (`%APPDATA%\Manuscript`), **outside** the vault | Never exported, never in the vault |

If you deleted the hidden `.skb` folder, every note and file would still be there and the index would be
made again; what you would lose are the things only the database holds — which is why exports exist.

## Export everything

**Settings → Data → Export everything** writes one zip file into the `exports` folder of your data folder
(outside the vault) and lets you download it. It can take a while for a big vault; progress is shown, and
you can go on working.

| In the zip | What it is |
|---|---|
| `README.md`, `manifest.json` | What was exported, when, and how many of each thing |
| `vault/` | Your vault's files as they are on disk: notes, `Sources/`, attachments |
| `data/*.json` | One file for each table of your own data (modules, lectures, concepts, relations, cards, reviews, questions, answers, proposals, chats, plans …). Plain JSON arrays |
| `data/note-ids.json`, `data/files.json` | Each note's identifier; each file's size and modification time |
| `docs/schema.md` | What each data file and column holds |
| `anki/*.txt` | Every flashcard set as tab-separated text that Anki imports |
| `concepts/*.md` | Every concept as a Markdown note, relations as `[[links]]` |
| `questions/` | The question bank as JSON and each quiz as Markdown with its answer key |
| `graph/graph.json`, `graph/graph.graphml` | The knowledge graph as node-link JSON (NetworkX, D3, Graphify) and as GraphML (Gephi, yEd, Cytoscape) |

Two things to know:

- A note that has no `id` line yet gets one **in the zip only**, so that links by id survive a restore.
  Your vault is never written by an export.
- The zip holds everything, **chats and usage included**. Keep it as carefully as you keep the vault. Your AI
  provider keys are never in it.

## Restore into a new vault

**Settings → Data → Restore from an export**: choose the export (or paste the path of a `.zip`) and a new,
empty folder. Manuscript:

1. checks the archive (a newer version's export is refused; so is an archive with unsafe file names);
2. puts your files back, with their modification times, and checks each is whole;
3. loads your data into a fresh database;
4. leaves the search index, source text and clusters to be made again the first time the vault is opened.

It never merges into, or overwrites, a vault, and a restore that fails leaves nothing behind. Afterwards the
new vault is in the list under **Vaults on this computer**: open it from there. An export, restored and
exported again, says the same.

You do not need Manuscript to use an export: copy the `vault/` folder anywhere and open it as notes.

## Concepts as notes

Concepts live in the database, not in files. **Concepts as notes** writes a Markdown note for each concept
that has none, in the folder you name (`Concepts` by default): its summary, aliases and modules, and its
relations as links. The note becomes the concept's own note. Notes that exist are never overwritten. The same
notes are in every export (in `concepts/`) without touching your vault.

## Another vault, and Obsidian

**Vaults on this computer** lists the vaults you have opened. To open a folder that is not in the list,
type its path and choose **Look at it**: Manuscript says what the folder is and what opening it will do
before it does anything.

- **An Obsidian vault** is opened where it is. Your notes are read, not converted. Manuscript adds an `id:`
  line to a note's front matter only when it needs to refer to the note (for example to make a concept's note),
  and changes nothing else in your notes or in `.obsidian`. It keeps its own data in a hidden `.skb` folder,
  which Obsidian ignores (add it to `.gitignore` if the vault is under Git).
- **Switching** restarts Manuscript on the other vault. Started with `run-web.bat` it does so by itself and
  the page reloads (the desktop app will do the same); otherwise it tells you that the vault opens the next
  time you start it. A vault that another copy of Manuscript has open is refused.
- **Forget** removes a vault from the list; the folder is never touched.

## Code from a repository: Graphify graphs

If your coursework or dissertation has a code repository, you can map it with
[Graphify](https://github.com/Graphify-Labs/graphify) and import the resulting `graph.json` under
**Settings → Data → Code graphs** (optionally naming the module it belongs to).

- Files, classes and functions become **Code** nodes in the graph (tick **Code** in the graph's filters;
  they are left out by default because there are many). What calls or imports what is drawn as *uses*.
- Names that match your concepts are **suggested** as links — `raft.py` or `RaftNode` for the concept
  *Raft*, `append_entries()` for *Append entries*. They wait on the concept's page, under **Implemented in**,
  for you to accept or reject; a rejection is remembered. You can also link code by hand.
- Code is shown but not analysed: a repository will not change your clusters, core concepts or study prompts.
- The file is checked as untrusted input and limited (50,000 nodes, 250,000 edges, 60 MB). The graph is stored
  in your data (and exported); the original `graph.json` is not kept in the vault.

## Backups of the database

Your notes are files, and your sync tool or Git can look after them. Everything else — concepts, cards and
their schedules, reviews and answers, the Inbox, chats, plans — is in the database `.skb/skb.db`, and
Manuscript keeps copies of it in `.skb/backups`:

- **a daily copy**, made shortly after Manuscript starts if there is none under a day old, and again each
  day it stays open (the last 14 are kept);
- **a copy before an update changes the database** (the last 5 are kept; a brand-new database has nothing to
  keep);
- **a copy you ask for** with **Settings → Data → Back up now** (the last 10 are kept).

Copies are made by SQLite itself, so they are consistent even while you work, and a copy is never left
half-written. They hold the database only; the files are the vault. They are in the vault's hidden folder, so
**copy them elsewhere** (or use **Export everything**) if you want protection from losing the disk.

**Going back to a copy.** Close Manuscript. In the vault, rename `.skb\skb.db` (keep it, just in case),
delete `skb.db-wal` and `skb.db-shm` beside it, copy the backup into `.skb` and name it `skb.db`. Start
Manuscript again: the index is brought up to date with the files, and everything you did since the copy is
what you lose.

## Reading the files again

**Read the files again** brings the index up to date with the files, if you changed them while Manuscript was
closed or a sync tool was behind. It changes none of your files.

## Limits worth knowing

- A note whose front matter is not valid YAML cannot hold an id. It is still exported byte for byte, but a
  concept's note or a relation that points at it is lost on restore (the note itself is fine).
- Restoring needs an empty folder; there is no "merge two vaults".
- The desktop app (Phase 18) will add "Show in folder"; in the browser use **Copy path**.
- Exports are not encrypted ([B-PL-07](../backlog/backlog.md)).
