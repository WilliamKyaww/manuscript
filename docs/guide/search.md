# Searching and finding notes

Three ways to find a note, from fastest to most thorough:

| Press | Opens | Best for |
|---|---|---|
| `Ctrl+O` | **Quick switcher** | Jumping to a note whose name you know (or part of it) |
| `Ctrl+K` | **Command palette** | Pages, commands, and notes by name; "Search for …" |
| `Ctrl+Shift+F` | **Search** (also in the sidebar) | Finding notes — and lecture material — by what they say |

## Quick switcher

Type any part of a note's **file name, title or alias**: `raf` finds *Raft*, `bft` finds a note with
the alias *BFT*, `pms` finds *Paxos made simple*. Exact names come first, then names that start with
what you typed, then words inside names, then looser matches. Case and accents are ignored. Notes you
opened recently are listed when nothing is typed and get a small boost.

- `↑` `↓` choose, `Enter` opens.
- `Shift+Enter`, or the last row, **creates a note** with the typed name when no note has exactly that
  name.
- A slash also searches folders: `coc251/pax` finds `Modules/COC251/Paxos.md`.

## Search

Search looks through notes — titles, aliases, headings, tags and text — and through the text of the
slides, PDFs and documents in your [library](./sources.md), where a result opens the source at its
page, slide or section. Every word must appear, and each word
also matches longer words that start with it (`replic` finds *replication*). Words are matched by
their stem, so `election` also finds *elections*. Titles and aliases count most, then headings and
tags, then text.

| Write | Finds |
|---|---|
| `leader election` | notes containing both words |
| `"leader election"` | the exact phrase |
| `paxos OR raft` | either word (`OR` in capitals) |
| `-draft`, `-"view change"` | leaves out notes containing it |
| `tag:exam` or `#exam` | notes tagged *exam*, including nested tags such as *exam/week-3* |
| `type:summary` | notes whose `type` property is *summary* |
| `folder:COC251`, `folder:"Week 1"` | notes in that folder and its sub-folders (quote names with spaces) |
| `module:COC251` | notes whose `module` property is *COC251*, and sources filed under that module |
| `kind:note`, `kind:source`, `kind:pdf` | only notes, only sources, or one kind of source (`pdf`, `slides`, `docx`, `text`) |
| `-tag:draft`, `-folder:Archive` | any filter, turned round |

Filters combine: several `tag:` filters must **all** apply; several `type:`, `folder:`, `module:` or
`kind:` filters are alternatives (any of them). Tags and types belong to notes, so they leave sources
out. A search of filters only (`tag:exam`, `kind:pdf`) lists the matching notes and sources, newest
first.

The **Tag**, **Type**, **Folder** and **Kind** menus add filters for you; active filters appear as
chips you can remove. The search is part of the page's address (`/search?q=…`), so it can be
bookmarked and survives a reload.

Each result shows the title and the passage that matched, with the matching words highlighted.
Opening a note shows it **at the first line that matches**; opening a source passage shows the source
at its page, slide or section (a page, slide or section appears once, with its best passage).

Counting stops at 1,000 matches ("1000+ results"); **Show more results** keeps going.

Anything can be typed into the search box: punctuation, unbalanced quotes and words such as `NEAR` or
`AND` are searched for as ordinary text and never cause an error.

## Coming later

- Searching by meaning as well as by words, and a "related notes" panel (Phase 10, optional AI).
- Date filters and saved searches (backlog B-SE-01, B-KM-02).
