import { type ConceptNoteFile, conceptNotes, graphEndpoint } from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';
import type { ConceptsService } from '../concepts/service';
import type { GraphService } from '../graph/service';

/**
 * Every concept as a Markdown note (task 16.03), with the accepted relations between concepts as
 * links. Used for the copy in an export and for writing the notes into the vault.
 */
export function conceptFiles(
  db: SqlDatabase,
  concepts: ConceptsService,
  graph: GraphService,
  folder: string,
): ConceptNoteFile[] {
  const codes = new Map(
    db
      .all<{ id: string; code: string }>('SELECT id, code FROM modules')
      .map((row) => [row.id, row.code]),
  );
  const { edges } = graph.graph(
    graphEndpoint.schemas.query.parse({ types: 'concept', status: 'accepted', limit: 20_000 }),
  );
  return conceptNotes(
    concepts.list().map((concept) => ({
      id: concept.id,
      name: concept.name,
      summary: concept.summary,
      aliases: concept.aliases,
      modules: concept.moduleIds.flatMap((id) => codes.get(id) ?? []),
    })),
    edges,
    folder,
  );
}
