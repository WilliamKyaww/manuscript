import type { AskFilterSchema } from '@skb/core';
import { useRouterState } from '@tanstack/react-router';
import type { z } from 'zod';

/**
 * What the current page is about, offered as the Ask panel's default scope: the source being read,
 * the module, lecture or concept open — so "explain this" means this.
 */
export interface PageScope {
  label: string;
  filter: z.input<typeof AskFilterSchema>;
}

export function usePageScope(): PageScope | null {
  const match = useRouterState({
    select: (state) => {
      const last = state.matches.at(-1);
      return last
        ? { routeId: last.routeId as string, params: last.params as Record<string, string> }
        : null;
    },
    structuralSharing: true,
  });
  if (!match) return null;
  const { routeId, params } = match;
  if (routeId === '/library/$sourceId' && params.sourceId)
    return { label: 'this source', filter: { sourceIds: [params.sourceId] } };
  if (routeId === '/modules/$moduleId' && params.moduleId)
    return { label: 'this module', filter: { moduleId: params.moduleId } };
  if (routeId === '/lectures/$lectureId' && params.lectureId)
    return { label: 'this lecture', filter: { lectureId: params.lectureId } };
  if (routeId === '/concepts/$conceptId' && params.conceptId)
    return { label: 'this concept', filter: { conceptIds: [params.conceptId] } };
  return null;
}
