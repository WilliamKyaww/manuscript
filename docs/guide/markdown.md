# Notes and Markdown

Your notes are ordinary Markdown files in your vault folder. You can edit them here, in Obsidian, in
VS Code or in any text editor — Manuscript picks up changes made elsewhere within about a
second. This page describes the Markdown it understands and how notes behave.

![A note in the editor with live preview on: the heading and bold text without their marks, front matter small and grey, the files on the left and the outline on the right](../screenshots/note-light.png)

## Contents

1. [The Markdown dialect](#1-the-markdown-dialect)
2. [Links and how they are resolved](#2-links-and-how-they-are-resolved)
3. [Properties (frontmatter)](#3-properties-frontmatter)
4. [Note ids](#4-note-ids)
5. [Templates](#5-templates)
6. [Attachments and embeds](#6-attachments-and-embeds)
7. [Editing, saving and edits made elsewhere](#7-editing-saving-and-edits-made-elsewhere)
8. [Tabs, panes and the file menus](#8-tabs-panes-and-the-file-menus)
9. [Renaming, moving and the trash](#9-renaming-moving-and-the-trash)
10. [Which files are notes](#10-which-files-are-notes)
11. [Differences from Obsidian](#11-differences-from-obsidian)
12. [Keyboard](#12-keyboard)

## 1. The Markdown dialect

CommonMark with GitHub Flavoured Markdown and Obsidian's extensions:

| Feature | Write | Notes |
|---|---|---|
| Headings, emphasis, lists, quotes, code | `# Title`, `**bold**`, `- item`, `> quote`, `` `code` `` | CommonMark |
| Tables, task lists, strikethrough, footnotes, autolinks | `\| a \| b \|`, `- [x] done`, `~~old~~`, `text[^1]` | GFM |
| Wikilinks | `[[Note]]`, `[[Note\|shown text]]`, `[[Note#Heading]]`, `[[Note#^block-id]]` | Inside a table, write the pipe as `\|` |
| Embeds | `![[Note]]`, `![[Note#Heading]]`, `![[diagram.png]]`, `![[diagram.png\|300]]`, `![[slides.pdf#page=3]]` | Images, PDFs, audio, video and other notes |
| Markdown links | `[text](Folder/Note.md)`, `![alt](img/photo.png)` | Paths are relative to the note; spaces as `%20` or `<…>` |
| Tags | `#exam`, `#cs/distributed` | Letters, digits, `_`, `-`, `/`; at least one non-digit; not in code |
| Callouts | `> [!tip] Title` then `> body`; `> [!faq]- Folded` / `> [!faq]+ Open` | Types: note, tip, warning, danger, question, quote, … |
| Highlights | `==important==` | |
| Comments | `%% hidden %%` (may span lines) | Not shown in the preview, not indexed for links |
| Maths | `$e^{i\pi} + 1 = 0$`, `$$ … $$` | KaTeX. `$5 and $6` stays text, as in Obsidian |
| Diagrams | a ```` ```mermaid ```` code block | Drawn when the preview needs it |
| HTML | `<details>`, `<sub>`, `<br>` … | Sanitised: no scripts, frames, forms or inline styles |

Links, tags and headings inside code, maths and comments are ignored everywhere (preview, backlinks,
search), so examples in code blocks never create links.

## 2. Links and how they are resolved

A link target is matched **ignoring case and Unicode form** (so `Café` written on a Mac matches `Café`
written on Windows).

For a bare name such as `[[Raft]]`, the first match wins:

1. a note whose **file name** is `Raft` (`Raft.md`);
2. a note whose frontmatter **`title`** is `Raft`;
3. a note with **`aliases: [Raft]`**;
4. a **concept** called `Raft`, or with `Raft` among its aliases ([concepts](./course.md#6-concepts));
5. an **attachment** called `Raft` (for file names with an extension, such as `diagram.png`).

So a note always wins over a concept of the same name. Links to concepts have a dotted underline
and open the concept page.

For a target with a folder, such as `[[COC251/Paxos]]` or `[x](../Paxos.md)`:

1. relative to the linking note's folder;
2. from the top of the vault (a leading `/` means only this: `[[/Paxos]]`);
3. any note whose path ends with it (`COC251/Paxos` finds `Modules/COC251/Paxos.md`).

When several notes match at the same step, a note **in the linking note's own folder** wins, then the
one with the **shortest path**. Such links are reported as ambiguous.

`[[#Heading]]` links within the same note. A link that leads nowhere yet is shown differently;
selecting it in the preview offers **Create note** (next to the current one) or **Create concept**.

**Backlinks** (the Backlinks tab) list every note that links here, with the line containing the link.
The **Graph** tab shows the note's neighbourhood in the [knowledge graph](./graph.md#6-local-graphs).
**Unlinked mentions** finds the note's name, title or aliases written as plain words in other notes
(never inside code, comments or existing links); **Link** turns a mention into `[[…]]`.

## 3. Properties (frontmatter)

A YAML block at the very top of a note:

```yaml
---
title: Consensus overview        # optional; otherwise the file name is the title
type: lecture-notes              # note, lecture-notes, summary, revision, concept, journal, …
tags: [distributed-systems, consensus]
aliases: [Consensus notes]
module: COC251
lecture: COC251/L03
created: 2026-10-04
---
```

The **Properties** tab edits these with ordinary fields and keeps every other key. Changes touch only
the lines of the keys you edit: comments, quoting, list style and the order of other keys stay exactly
as they were. If the YAML is invalid, the note still opens and the problem is shown; properties can
then be fixed with **Edit YAML** or in the editor.

`module` and `lecture` file the note under a module and a lecture of [your course](./course.md)
(`lecture: L03` is enough when `module` is given). Attaching a note on a lecture page writes them.

## 4. Note ids

Other data (flashcards, concepts, study plans in later versions) refers to notes by an id such as
`note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7`, so that renaming or moving a note never breaks those references.

- By default the id lives **only in the app's index** until something needs to refer to the note; then
  it is written into the note as an `id:` property. Notes you never use that way are never changed.
- **Settings › Notes › Note ids › Every note** writes an id into every note when it is first indexed.
- If a note already uses `id` for something else (a Zettelkasten number, say), that value is left alone
  and the app uses **`skb-id`** instead.
- If you copy a note that has an id, the copy gets a new id the next time it is indexed (the original
  keeps its own).
- Do not edit or remove ids by hand; everything else in the file is yours.

## 5. Templates

Notes in the **Templates** folder (configurable in Settings › Notes) can be used in **New note**. These
placeholders are filled in:

| Placeholder | Becomes |
|---|---|
| `{{title}}` | the new note's title |
| `{{date}}`, `{{time}}` | today's date (`2026-10-07`) and time (`14:05`) |
| `{{date:dddd D MMMM YYYY}}` | a formatted date, e.g. `Wednesday 7 October 2026` (Moment-style tokens; text in `[brackets]` is literal) |
| `{{module}}`, `{{lecture}}` | the module and lecture entered in the dialogue (also written as properties) |

The template's own id is never copied into new notes.

## 6. Attachments and embeds

Paste or drop images and files into the editor to upload them into the **Attachments** folder
(configurable); an embed such as `![[photo.png]]` is inserted where you dropped them. In the preview,
images are shown (`![[photo.png|300]]` sets the width), PDFs open in a viewer (`#page=3` jumps to a
page), audio and video get players, and other files become download links.

Images from the internet are **not loaded** in the preview — the app never contacts other sites on
your behalf — and are shown as a link instead.

## 7. Editing, saving and edits made elsewhere

- Changes are saved about a second after you stop typing; **Ctrl+S** saves at once. The status next to
  the view switcher shows *Saved*, *Unsaved changes* or *Saving…*.
- **Edit**, **Split** and **Preview** switch between the editor, both side by side, and the rendered
  note (**Ctrl+E** switches between reading and editing). In a narrow pane the names give way to
  their icons, and the three study buttons (make a card, generate, suggest links) to one ✨ menu.
- **Live preview** (the ¶ button, on unless you turn it off): the editor hides the marks of Markdown —
  a heading's `#`, the `**` and `_` of emphasis, `~~`, the backticks of inline code, a link's brackets
  and address — wherever the cursor is not, so the note reads as it will look. Move the cursor into a
  line or a link and its marks come back to be edited. Only the display changes, never the file;
  `[[wikilinks]]` are always shown as written. Front matter at the top is shown small and grey.
- If the note is changed **outside the editor** (Obsidian, VS Code, a sync tool) while you have no
  unsaved changes, the editor quietly shows the new version.
- If it changes while you **do** have unsaved changes, nothing is overwritten: a banner offers
  **Compare**, **Reload from disk** (use theirs) or **Keep my version**. The same happens if the save
  itself finds the file changed.
- Line endings (Windows `CRLF` or `LF`) and a byte-order mark are kept as they were. Files that are not
  UTF-8 text, or larger than about 5 MB, open read-only.

## 8. Tabs, panes and the file menus

The Notes page works like Obsidian's: the Files pane on the left, your notes in tabs in the middle, and
the **Details** panel on the right when you want it.

- **The vault** you are in is named at the foot of the Files pane. Its menu opens a recent vault,
  **Open folder as vault…** (in the desktop app with the system's folder picker; an Obsidian vault
  works as it is), shows or copies the vault's folder, and **Manage vaults…** goes to Settings. If the
  vault cannot be read it says *No vault open*. An empty vault says so in the middle of the page and
  offers to write the first note or open another folder.
- **The Files pane** toolbar: new note, new folder, **Change sort order** (file name A to Z or Z to A,
  modified or created time new to old or old to new — folders always by name), show or hide
  attachments, and one button that is **Expand all** when every folder is closed and **Collapse all**
  otherwise. Bookmarked notes and folders are listed above the tree.
- **Tabs.** Clicking a note opens it in the current tab; **Ctrl+click** (or a middle click) opens it in
  a new one. **+** opens an empty tab; **×** or a middle click on a tab closes it, and anything typed
  in it is saved as it closes. Tabs can be dragged into another order and have their own right-click
  menu (Close, Close others, Split right, Split down). The address always shows the note of the
  active tab, so Back and links work as before, and your tabs are remembered in this browser (the
  desktop app has its own).
- **Two panes**: **Split right** or **Split down** (in a note's ⋮ menu or a tab's menu), or **Open to
  the right** from the file tree, opens a note in a second pane beside or below the first. A note can
  be open in both; what is typed in one appears in the other once it is saved. Closing a pane's last
  tab closes the pane.
- **Details** (the panel button at the top right; closed until you open it) shows the note in the
  active pane: its **Outline**, **Backlinks**, **Outgoing** links, **Properties** and local **Graph**.
- **More options (⋮)** on a note has Obsidian's commands: backlinks at the foot of the note, reading
  view, source mode (live preview off), split right or down, open in a new window, rename, move to a
  folder, bookmark, merge with another note, add a property, export to PDF, find and replace, copy its
  path, version history, open a linked view, open it in its default application, show it in Explorer,
  reveal it in the file tree, and delete it.
- **The file tree's right-click menu** offers the same for files (open in a new tab, to the right or in
  a new window, make a copy, move, bookmark, merge, copy path, version history, open in its default
  application, show in Explorer, rename, delete) and new note, new folder, move, bookmark, copy path,
  rename and delete for folders.

What some of them do:

- **Make a copy** puts *Name 1.md* beside the note. The copy is a new note: it never keeps the
  original's `id`.
- **Merge entire file with…** adds the note's text (not its properties) to the end of the note you
  choose, changes every link to it into a link to that note (headings and display text kept), and
  moves it to the trash, from where it can be restored. The other note keeps its previous text in its
  version history.
- **Open version history**: the text a save replaced is kept as a version, at most one every five
  minutes, for 30 days, in `.skb/history/versions/` inside the vault (plain text files). Each version
  can be read whole or as its changes against the note now, and restored; restoring keeps the current
  text as a version first, and a restore can be undone from its message. Edits made in other programs
  are not versioned.
- **Export to PDF…** prints the note as the reading view shows it. The desktop app asks where to save
  the PDF; a browser opens its print dialogue, where *Save as PDF* is one of the printers.
- **Open in new window** shows the note in a window of its own, without the sidebar or the file list.
- **Open in default app** and **Show in system explorer** are for the desktop app; in a browser an
  attachment opens in a tab of its own instead.

## 9. Renaming, moving and the trash

- In the file tree: **F2** (or right-click › Rename…) renames in place; **Rename…** in a note's ⋮
  menu asks for the new name. Drag a note or folder onto a folder to move it, or choose **Move file
  to…** and type the folder's name.
- When a rename or move would make links point somewhere else, you are shown how many links in which
  notes, and can **update links and move** or move without updating. Wikilinks are rewritten to the
  shortest name that still finds the note; Markdown links get a correct relative path. Only links that
  would otherwise break or change meaning are touched.
- **Delete** (or right-click › Delete) moves a note, folder or attachment into the trash
  (`.skb/trash` inside your vault). **Trash** in the Files pane lists everything with its expiry date
  (30 days by default) and restores it to where it was, with the same note id.

## 10. Which files are notes

- Every `.md` file is a note, except inside `Sources/` (imported originals) and the folders below.
- Never indexed: `.skb/` (the app's data), `.obsidian/`, `.trash/`, `.git/`, `node_modules/`, and any
  hidden file or folder (name starting with `.`).
- **Settings › Notes › Leave out of the index** adds your own patterns, one per line: a name matches at
  any depth (`drafts`), a leading `/` anchors it to the vault (`/Archive`), a trailing `/` means a
  folder (`build/`), and `*`, `?` and `**` are wildcards (`*.excalidraw.md`).
- Other files (images, PDFs, …) are attachments: they can be linked and embedded.

## 11. Differences from Obsidian

The vault stays fully usable in Obsidian; opening it here changes no file (only `id` lines, and only
when something needs them). Behaviour differs in a few places (ADR-0026):

| Here | Obsidian |
|---|---|
| A frontmatter `title` also works as a link target | Only file names and aliases |
| Images from the internet are not loaded in the preview | Loaded |
| `[[Note#^block]]` opens the note (block positions are not tracked yet) | Scrolls to the block |
| An id may be added as `id:` (or `skb-id:`) to notes other data refers to | — |

## 12. Keyboard

Press `?` (or `Ctrl+/`) anywhere for the cheat sheet: the shortcuts that work everywhere, then the keys
of each page.

| Keys | Where | Action |
|---|---|---|
| `Ctrl+S` | Editor | Save now |
| `Ctrl+Click` on a wikilink | Editor | Open the linked note |
| `[[` / `#` | Editor | Complete a note or concept name / a tag (`Enter` accepts) |
| `Esc`, then `Tab` | Editor | Move focus out of the editor (`Ctrl+M` toggles Tab moving focus) |
| `Tab` / `Shift+Tab` | Editor | Indent / outdent |
| `Ctrl+F` / `Ctrl+H` | Editor | Find / replace |
| `Ctrl+E` | Notes | Switch between reading and editing |
| `↑` `↓` `←` `→`, `Home`, `End` | File tree | Move, open and close folders |
| `Enter` | File tree | Open the note or folder |
| `Ctrl+Click` or a middle click | File tree | Open the note in a new tab |
| `F2` / `Delete` | File tree | Rename / move to the trash |
| Typing letters | File tree | Jump to a matching name |
| `Shift+F10` or the Menu key | File tree | Context menu |
