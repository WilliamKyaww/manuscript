import type { ExportManifest } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';
import { CANONICAL_TABLES, columnsOf, DERIVED_TABLES } from './tables';

/**
 * The two documents an export carries so that it can be understood without the application: a README
 * that says what is where, and a description of every table file. Both are plain Markdown.
 */

export function readmeText(manifest: ExportManifest): string {
  const counts = manifest.counts;
  return `# Manuscript export

Made on ${manifest.exportedAt} by Manuscript ${manifest.appVersion}, from the vault “${manifest.vault.name}”.

This is everything the application knows about your study, in open formats. You do not need
Manuscript to read any of it.

## What is here

| Path | What it is |
|---|---|
| \`vault/\` | Your vault as it is on disk: ${counts.notes} notes as Markdown (Obsidian-compatible), and ${counts.files - counts.notes} other files — the original slides, PDFs and documents in \`vault/Sources/\`, attachments and the rest. Open this folder in any editor. |
| \`data/*.json\` | One file per table of your own data: modules, lectures, concepts, relations, flashcards and their schedules, every review and answer, questions, quizzes, the Inbox, chats, study plans. Plain JSON arrays of objects. \`docs/schema.md\` says what every column means. |
| \`data/note-ids.json\` | The identifier of each note, so that links by identifier survive a restore. |
| \`data/files.json\` | The size and last-modified time of each file in \`vault/\`, so that a restore can check that the archive is whole and put the times back. |
| \`anki/*.txt\` | Each flashcard set as tab-separated text that Anki imports (File → Import). |
| \`concepts/*.md\` | Each concept as a Markdown note: its summary, aliases and modules, and its relations as links. |
| \`questions/\` | The question bank as JSON, and each quiz as Markdown with its answer key. |
| \`graph/graph.json\` | The knowledge graph as node-link JSON (NetworkX, D3 and Graphify read this shape). |
| \`graph/graph.graphml\` | The same graph as GraphML (Gephi, yEd, Cytoscape). |
| \`docs/schema.md\` | The structure of the data files. |
| \`manifest.json\` | The version and the counts, used to check an archive before restoring it. |

## What is not here, and why

${DERIVED_TABLES.map(([name, how]) => `- ${name} — ${how}.`).join('\n')}

Your AI provider keys are never exported; they live outside the vault and are not part of your data.

## Restoring

In Manuscript: Settings → Data → Restore from an export, choose this archive and an empty folder.
Without Manuscript: copy \`vault/\` anywhere — it is your notes and your originals, in full.
`;
}

export function createSchemaDocument(db: SqlDatabase): string {
  const lines = [
    '# Data files',
    '',
    `Each file in \`data/\` is a JSON array with one object per row; the keys are the column names below.`,
    'Timestamps are ISO 8601 in UTC. Booleans are 0 or 1. Columns holding JSON (`*_json`, `config`, `value`)',
    'are strings that contain JSON. Binary values appear as `{"$base64": "…"}`.',
    '',
    'Identifiers are prefixed ULIDs (`concept_01J…`) and are stable: other files refer to them.',
    '',
  ];
  for (const table of CANONICAL_TABLES) {
    const columns = columnsOf(db, table.name);
    lines.push(`## ${table.name}`, '', table.about, '');
    lines.push(
      columns.map((column) => `- \`${column.name}\`${column.pk > 0 ? ' (key)' : ''}`).join('\n'),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}
