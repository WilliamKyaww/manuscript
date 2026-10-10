import type { Mention } from '@skb/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useApi } from '../../lib/api/context';
import { conceptsQuery } from '../concepts/api';
import { moduleQuery, modulesQuery } from '../learning/api';
import { sourcesQuery } from '../library/api';
import { treeQuery } from '../notes/api';

/**
 * What can be @mentioned in a message (task 13.08): notes, concepts, modules, lectures and
 * sources, from the lists the rest of the app already loads. Only fetched while the menu is open.
 */

export interface MentionOption extends Mention {
  /** A second line that tells similar names apart ("CS301 · lecture"). */
  hint: string;
}

const LIMIT = 8;

export function useMentionOptions(query: string | null): MentionOption[] {
  const api = useApi();
  const enabled = query !== null;
  const notes = useQuery({ ...treeQuery(api), enabled });
  const concepts = useQuery({ ...conceptsQuery(api), enabled });
  const modules = useQuery({ ...modulesQuery(api), enabled });
  const sources = useQuery({ ...sourcesQuery(api), enabled });
  const details = useQueries({
    queries: (modules.data?.modules ?? []).map((module) => ({
      ...moduleQuery(api, module.id),
      enabled,
    })),
  });

  const all = useMemo<MentionOption[]>(
    () => [
      ...(modules.data?.modules ?? []).map((module) => ({
        kind: 'module' as const,
        id: module.id,
        label: `${module.code} ${module.title}`,
        hint: 'module',
      })),
      ...details.flatMap((detail) =>
        (detail.data?.lectures ?? []).map((lecture) => ({
          kind: 'lecture' as const,
          id: lecture.id,
          label: `${detail.data?.code ?? ''} ${lecture.key} ${lecture.title}`.trim(),
          hint: 'lecture',
        })),
      ),
      ...(notes.data?.notes ?? []).map((note) => ({
        kind: 'note' as const,
        id: note.id,
        label: note.title,
        hint: note.path,
      })),
      ...(concepts.data?.concepts ?? []).map((concept) => ({
        kind: 'concept' as const,
        id: concept.id,
        label: concept.name,
        hint: 'concept',
      })),
      ...(sources.data?.sources ?? []).map((source) => ({
        kind: 'source' as const,
        id: source.id,
        label: source.title,
        hint: 'source',
      })),
    ],
    [notes.data, concepts.data, modules.data, sources.data, details],
  );

  return useMemo(() => {
    if (query === null) return [];
    const needle = query.toLowerCase();
    const starts: MentionOption[] = [];
    const contains: MentionOption[] = [];
    for (const option of all) {
      const label = option.label.toLowerCase();
      if (label.startsWith(needle)) starts.push(option);
      else if (label.includes(needle)) contains.push(option);
      if (starts.length >= LIMIT) break;
    }
    return [...starts, ...contains].slice(0, LIMIT);
  }, [all, query]);
}
