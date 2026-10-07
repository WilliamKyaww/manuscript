import type { HeadingRef } from '@skb/core/markdown';
import { ListTree } from 'lucide-react';
import { EmptyState } from '../../../components/States';

/** The note's headings (task 3.16); selecting one moves the editor or the preview to it. */
export function OutlinePanel({
  headings,
  onSelect,
}: {
  headings: readonly HeadingRef[];
  onSelect(heading: HeadingRef): void;
}) {
  if (headings.length === 0) {
    return (
      <EmptyState
        icon={<ListTree size={20} />}
        title="No headings yet"
        description="Headings (lines starting with #) appear here as an outline."
      />
    );
  }
  const minimum = Math.min(...headings.map((heading) => heading.level));
  return (
    <nav aria-label="Outline" className="p-2">
      <ul className="text-sm">
        {headings.map((heading) => (
          <li key={`${heading.line}:${heading.slug}`}>
            <button
              type="button"
              onClick={() => onSelect(heading)}
              className="w-full truncate rounded-sm py-1 pr-2 text-left text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-focus"
              style={{ paddingLeft: `${(heading.level - minimum) * 12 + 8}px` }}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
