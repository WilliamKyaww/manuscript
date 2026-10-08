# Notes and Markdown

Your notes are ordinary Markdown files in your vault folder. You can edit them here, in Obsidian, in
VS Code or in any text editor — Study Knowledge Base picks up changes made elsewhere within about a
second. This page describes the Markdown it understands and how notes behave.

## Contents

1. [The Markdown dialect](#1-the-markdown-dialect)
2. [Links and how they are resolved](#2-links-and-how-they-are-resolved)
3. [Properties (frontmatter)](#3-properties-frontmatter)
4. [Note ids](#4-note-ids)
5. [Templates](#5-templates)
6. [Attachments and embeds](#6-attachments-and-embeds)
7. [Editing, saving and edits made elsewhere](#7-editing-saving-and-edits-made-elsewhere)
8. [Renaming, moving and the trash](#8-renaming-moving-and-the-trash)
9. [Which files are notes](#9-which-files-are-notes)
10. [Differences from Obsidian](#10-differences-from-obsidian)
11. [Keyboard](#11-keyboard)

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
4. an **attachment** called `Raft` (for file names with an extension, such as `diagram.png`).

For a target with a folder, such as `[[COC251/Paxos]]` or `[x](../Paxos.md)`:

1. relative to the linking note's folder;
2. from the top of the vault (a leading `/` means only this: `[[/Paxos]]`);
3. any note whose path ends with it (`COC251/Paxos` finds `Modules/COC251/Paxos.md`).

When several notes match at the same step, a note **in the linking note's own folder** wins, then the
one with the **shortest path**. Such links are reported as ambiguous.

`[[#Heading]]` links within the same note. A link to a note that does not exist yet is shown
differently; selecting it in the preview creates the note next to the current one.

**Backlinks** (the Backlinks tab) list every note that links here, with the line containing the link.
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
  note. **Outline** jumps to headings.
- If the note is changed **outside the editor** (Obsidian, VS Code, a sync tool) while you have no
  unsaved changes, the editor quietly shows the new version.
- If it changes while you **do** have unsaved changes, nothing is overwritten: a banner offers
  **Compare**, **Reload from disk** (use theirs) or **Keep my version**. The same happens if the save
  itself finds the file changed.
- Line endings (Windows `CRLF` or `LF`) and a byte-order mark are kept as they were. Files that are not
  UTF-8 text, or larger than about 5 MB, open read-only.

## 8. Renaming, moving and the trash

- In the file tree: **F2** (or right-click › Rename) renames; drag a note or folder onto a folder to
  move it.
- When a rename or move would make links point somewhere else, you are shown how many links in which
  notes, and can **update links and move** or move without updating. Wikilinks are rewritten to the
  shortest name that still finds the note; Markdown links get a correct relative path. Only links that
  would otherwise break or change meaning are touched.
- **Delete** (or right-click › Move to trash) moves a note, folder or attachment into the trash
  (`.skb/trash` inside your vault). **Trash** in the Files pane lists everything with its expiry date
  (30 days by default) and restores it to where it was, with the same note id.

## 9. Which files are notes

- Every `.md` file is a note, except inside `Sources/` (imported originals) and the folders below.
- Never indexed: `.skb/` (the app's data), `.obsidian/`, `.trash/`, `.git/`, `node_modules/`, and any
  hidden file or folder (name starting with `.`).
- **Settings › Notes › Leave out of the index** adds your own patterns, one per line: a name matches at
  any depth (`drafts`), a leading `/` anchors it to the vault (`/Archive`), a trailing `/` means a
  folder (`build/`), and `*`, `?` and `**` are wildcards (`*.excalidraw.md`).
- Other files (images, PDFs, …) are attachments: they can be linked and embedded.

## 10. Differences from Obsidian

The vault stays fully usable in Obsidian; opening it here changes no file (only `id` lines, and only
when something needs them). Behaviour differs in a few places (ADR-0026):

| Here | Obsidian |
|---|---|
| A frontmatter `title` also works as a link target | Only file names and aliases |
| Images from the internet are not loaded in the preview | Loaded |
| `[[Note#^block]]` opens the note (block positions are not tracked yet) | Scrolls to the block |
| An id may be added as `id:` (or `skb-id:`) to notes other data refers to | — |

## 11. Keyboard

| Keys | Where | Action |
|---|---|---|
| `Ctrl+S` | Editor | Save now |
| `Ctrl+Click` on a wikilink | Editor | Open the linked note |
| `[[` / `#` | Editor | Complete a note name / a tag (`Enter` accepts) |
| `Esc`, then `Tab` | Editor | Move focus out of the editor (`Ctrl+M` toggles Tab moving focus) |
| `Tab` / `Shift+Tab` | Editor | Indent / outdent |
| `Ctrl+F` | Editor | Find and replace |
| `↑` `↓` `←` `→`, `Home`, `End` | File tree | Move, open and close folders |
| `Enter` | File tree | Open the note or folder |
| `F2` / `Delete` | File tree | Rename / move to the trash |
| Typing letters | File tree | Jump to a matching name |
| `Shift+F10` or the Menu key | File tree | Context menu |
