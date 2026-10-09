import { LinkResolver } from '@skb/core/markdown';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useApi } from '../../../lib/api/context';
import { conceptsQuery } from '../../concepts/api';
import { treeQuery } from '../api';
import type { PreviewTarget } from './remark-obsidian';

/**
 * Resolves `[[links]]` for Markdown shown outside a note (concept summaries, flashcards): notes,
 * then concepts, then attachments, as everywhere else (ADR-0029).
 */
export function useLinkResolve(): (target: string) => PreviewTarget {
  const api = useApi();
  const tree = useQuery(treeQuery(api));
  const concepts = useQuery(conceptsQuery(api));
  const resolver = useMemo(
    () =>
      new LinkResolver(
        tree.data?.notes ?? [],
        tree.data?.attachments ?? [],
        concepts.data?.concepts ?? [],
      ),
    [tree.data, concepts.data],
  );
  return useCallback(
    (target: string): PreviewTarget => {
      const result = resolver.resolve(target);
      if (result.kind === 'note') return { kind: 'note', id: result.noteId, path: result.path };
      if (result.kind === 'concept')
        return { kind: 'concept', id: result.conceptId, name: result.name };
      return { kind: 'unresolved' };
    },
    [resolver],
  );
}
