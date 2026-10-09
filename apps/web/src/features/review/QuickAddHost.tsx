import { lazy, Suspense } from 'react';
import { useQuickAdd } from './quick-add';

/**
 * Shows the card editor when quick add is opened. Mounted once in the shell; the editor (and the
 * Markdown preview it uses) loads only on first use, so the shell stays small.
 */

const CardEditor = lazy(() =>
  import('./CardEditor').then((module) => ({ default: module.CardEditor })),
);

export function QuickAddHost() {
  const draft = useQuickAdd((state) => state.draft);
  const close = useQuickAdd((state) => state.close);
  if (!draft) return null;
  return (
    <Suspense fallback={null}>
      <CardEditor draft={draft} onClose={close} />
    </Suspense>
  );
}
