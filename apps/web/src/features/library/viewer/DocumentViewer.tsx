import type { SourceSection, SourceSummary } from '@skb/core';
import { LinkResolver } from '@skb/core/markdown';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pane } from '../../../components/Pane';
import { useApi } from '../../../lib/api/context';
import { cn } from '../../../lib/cn';
import { conceptsQuery } from '../../concepts/api';
import { treeQuery } from '../../notes/api';
import { MarkdownPreview } from '../../notes/preview/MarkdownPreview';
import type { PreviewTarget } from '../../notes/preview/remark-obsidian';

/**
 * Word, Markdown and text sources (task 5.18): the document's sections with an outline. Word and
 * Markdown sections are Markdown-style text and are rendered like notes (links into the vault
 * work); plain text is shown as it is. `?section=4` scrolls to a section.
 */

export function DocumentViewer({
  source,
  sections,
  section,
  onNavigate,
}: {
  source: SourceSummary;
  sections: readonly SourceSection[];
  section: number | undefined;
  onNavigate(section: number): void;
}) {
  const api = useApi();
  const tree = useQuery(treeQuery(api));
  const concepts = useQuery(conceptsQuery(api));
  const main = useRef<HTMLDivElement>(null);
  const resolver = useMemo(
    () =>
      new LinkResolver(
        tree.data?.notes ?? [],
        tree.data?.attachments ?? [],
        concepts.data?.concepts ?? [],
      ),
    [tree.data, concepts.data],
  );
  const mediaTypes = useMemo(
    () => new Map((tree.data?.attachments ?? []).map((file) => [file.path, file.mediaType])),
    [tree.data],
  );
  const resolve = useCallback(
    (target: string): PreviewTarget => {
      const result = resolver.resolve(target, source.path);
      if (result.kind === 'note') return { kind: 'note', id: result.noteId, path: result.path };
      if (result.kind === 'attachment') {
        return {
          kind: 'attachment',
          path: result.path,
          mediaType: mediaTypes.get(result.path) ?? 'application/octet-stream',
        };
      }
      if (result.kind === 'concept')
        return { kind: 'concept', id: result.conceptId, name: result.name };
      return { kind: 'unresolved' };
    },
    [resolver, mediaTypes, source.path],
  );

  useEffect(() => {
    if (section === undefined) return;
    main.current?.querySelector(`[data-section="${section}"]`)?.scrollIntoView({ block: 'start' });
  }, [section]);

  const plain = source.kind === 'text';
  return (
    <>
      <Pane title="Contents" className="hidden w-64 flex-none border-r border-border md:flex">
        <ol aria-label="Contents" className="space-y-0.5 p-2">
          {sections.map((entry) => (
            <li key={entry.ordinal}>
              <button
                type="button"
                onClick={() => onNavigate(entry.ordinal)}
                aria-current={entry.ordinal === section ? 'true' : undefined}
                style={{
                  paddingLeft: `${0.5 + Math.max(0, entry.headingPath.length - 1) * 0.75}rem`,
                }}
                className={cn(
                  'block w-full truncate rounded-md py-1.5 pr-2 text-left text-sm',
                  'hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus',
                  entry.ordinal === section && 'bg-accent-subtle',
                  entry.headingPath.length === 0 && 'text-muted',
                )}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ol>
      </Pane>
      <Pane title="Document" className="min-w-0 flex-1">
        <div ref={main} className="mx-auto max-w-3xl space-y-6 p-6">
          {sections.map((entry) => (
            <section
              key={entry.ordinal}
              data-section={entry.ordinal}
              aria-label={entry.label}
              className={cn(
                'scroll-mt-4 rounded-lg',
                entry.ordinal === section && 'ring-2 ring-accent/30 ring-offset-4 ring-offset-bg',
              )}
            >
              {plain ? (
                <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
                  {entry.text}
                </pre>
              ) : (
                <MarkdownPreview content={entry.text} resolve={resolve} noteId={source.id} />
              )}
            </section>
          ))}
        </div>
      </Pane>
    </>
  );
}
