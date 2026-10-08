# Lecture material: the library

The **Library** (sidebar, or `/library`) holds the material you study from — lecture slides, PDFs,
handouts, coursework briefs. Manuscript keeps every original exactly as you imported it, reads its
text, and makes that text searchable down to the page or slide it came from.

## Importing

- **Import files** (top right) opens a file picker; several files can be chosen at once.
- Or **drop files anywhere on the Library page**.
- Type a **module** (for example `COC251`) in the box beside the button first, and the files are filed
  under that module; leave it empty and they go to the inbox. The box remembers the last module.

Each original is copied, unchanged, into your vault:

```text
<vault>/Sources/COC251/Lecture 03 - Consensus.pdf     with a module
<vault>/Sources/Inbox/handout.docx                    without one
```

Names are made safe for every operating system (for example `:` becomes `-`) and never overwrite
anything: a second file with the same name becomes `week2 1.pptx`. Importing **the same file again**
(byte for byte, whatever it is called) is recognised and nothing is copied twice.

A source filed under a module appears on that module's page (**Modules**), and can be attached to one
of its lectures (see [your course](./course.md#4-lectures)).

The text is then extracted **in the background** — the list shows the progress, and you can keep
working. A 40-slide lecture takes about a second; a long PDF a few seconds.

## Supported formats

| Format | What is read | Where results point |
|---|---|---|
| **PDF** (`.pdf`) | The text of every page | The page (`p. 12`) |
| **PowerPoint** (`.pptx`) | Each slide's title and text (also tables and grouped shapes) **and the speaker notes**, in presentation order | The slide, or its notes |
| **Word** (`.docx`) | Headings, paragraphs, lists and tables; tracked deletions are left out | The section (heading) |
| **Markdown** (`.md`) | Sections by heading | The section |
| **Text** (`.txt`) | All the text | The line |

Limits: files up to **200 MB**, PDFs up to **3,000 pages**, presentations up to **2,000 slides**.

Not supported (the import says why and what to do): old `.ppt` and `.doc` files (save them as `.pptx`
/ `.docx`), macro-enabled `.pptm` / `.docm`, password-protected PDFs (save an unprotected copy), and
files whose contents do not match their extension.

**Scanned PDFs and slides that are pictures** have no text to read. They are imported and can be
viewed, but not searched; the library says which pages have no text. Reading text from images (OCR)
is planned (Phase 11).

## Reading a source

Click a source to open it:

- **PDFs** show their pages with thumbnails, page navigation (`↑` `↓` buttons or type a page number)
  and zoom. Text can be selected and copied.
- **Slides** are shown as text — title, body and **speaker notes** for every slide — with a slide
  list. (Open the original in PowerPoint to see the slide design.)
- **Word, Markdown and text** files show their sections with a table of contents.

**Open original** opens the file itself (it downloads or opens in the browser's own viewer).

## Searching sources

Search (`Ctrl+Shift+F`) covers sources as well as notes. A source result shows where the passage is
(**Lecture 3 › p. 12**) and opens the source **at that page, slide or section** — a hit in speaker
notes opens the slide with its notes in view. Each page, slide or section appears once, with its best
matching passage.

| Write | Finds |
|---|---|
| `kind:note` | only notes |
| `kind:source` | only sources |
| `kind:pdf`, `kind:slides`, `kind:docx`, `kind:text` | one kind of source |
| `module:COC251` | notes and sources of a module |
| `folder:Sources/COC251` | sources in that folder |
| `-kind:pdf` | leave PDFs out |

Tag and type filters belong to notes, so a search with `tag:` or `type:` shows notes only. Words left
out with `-word` remove the *passages* that contain them, not whole documents.

## Working with the files directly

The library follows the `Sources` folder, so you can organise files in Explorer (or any other program):

- **Move or rename** a file inside `Sources` — the source moves with it (same source, no re-import).
  Moving it into `Sources/COC251/` files it under that module.
- **Edit or replace** a file — it is read again.
- **Copy a supported file into `Sources`** — it is added to the library and read automatically (an
  exact copy of a file that is already in the library is left alone).
- **Delete a file** — the source is marked *File missing* and leaves search; put the file back (or the
  same file anywhere in `Sources`) and it returns.

If the application's data (`.skb/`) is ever lost, the library is rebuilt from the `Sources` folder the
next time Manuscript starts — your originals are never only inside the application.

## Retrying and deleting

- A failed import shows the reason (for example "The PDF is damaged or is not really a PDF").
  **Retry** reads it again; replacing the file also triggers a retry.
- **Delete…** (in a source's `⋯` menu) moves the original to the trash. Restoring it from the trash
  (Notes › Trash) brings the source back.

## Coming later

- Importing web pages (backlog B-SO-01), recordings with transcripts (Phase 11) and images with text
  recognition (Phase 11).
- Making flashcards and questions from a page or a selection (Phases 8–9), and citations that open
  here (Phase 13).
