# User guides

Written for people using Manuscript, not for developers. Each guide is added when the
feature it describes is complete.

| Guide | Covers |
|---|---|
| [Searching and finding notes](./search.md) | The quick switcher (Ctrl+O), the command palette and full-text search (Ctrl+Shift+F): syntax, filters, ranking |
| [Notes and Markdown](./markdown.md) | The Markdown dialect, links and backlinks, properties, note ids, templates, attachments, saving and conflicts, renaming and the trash, which files are indexed, differences from Obsidian, keyboard shortcuts |

## Folder names after the rename

Manuscript was first called "Study Knowledge Base". If you used it before the rename, your vault is
still in `Documents\Study Knowledge Base` and your settings in `%APPDATA%\StudyKnowledgeBase`, and the
app keeps using them as long as no `Manuscript` folders exist. To move to the new names, close the
app (and `run-web.bat`), then rename `Documents\Study Knowledge Base` to `Documents\Manuscript` and
`%APPDATA%\StudyKnowledgeBase` to `%APPDATA%\Manuscript`. Nothing inside them needs to change.
