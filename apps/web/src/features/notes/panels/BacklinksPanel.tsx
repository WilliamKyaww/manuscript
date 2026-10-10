import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Link2, Search } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/Button';
import { EmptyState, ErrorState, LoadingState } from '../../../components/States';
import { useApi } from '../../../lib/api/context';
import { notifySuccess } from '../../../lib/notify';
import { RelatedNotes } from '../../ai/RelatedNotes';
import { backlinksQuery, mentionsQuery, useLinkMention } from '../api';

/**
 * Backlinks (task 3.18): notes linking here, with the line containing each link, and — on request,
 * because it reads files — unlinked mentions of this note's name, title or aliases, each with a
 * one-step "Link" action — and, with semantic search set up, notes similar in meaning.
 */
export function BacklinksPanel({ noteId }: { noteId: string }) {
  const api = useApi();
  const linked = useQuery(backlinksQuery(api, noteId));
  const [showMentions, setShowMentions] = useState(false);
  const mentions = useQuery({ ...mentionsQuery(api, noteId), enabled: showMentions });
  const linkMention = useLinkMention(noteId);

  return (
    <div className="space-y-6 p-3 text-sm">
      <section aria-labelledby="backlinks-linked">
        <h3 id="backlinks-linked" className="eyebrow mb-2">
          Linked mentions
          {linked.data
            ? ` (${linked.data.linked.reduce((total, entry) => total + entry.mentions.length, 0)})`
            : ''}
        </h3>
        {linked.isPending && <LoadingState label="Loading backlinks" />}
        {linked.isError && (
          <ErrorState
            message="Backlinks could not be loaded."
            onRetry={() => void linked.refetch()}
          />
        )}
        {linked.data && linked.data.linked.length === 0 && (
          <p className="text-muted">No other note links here yet.</p>
        )}
        <ul className="space-y-3">
          {linked.data?.linked.map((entry) => (
            <li key={entry.source.id}>
              <Link
                to="/notes/$noteId"
                params={{ noteId: entry.source.id }}
                className="font-medium text-accent hover:underline"
              >
                {entry.source.title}
              </Link>
              <ul className="mt-1 space-y-1">
                {entry.mentions.map((mention) => (
                  <li key={`${mention.line}:${mention.column}`}>
                    <Link
                      to="/notes/$noteId"
                      params={{ noteId: entry.source.id }}
                      search={{ line: mention.line }}
                      className="block rounded-sm border-l-2 border-border px-2 py-1 text-muted hover:border-accent hover:bg-surface-hover hover:text-text"
                    >
                      {mention.context || '(empty line)'}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="backlinks-unlinked">
        <h3 id="backlinks-unlinked" className="eyebrow mb-2">
          Unlinked mentions
        </h3>
        {!showMentions && (
          <Button size="sm" onClick={() => setShowMentions(true)}>
            <Search aria-hidden="true" size={14} />
            Find unlinked mentions
          </Button>
        )}
        {showMentions && mentions.isPending && <LoadingState label="Searching notes" />}
        {showMentions && mentions.isError && (
          <ErrorState
            message="Unlinked mentions could not be found."
            onRetry={() => void mentions.refetch()}
          />
        )}
        {mentions.data && mentions.data.mentions.length === 0 && (
          <EmptyState
            title="No unlinked mentions"
            description="No other note mentions this one without linking to it."
          />
        )}
        <ul className="space-y-3">
          {mentions.data?.mentions.map((entry) => (
            <li key={entry.source.id}>
              <Link
                to="/notes/$noteId"
                params={{ noteId: entry.source.id }}
                className="font-medium text-accent hover:underline"
              >
                {entry.source.title}
              </Link>
              <ul className="mt-1 space-y-1">
                {entry.matches.map((match) => (
                  <li
                    key={match.offset}
                    className="flex items-start gap-2 rounded-sm border-l-2 border-border px-2 py-1"
                  >
                    <span className="min-w-0 flex-1 text-muted">{match.context}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Link “${match.text}” in ${entry.source.title}`}
                      loading={
                        linkMention.isPending && linkMention.variables?.offset === match.offset
                      }
                      onClick={() =>
                        linkMention.mutate(
                          {
                            sourceId: entry.source.id,
                            sourceHash: entry.sourceHash,
                            offset: match.offset,
                            text: match.text,
                          },
                          {
                            onSuccess: (result) =>
                              notifySuccess('Linked', `${result.link} in ${result.source.title}`),
                          },
                        )
                      }
                    >
                      <Link2 aria-hidden="true" size={14} />
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        {mentions.data?.truncated && (
          <p className="mt-2 text-xs text-muted">Showing the first 50 notes with mentions.</p>
        )}
      </section>
      <RelatedNotes noteId={noteId} />
    </div>
  );
}
