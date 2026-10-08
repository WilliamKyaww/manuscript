import type { SearchFilters, SourceKind } from '@skb/core';
import type { SqlValue } from '../../db/sqlite';

/** WHERE-clause fragments for search filters (aliases: `n` notes, `s` sources, `c` chunks). */

export interface Clauses {
  sql: string[];
  params: SqlValue[];
}

/** What a query may return: notes, and sources of these kinds (none when empty). */
export interface SearchScope {
  notes: boolean;
  sourceKinds: readonly SourceKind[];
}

export interface FilterInput {
  exclude: string | null;
  filters: SearchFilters;
  excludedFilters: SearchFilters;
  scope: SearchScope;
}

function folderParams(value: string): SqlValue[] {
  return [value.length + 1, `${value}/`];
}

function anyOf(
  into: Clauses,
  not: string,
  values: readonly string[],
  clause: string,
  toParams: (value: string) => SqlValue[],
): void {
  if (values.length === 0) return;
  into.sql.push(`${not}(${values.map(() => clause).join(' OR ')})`);
  for (const value of values) into.params.push(...toParams(value));
}

/** Note filters. Several tags must all apply; several types, folders or modules are alternatives. */
function noteFilters(filters: SearchFilters, negate: boolean, into: Clauses): void {
  const not = negate ? 'NOT ' : '';
  for (const tag of filters.tag) {
    // The tag itself or any nested tag: a range ("tag/" < t < "tag0") so the index is used.
    into.sql.push(
      `n.doc_id ${not}IN (SELECT doc_id FROM note_tags WHERE tag = ? OR (tag > ? AND tag < ?))`,
    );
    into.params.push(tag, `${tag}/`, `${tag}0`);
  }
  const value = (text: string) => [text];
  anyOf(into, not, filters.type, "lower(coalesce(n.type, '')) = lower(?)", value);
  anyOf(into, not, filters.module, "lower(coalesce(n.module_code, '')) = lower(?)", value);
  anyOf(into, not, filters.folder, 'lower(substr(n.path, 1, ?)) = lower(?)', folderParams);
}

/** Source filters: folders and modules apply; tags and types never match a source (see the service). */
function sourceFilters(filters: SearchFilters, negate: boolean, into: Clauses): void {
  const not = negate ? 'NOT ' : '';
  anyOf(into, not, filters.module, "lower(coalesce(s.module_code, '')) = lower(?)", (text) => [
    text,
  ]);
  anyOf(into, not, filters.folder, 'lower(substr(s.path, 1, ?)) = lower(?)', folderParams);
}

/** The clauses for the note half and the source half of a query. */
export function whereClauses(query: FilterInput): { note: Clauses; source: Clauses } {
  const note: Clauses = { sql: [], params: [] };
  noteFilters(query.filters, false, note);
  noteFilters(query.excludedFilters, true, note);
  if (query.exclude) {
    note.sql.push('n.doc_id NOT IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)');
    note.params.push(query.exclude);
  }
  const source: Clauses = {
    sql: [
      's.deleted_at IS NULL',
      's.missing_at IS NULL',
      `s.kind IN (${query.scope.sourceKinds.map(() => '?').join(', ')})`,
    ],
    params: [...query.scope.sourceKinds],
  };
  sourceFilters(query.filters, false, source);
  sourceFilters(query.excludedFilters, true, source);
  if (query.exclude) {
    source.sql.push('c.id NOT IN (SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH ?)');
    source.params.push(query.exclude);
  }
  return { note, source };
}

export const and = (clauses: Clauses) =>
  clauses.sql.length > 0 ? ` AND ${clauses.sql.join(' AND ')}` : '';
