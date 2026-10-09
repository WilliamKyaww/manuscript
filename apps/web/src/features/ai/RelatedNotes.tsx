import { relatedNotesEndpoint } from '@skb/core';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';

/**
 * Notes closest in meaning to this one (task 10.11), from their embeddings: found without a request
 * to the provider. Shown only when semantic search is set up and this note has been embedded.
 */

export const relatedNotesQuery = (api: ApiClient, noteId: string) =>
  queryOptions({
    queryKey: ['ai', 'related', noteId] as const,
    queryFn: () => api.request(relatedNotesEndpoint, { params: { id: noteId } }),
    staleTime: 60_000,
  });

export function RelatedNotes({ noteId }: { noteId: string }) {
  const api = useApi();
  const related = useQuery(relatedNotesQuery(api, noteId));
  if (!related.data?.available) return null;
  return (
    <section aria-labelledby="related-notes">
      <h3
        id="related-notes"
        className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
      >
        Similar notes
      </h3>
      {related.data.notes.length === 0 ? (
        <p className="text-muted">No similar notes yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {related.data.notes.map((note) => (
            <li key={note.id} className="flex items-baseline gap-2">
              <Link
                to="/notes/$noteId"
                params={{ noteId: note.id }}
                className="min-w-0 flex-1 truncate hover:underline"
              >
                {note.title}
              </Link>
              <span className="text-xs text-muted tabular-nums">
                {Math.round(note.score * 100)} %
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
