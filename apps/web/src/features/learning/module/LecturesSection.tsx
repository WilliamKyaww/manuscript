import type { Lecture } from '@skb/core';
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { StickySection } from '../../../components/Page';
import { formatCount } from '../../../lib/format';
import { LectureDialog } from '../dialogs';
import { formatDue } from '../format';

/** The next free key in the module's style, e.g. after L01 and L02 comes L03. */
export function nextLectureKey(lectures: readonly Lecture[]): string {
  const numbers = lectures
    .map((lecture) => /^L(\d+)$/i.exec(lecture.key)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  const next = (numbers.length > 0 ? Math.max(...numbers) : 0) + 1;
  return `L${String(next).padStart(2, '0')}`;
}

export function LecturesSection({
  moduleId,
  lectures,
}: {
  moduleId: string;
  lectures: readonly Lecture[];
}) {
  const [adding, setAdding] = useState(false);
  return (
    <StickySection
      title="Lectures"
      description="Lectures, labs and tutorials, each with its slides and notes."
      actions={
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" size={14} />
          Add lecture
        </Button>
      }
    >
      {lectures.length === 0 ? (
        <p className="text-sm text-muted">No lectures yet.</p>
      ) : (
        <ol
          aria-label="Lectures"
          className="divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {lectures.map((lecture) => (
            <li key={lecture.id}>
              <Link
                to="/lectures/$lectureId"
                params={{ lectureId: lecture.id }}
                className="flex items-center gap-3 px-3 py-2 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus"
              >
                <span className="w-12 shrink-0 font-mono text-xs text-muted">{lecture.key}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{lecture.title}</span>
                {lecture.kind !== 'lecture' && <Badge>{lecture.kind}</Badge>}
                <span className="shrink-0 text-xs text-muted">
                  {[
                    lecture.week !== null ? `Week ${lecture.week}` : null,
                    lecture.heldOn ? formatDue(lecture.heldOn) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="shrink-0 text-xs text-subtle">
                  {formatCount(lecture.sourceCount, 'source')} ·{' '}
                  {formatCount(lecture.noteCount, 'note')}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {adding && (
        <LectureDialog
          open
          moduleId={moduleId}
          suggestedKey={nextLectureKey(lectures)}
          onClose={() => setAdding(false)}
        />
      )}
    </StickySection>
  );
}
