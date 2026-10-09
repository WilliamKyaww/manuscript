import { type AiSettings, AUTO_ACCEPT_KINDS, type AutoAcceptKind } from '@skb/core';
import { notifyError } from '../../../lib/notify';
import { useAiActions } from '../api';

/**
 * Auto-accept (task 11.13): what the AI generates waits in the Inbox for your decision, unless you
 * choose to let a kind straight in. All off by default; each change is saved at once.
 */

const LABELS: Record<AutoAcceptKind, { title: string; description: string }> = {
  cards: { title: 'Flashcards', description: 'join your reviews as soon as they are generated' },
  questions: { title: 'Questions', description: 'join quizzes and mastery at once' },
  concepts: { title: 'New concepts', description: 'are created at once' },
  relations: { title: 'Relations between concepts', description: 'are added to the graph at once' },
  aliases: { title: 'Merges', description: 'add a name to an existing concept at once' },
  links: { title: 'Links', description: 'are written into your notes at once' },
  notes: { title: 'Lecture notes', description: 'are saved as notes at once' },
};

export function AutoAcceptForm({ settings }: { settings: AiSettings }) {
  const actions = useAiActions();
  const current = settings.preferences.autoAccept;
  const toggle = (kind: AutoAcceptKind, on: boolean) =>
    actions.updatePreferences.mutate({ autoAccept: { [kind]: on } }, { onError: notifyError });
  return (
    <fieldset className="space-y-2 rounded-lg border border-border bg-surface p-4">
      <legend className="px-1 text-sm font-semibold">Skip the Inbox</legend>
      <p className="text-xs text-muted">
        Generated material waits in the Inbox until you accept it. Tick a kind to accept it
        automatically instead — you can still edit or delete it later.
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {AUTO_ACCEPT_KINDS.map((kind) => (
          <li key={kind}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={current[kind]}
                disabled={actions.updatePreferences.isPending}
                onChange={(event) => toggle(kind, event.target.checked)}
              />
              <span>
                <span className="font-medium">{LABELS[kind].title}</span>{' '}
                <span className="text-muted">{LABELS[kind].description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
