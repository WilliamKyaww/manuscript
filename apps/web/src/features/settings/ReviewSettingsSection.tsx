import { HIGH_RETENTION, type ReviewSettings } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { describeError, notifySuccess } from '../../lib/notify';
import { Field, FormError } from '../learning/Field';
import { reviewSettingsQuery, useCardActions } from '../review/api';

/**
 * Review settings (task 8.12, learning-system.md §3.1): desired retention, daily limits, learning
 * steps and the longest interval. Changes apply to the next rating of each card.
 */

const steps = (text: string) =>
  text
    .split(/[\s,]+/)
    .map((step) => step.trim())
    .filter(Boolean);

export function ReviewSettingsSection() {
  const api = useApi();
  const settings = useQuery(reviewSettingsQuery(api));
  const actions = useCardActions();
  const [draft, setDraft] = useState<ReviewSettings | null>(null);
  const [learning, setLearning] = useState('');
  const [relearning, setRelearning] = useState('');
  const [reviewLimit, setReviewLimit] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    setDraft(settings.data);
    setLearning(settings.data.learningSteps.join(' '));
    setRelearning(settings.data.relearningSteps.join(' '));
    setReviewLimit(settings.data.reviewsPerDay === null ? '' : String(settings.data.reviewsPerDay));
  }, [settings.data]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setError(null);
    actions.updateSettings.mutate(
      {
        ...draft,
        learningSteps: steps(learning),
        relearningSteps: steps(relearning),
        reviewsPerDay: reviewLimit.trim() === '' ? null : Number(reviewLimit),
      },
      {
        onSuccess: () => notifySuccess('Review settings saved'),
        onError: (reason) => setError(describeError(reason).description),
      },
    );
  };

  return (
    <StickySection
      title="Review"
      description="How flashcards are scheduled (FSRS-6). Changes apply from each card's next review."
    >
      {settings.isPending && <LoadingState label="Loading review settings" />}
      {settings.isError && (
        <ErrorState
          message="Review settings could not be loaded."
          onRetry={() => settings.refetch()}
        />
      )}
      {draft && (
        <form onSubmit={submit} className="space-y-5">
          <Field
            label={`Desired retention: ${Math.round(draft.desiredRetention * 100)} %`}
            hint={
              draft.desiredRetention > HIGH_RETENTION
                ? 'Above 93 % costs many more reviews for little gain: consider 90 %.'
                : 'The chance of remembering a card when it comes back. 90 % suits most study.'
            }
          >
            {(id, hint) => (
              <input
                id={id}
                aria-describedby={hint}
                type="range"
                min={0.8}
                max={0.95}
                step={0.01}
                value={draft.desiredRetention}
                onChange={(event) =>
                  setDraft({ ...draft, desiredRetention: Number(event.target.value) })
                }
                className="w-full max-w-md accent-[var(--skb-accent)]"
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="New cards a day">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={9999}
                  value={draft.newPerDay}
                  onChange={(event) =>
                    setDraft({ ...draft, newPerDay: Number(event.target.value) })
                  }
                />
              )}
            </Field>
            <Field label="Reviews a day" hint="Empty: no limit.">
              {(id, hint) => (
                <Input
                  id={id}
                  aria-describedby={hint}
                  type="number"
                  min={1}
                  value={reviewLimit}
                  onChange={(event) => setReviewLimit(event.target.value)}
                />
              )}
            </Field>
            <Field label="Longest interval (days)">
              {(id) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  max={36500}
                  value={draft.maximumIntervalDays}
                  onChange={(event) =>
                    setDraft({ ...draft, maximumIntervalDays: Number(event.target.value) })
                  }
                />
              )}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Learning steps" hint="For new cards, e.g. 1m 10m (m, h or d).">
              {(id, hint) => (
                <Input
                  id={id}
                  aria-describedby={hint}
                  value={learning}
                  onChange={(event) => setLearning(event.target.value)}
                />
              )}
            </Field>
            <Field label="Relearning steps" hint="For forgotten cards, e.g. 10m.">
              {(id, hint) => (
                <Input
                  id={id}
                  aria-describedby={hint}
                  value={relearning}
                  onChange={(event) => setRelearning(event.target.value)}
                />
              )}
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.fuzz}
              onChange={() => setDraft({ ...draft, fuzz: !draft.fuzz })}
            />
            Spread due dates a little (fuzz), so cards learnt together do not stay together
          </label>
          <FormError error={error} />
          <Button type="submit" variant="primary" loading={actions.updateSettings.isPending}>
            Save review settings
          </Button>
        </form>
      )}
    </StickySection>
  );
}
