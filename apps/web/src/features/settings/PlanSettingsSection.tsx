import type { PlanSettings } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { StickySection } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { describeError, notifySuccess } from '../../lib/notify';
import { Field, FormError } from '../learning/Field';
import { planSettingsQuery, usePlanActions } from '../plan/api';

/**
 * Settings → Study plan (task 14.11, learning-system.md §9): the minutes you have each weekday, days
 * with no study, how long one sitting is, and whether cards get extra retention before an exam.
 */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function PlanSettingsSection() {
  const api = useApi();
  const settings = useQuery(planSettingsQuery(api));
  const actions = usePlanActions();
  const [draft, setDraft] = useState<PlanSettings | null>(null);
  const [blocked, setBlocked] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setDraft(settings.data);
  }, [settings.data]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setError(null);
    actions.updateSettings.mutate(draft, {
      onSuccess: () => notifySuccess('Study plan settings saved', 'Plan again to use them.'),
      onError: (reason) => setError(describeError(reason).description),
    });
  };

  return (
    <StickySection
      title="Study plan"
      description="The time you have, so the plan never asks for more than that. Reviews that are due are always planned."
    >
      {settings.isPending && <LoadingState label="Loading study plan settings" />}
      {settings.isError && (
        <ErrorState
          message="Study plan settings could not be loaded."
          onRetry={() => settings.refetch()}
        />
      )}
      {draft && (
        <form onSubmit={submit} className="space-y-5" aria-label="Study plan settings">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Minutes available each day</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {WEEKDAYS.map((name, index) => (
                <Field key={name} label={name}>
                  {(id) => (
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      max={960}
                      step={5}
                      value={draft.minutesByWeekday[index] ?? 0}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          minutesByWeekday: draft.minutesByWeekday.map((minutes, at) =>
                            at === index ? Math.max(0, Number(event.target.value)) : minutes,
                          ),
                        })
                      }
                    />
                  )}
                </Field>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="One sitting (minutes)"
              hint="Practice blocks are this long, between 15 and 25 minutes."
            >
              {(id, hint) => (
                <Input
                  id={id}
                  aria-describedby={hint}
                  type="number"
                  min={15}
                  max={90}
                  step={5}
                  value={draft.sessionMinutes}
                  onChange={(event) =>
                    setDraft({ ...draft, sessionMinutes: Number(event.target.value) })
                  }
                />
              )}
            </Field>
            <Field label="A day with no study" hint="Holidays, travel, days off.">
              {(id, hint) => (
                <div className="flex gap-2">
                  <Input
                    id={id}
                    aria-describedby={hint}
                    type="date"
                    value={blocked}
                    onChange={(event) => setBlocked(event.target.value)}
                  />
                  <Button
                    type="button"
                    disabled={!blocked || draft.blockedDates.includes(blocked)}
                    onClick={() => {
                      setDraft({
                        ...draft,
                        blockedDates: [...draft.blockedDates, blocked].sort(),
                      });
                      setBlocked('');
                    }}
                  >
                    Add
                  </Button>
                </div>
              )}
            </Field>
          </div>
          {draft.blockedDates.length > 0 && (
            <ul aria-label="Days with no study" className="flex flex-wrap gap-2">
              {draft.blockedDates.map((date) => (
                <li
                  key={date}
                  className="flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-0.5 text-xs"
                >
                  {date}
                  <button
                    type="button"
                    aria-label={`Allow study on ${date}`}
                    className="rounded-full p-0.5 hover:bg-surface-hover"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        blockedDates: draft.blockedDates.filter((entry) => entry !== date),
                      })
                    }
                  >
                    <X aria-hidden="true" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.examRetention}
              onChange={(event) => setDraft({ ...draft, examRetention: event.target.checked })}
            />
            <span>
              Remember more before an exam
              <span className="block text-xs text-muted">
                In the fortnight before a module’s exam its flashcards come back sooner, aiming for
                93 % recall instead of your usual setting. It stops after the exam.
              </span>
            </span>
          </label>

          <FormError error={error} />
          <Button type="submit" variant="primary" loading={actions.updateSettings.isPending}>
            Save
          </Button>
        </form>
      )}
    </StickySection>
  );
}
