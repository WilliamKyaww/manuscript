import { type ResurfaceItem, resurfaceEndpoint } from '@skb/core';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { BookMarked, Sparkles } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import type { ApiClient } from '../../lib/api/client';
import { useApi } from '../../lib/api/context';
import { usePractiseConcept } from '../progress/WeakAreas';

/**
 * Before it matters (task 15.08): the weak spots of a module just ahead of its next lecture, exam or
 * deadline, with the notes to reread. Shows nothing at all when there is nothing near.
 */

export const resurfaceQuery = (api: ApiClient) =>
  queryOptions({
    queryKey: ['learning', 'resurface'] as const,
    queryFn: () => api.request(resurfaceEndpoint, { query: {} }),
    staleTime: 60_000,
  });

const KIND_LABEL: Record<ResurfaceItem['kind'], string> = {
  lecture: 'Lecture',
  exam: 'Exam',
  deadline: 'Deadline',
};

const when = (days: number) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

export function ResurfaceWidget() {
  const api = useApi();
  const upcoming = useQuery(resurfaceQuery(api));
  const practise = usePractiseConcept();
  const items = upcoming.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card className="p-5 md:col-span-2" data-widget="resurface">
      <div className="mb-3 flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-md bg-surface-sunken text-muted simplified:bg-transparent"
        >
          <BookMarked size={18} />
        </span>
        <h2 className="text-base font-semibold">Before what’s next</h2>
      </div>
      <ul aria-label="Before what’s next" className="space-y-4">
        {items.map((item) => (
          <li key={`${item.kind}:${item.title}:${item.date}`}>
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <Badge tone={item.kind === 'exam' ? 'danger' : 'info'}>{KIND_LABEL[item.kind]}</Badge>
              {item.lectureId ? (
                <Link
                  to="/lectures/$lectureId"
                  params={{ lectureId: item.lectureId }}
                  className="underline"
                >
                  {item.title}
                </Link>
              ) : (
                item.title
              )}
              <span className="font-normal text-muted">{when(item.daysUntil)}</span>
            </p>
            <ul className="mt-1.5 space-y-1">
              {item.concepts.map((entry) => (
                <li key={entry.concept.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Link
                    to="/concepts/$conceptId"
                    params={{ conceptId: entry.concept.id }}
                    className="font-medium underline"
                  >
                    {entry.concept.name}
                  </Link>
                  <span className="text-xs text-muted">{entry.reason}</span>
                  <Button
                    size="sm"
                    disabled={practise.pending}
                    aria-label={`Practise ${entry.concept.name}`}
                    onClick={() => void practise.start(entry.concept.id)}
                  >
                    <Sparkles aria-hidden="true" size={14} /> Practise
                  </Button>
                </li>
              ))}
            </ul>
            {item.notes.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                Reread:{' '}
                {item.notes.map((note, index) => (
                  <span key={note.id}>
                    {index > 0 && ', '}
                    <Link to="/notes/$noteId" params={{ noteId: note.id }} className="underline">
                      {note.title}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
