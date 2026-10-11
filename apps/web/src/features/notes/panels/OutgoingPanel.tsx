import type { NoteLink } from '@skb/core';
import { Link } from '@tanstack/react-router';
import { FileQuestion, FileText, Lightbulb, Paperclip } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Outgoing links (task 23.05, Obsidian's "outgoing links" view): what the note links to, as it was
 * last saved — notes, concepts and attachments, then the names that lead nowhere yet.
 */
export function OutgoingPanel({ links }: { links: readonly NoteLink[] }) {
  const notes = new Map<string, { path: string; count: number }>();
  const concepts = new Map<string, { name: string; count: number }>();
  const files = new Map<string, number>();
  const unresolved = new Map<string, number>();
  for (const link of links) {
    const { resolution } = link;
    if (resolution.kind === 'note') {
      const entry = notes.get(resolution.noteId) ?? { path: resolution.path, count: 0 };
      entry.count += 1;
      notes.set(resolution.noteId, entry);
    } else if (resolution.kind === 'concept') {
      const entry = concepts.get(resolution.conceptId) ?? { name: resolution.name, count: 0 };
      entry.count += 1;
      concepts.set(resolution.conceptId, entry);
    } else if (resolution.kind === 'attachment') {
      files.set(resolution.path, (files.get(resolution.path) ?? 0) + 1);
    } else if (link.target.trim() !== '') {
      unresolved.set(link.target, (unresolved.get(link.target) ?? 0) + 1);
    }
  }
  if (links.length === 0)
    return <p className="p-3 text-sm text-muted">This note does not link to anything yet.</p>;

  return (
    <div className="space-y-4 p-3 text-sm">
      {notes.size + concepts.size > 0 && (
        <Group title="Links">
          {[...notes].map(([id, entry]) => (
            <Row key={id} icon={<FileText size={14} />} count={entry.count}>
              <Link to="/notes/$noteId" params={{ noteId: id }} className="hover:underline">
                {entry.path.slice(entry.path.lastIndexOf('/') + 1).replace(/\.md$/i, '')}
              </Link>
            </Row>
          ))}
          {[...concepts].map(([id, entry]) => (
            <Row key={id} icon={<Lightbulb size={14} />} count={entry.count}>
              <Link
                to="/concepts/$conceptId"
                params={{ conceptId: id }}
                className="hover:underline"
              >
                {entry.name}
              </Link>
            </Row>
          ))}
        </Group>
      )}
      {files.size > 0 && (
        <Group title="Attachments">
          {[...files].map(([path, count]) => (
            <Row key={path} icon={<Paperclip size={14} />} count={count}>
              {path.slice(path.lastIndexOf('/') + 1)}
            </Row>
          ))}
        </Group>
      )}
      {unresolved.size > 0 && (
        <Group title="Not created yet">
          {[...unresolved].map(([target, count]) => (
            <Row key={target} icon={<FileQuestion size={14} />} count={count}>
              <span className="text-muted">{target}</span>
            </Row>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="eyebrow mb-1">{title}</h3>
      <ul className="space-y-1">{children}</ul>
    </section>
  );
}

function Row({ icon, count, children }: { icon: ReactNode; count: number; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className="flex shrink-0 text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count > 1 && <span className="text-xs text-subtle tabular-nums">×{count}</span>}
    </li>
  );
}
