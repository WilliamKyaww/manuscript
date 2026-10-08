# User guides

Written for people using Manuscript, not for developers. Each guide is added when the
feature it describes is complete.

| Guide | Covers |
|---|---|
| [Searching and finding notes](./search.md) | The quick switcher (Ctrl+O), the command palette and full-text search (Ctrl+Shift+F): syntax, filters, ranking |
| [Lecture material: the library](./sources.md) | Importing slides, PDFs and documents, supported formats and limits, reading them, searching them down to the page or slide, organising the `Sources` folder by hand, retrying and deleting |
| [Your course](./course.md) | Courses, modules and their codes, assessments and the mark calculator, lectures and their material, topics, concepts and links to them, the Today widgets |
| [Notes and Markdown](./markdown.md) | The Markdown dialect, links and backlinks, properties, note ids, templates, attachments, saving and conflicts, renaming and the trash, which files are indexed, differences from Obsidian, keyboard shortcuts |

## Folder names after the rename

Manuscript was first called "Study Knowledge Base". If you used it before the rename, your vault is
still in `Documents\Study Knowledge Base` and your settings in `%APPDATA%\StudyKnowledgeBase`, and the
app keeps using them as long as no `Manuscript` folders exist. To move to the new names, close the
app (and `run-web.bat`), then rename `Documents\Study Knowledge Base` to `Documents\Manuscript` and
`%APPDATA%\StudyKnowledgeBase` to `%APPDATA%\Manuscript`. Nothing inside them needs to change.
