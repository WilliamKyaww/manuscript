import { type AiRole, MODEL_SUGGESTIONS, type Provider, type RoleSettings } from '@skb/core';
import { CheckCircle2, CircleAlert, PlugZap } from 'lucide-react';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { cn } from '../../../lib/cn';
import { describeError, notifySuccess } from '../../../lib/notify';
import { Field, FormError, numberOrNull, selectClasses } from '../../learning/Field';
import { useAiActions } from '../api';

/** One role's provider, model, answer length and prices, with a connection test (task 10.04). */

export const ROLE_TEXT: Record<AiRole, { title: string; description: string }> = {
  chat: {
    title: 'Answers',
    description: 'Questions about your material, explanations and (later) the tutor and chat.',
  },
  fast: {
    title: 'Quick tasks',
    description: 'Short jobs such as titles, classification and grading. A smaller model will do.',
  },
  embedding: {
    title: 'Semantic search',
    description:
      'Optional. Finds passages by meaning, not only by words. Every passage and note is embedded once (and again when it changes).',
  },
};

const priceText = (value: number | null) => (value === null ? '' : String(value));

export function RoleForm({
  role,
  settings,
  providers,
}: {
  role: AiRole;
  settings: RoleSettings;
  providers: readonly Provider[];
}) {
  const actions = useAiActions();
  const listId = useId();
  const [providerId, setProviderId] = useState(settings.providerId ?? '');
  const [model, setModel] = useState(settings.model);
  const [maxTokens, setMaxTokens] = useState(String(settings.maxOutputTokens));
  const [inputPrice, setInputPrice] = useState(priceText(settings.inputPrice));
  const [outputPrice, setOutputPrice] = useState(priceText(settings.outputPrice));
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setProviderId(settings.providerId ?? '');
    setModel(settings.model);
    setMaxTokens(String(settings.maxOutputTokens));
    setInputPrice(priceText(settings.inputPrice));
    setOutputPrice(priceText(settings.outputPrice));
  }, [settings]);

  const provider = providers.find((candidate) => candidate.id === providerId);
  const suggestions = provider ? MODEL_SUGGESTIONS[provider.kind][role] : [];

  const save = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    actions.updatePreferences.mutate(
      {
        roles: {
          [role]: {
            providerId: providerId || null,
            model: model.trim(),
            maxOutputTokens: Number(maxTokens) || settings.maxOutputTokens,
            inputPrice: numberOrNull(inputPrice),
            outputPrice: numberOrNull(outputPrice),
          },
        },
      },
      {
        onSuccess: () => notifySuccess(`${ROLE_TEXT[role].title}: saved`),
        onError: (reason) => setError(describeError(reason).description),
      },
    );
  };

  const runTest = () => {
    setTest(null);
    actions.testProvider.mutate(
      { id: providerId, model: model.trim(), role },
      {
        onSuccess: (result) => setTest(result),
        onError: (reason) => setTest({ ok: false, message: describeError(reason).description }),
      },
    );
  };

  return (
    <form onSubmit={save} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h3 className="text-sm font-semibold">{ROLE_TEXT[role].title}</h3>
        <p className="text-xs text-muted">{ROLE_TEXT[role].description}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Provider" className="w-56">
          {(id) => (
            <select
              id={id}
              className={selectClasses}
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
            >
              <option value="">{role === 'embedding' ? 'Off' : 'None'}</option>
              {providers.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Model" className="min-w-56 flex-1">
          {(id) => (
            <>
              <Input
                id={id}
                list={listId}
                value={model}
                placeholder={suggestions[0] ?? 'Model id from the provider'}
                onChange={(event) => setModel(event.target.value)}
              />
              <datalist id={listId}>
                {suggestions.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        {role !== 'embedding' && (
          <Field label="Longest answer (tokens)" className="w-44">
            {(id) => (
              <Input
                id={id}
                type="number"
                min={64}
                max={64000}
                value={maxTokens}
                onChange={(event) => setMaxTokens(event.target.value)}
              />
            )}
          </Field>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Input price ($ per million tokens)" className="w-60">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              value={inputPrice}
              placeholder="e.g. 3"
              onChange={(event) => setInputPrice(event.target.value)}
            />
          )}
        </Field>
        {role !== 'embedding' && (
          <Field label="Output price ($ per million tokens)" className="w-60">
            {(id) => (
              <Input
                id={id}
                inputMode="decimal"
                value={outputPrice}
                placeholder="e.g. 15"
                onChange={(event) => setOutputPrice(event.target.value)}
              />
            )}
          </Field>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            onClick={runTest}
            disabled={!providerId || !model.trim()}
            loading={actions.testProvider.isPending}
          >
            <PlugZap aria-hidden="true" size={14} /> Test
          </Button>
          <Button type="submit" variant="primary" loading={actions.updatePreferences.isPending}>
            Save
          </Button>
        </div>
      </div>
      {test && (
        <p
          role="status"
          className={cn(
            'flex items-start gap-2 rounded-md px-3 py-2 text-sm',
            test.ok ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger',
          )}
        >
          {test.ok ? (
            <CheckCircle2 aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
          ) : (
            <CircleAlert aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
          )}
          {test.message}
        </p>
      )}
      <FormError error={error} />
    </form>
  );
}
