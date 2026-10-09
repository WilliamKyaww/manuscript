import { AI_ROLES, type AiSettings, type Provider } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Badge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { IconButton } from '../../../components/IconButton';
import { Input } from '../../../components/Input';
import { StickySection } from '../../../components/Page';
import { ProgressBar } from '../../../components/ProgressBar';
import { ErrorState, LoadingState } from '../../../components/States';
import { useApi } from '../../../lib/api/context';
import { formatCount } from '../../../lib/format';
import { describeError, notifyError, notifySuccess } from '../../../lib/notify';
import { Field, FormError, numberOrNull } from '../../learning/Field';
import { aiSettingsQuery, embeddingStatusQuery, useAiActions } from '../api';
import { AutoAcceptForm } from './AutoAcceptForm';
import { KIND_LABELS, ProviderDialog } from './ProviderDialog';
import { RoleForm } from './RoleForm';
import { UsagePanel } from './UsagePanel';

/**
 * Settings → AI (task 10.04): providers and keys, a model per role with connection tests, the
 * monthly budget and context size, usage, and semantic search. Everything else in the app works
 * with all of this left empty.
 */

const money = (value: number) => `$${value.toFixed(value < 1 ? 3 : 2)}`;

function StatusLine({ settings }: { settings: AiSettings }) {
  const { status } = settings;
  if (status.mock)
    return (
      <p className="rounded-md bg-info-subtle px-3 py-2 text-sm text-info">
        Test mode: a built-in test model answers (SKB_AI_PROVIDER=mock). No provider is contacted.
      </p>
    );
  return status.enabled ? (
    <p className="rounded-md bg-success-subtle px-3 py-2 text-sm text-success">
      AI is on: answers use {status.roles.chat.label}.
    </p>
  ) : (
    <p className="rounded-md bg-surface-sunken px-3 py-2 text-sm">
      AI is off. Everything else works without it. To ask questions about your material, add a
      provider below and choose a model for answers.{' '}
      <span className="text-muted">({status.roles.chat.reason})</span>
    </p>
  );
}

function ProvidersList({ providers }: { providers: readonly Provider[] }) {
  const actions = useAiActions();
  const [editing, setEditing] = useState<Provider | 'new' | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Providers</h3>
        <Button size="sm" onClick={() => setEditing('new')}>
          <Plus aria-hidden="true" size={14} /> Add a provider
        </Button>
      </div>
      {providers.length === 0 ? (
        <p className="text-sm text-muted">
          None yet. Anthropic and OpenAI need an API key from their websites; Ollama and LM Studio
          run models on this computer for free.
        </p>
      ) : (
        <ul
          aria-label="Providers"
          className="divide-y divide-border rounded-lg border border-border bg-surface"
        >
          {providers.map((provider) => (
            <li key={provider.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{provider.name}</p>
                <p className="truncate text-xs text-muted">
                  {KIND_LABELS[provider.kind].split(' (')[0]}
                  {provider.baseUrl ? ` · ${provider.baseUrl}` : ''}
                </p>
              </div>
              <Badge tone={provider.hasKey ? 'success' : 'neutral'}>
                {provider.hasKey ? 'Key saved' : 'No key'}
              </Badge>
              <IconButton
                label={`Edit ${provider.name}`}
                icon={<Pencil size={14} />}
                size="sm"
                onClick={() => setEditing(provider)}
              />
              <IconButton
                label={`Remove ${provider.name}`}
                icon={<Trash2 size={14} />}
                size="sm"
                onClick={() => setRemoving(provider)}
              />
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ProviderDialog
          provider={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <Dialog
          open
          size="sm"
          title={`Remove ${removing.name}?`}
          onOpenChange={(next) => !next && setRemoving(null)}
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button onClick={() => setRemoving(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={actions.deleteProvider.isPending}
                onClick={() =>
                  actions.deleteProvider.mutate(removing.id, {
                    onSuccess: () => setRemoving(null),
                    onError: notifyError,
                  })
                }
              >
                Remove
              </Button>
            </div>
          }
        >
          <p className="text-sm">
            Its key is deleted from this computer, and roles that used it are left without a model.
          </p>
        </Dialog>
      )}
    </div>
  );
}

function LimitsForm({ settings }: { settings: AiSettings }) {
  const actions = useAiActions();
  const [budget, setBudget] = useState('');
  const [context, setContext] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const { monthlyBudget, contextTokens } = settings.preferences;
    setBudget(monthlyBudget === null ? '' : String(monthlyBudget));
    setContext(String(contextTokens));
  }, [settings.preferences]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    actions.updatePreferences.mutate(
      { monthlyBudget: numberOrNull(budget), contextTokens: Number(context) },
      {
        onSuccess: () => notifySuccess('Limits saved'),
        onError: (reason) => setError(describeError(reason).description),
      },
    );
  };
  const { month } = settings.status;
  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-sm font-semibold">Limits</h3>
      {month.budget !== null && (
        <ProgressBar
          value={month.budget === 0 ? 1 : month.cost / month.budget}
          label={`${money(month.cost)} of ${money(month.budget)} this month`}
        />
      )}
      {month.exhausted && (
        <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger">
          This month's budget is used up: AI requests are refused until next month or until you
          raise it.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Monthly budget ($)"
          hint="Estimated from the prices you set per role. Empty: no limit."
          className="w-64"
        >
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              inputMode="decimal"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="Context per question (tokens)"
          hint="How much of your material is sent with each question."
          className="w-64"
        >
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              type="number"
              min={1000}
              max={200000}
              value={context}
              onChange={(event) => setContext(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" loading={actions.updatePreferences.isPending}>
          Save limits
        </Button>
      </div>
      <FormError error={error} />
    </form>
  );
}

function EmbeddingsPanel() {
  const api = useApi();
  const status = useQuery(embeddingStatusQuery(api));
  const actions = useAiActions();
  const data = status.data;
  if (!data?.model) return null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
      <p className="font-medium">Semantic search with {data.model}</p>
      <ProgressBar
        value={data.total === 0 ? 1 : data.embedded / data.total}
        label={`${data.embedded} of ${formatCount(data.total, 'passage and note', 'passages and notes')} embedded`}
      />
      {data.error && <p className="text-danger">{data.error}</p>}
      <Button
        size="sm"
        onClick={() => actions.rebuildEmbeddings.mutate(undefined, { onError: notifyError })}
        disabled={data.running}
      >
        {data.running ? 'Embedding…' : 'Embed everything again'}
      </Button>
    </div>
  );
}

export function AiSettingsSection() {
  const api = useApi();
  const settings = useQuery(aiSettingsQuery(api));
  const data = settings.data;
  return (
    <StickySection
      title="AI"
      description="Optional. Keys stay on this computer, outside your vault, and are only sent to their provider."
    >
      {settings.isPending && <LoadingState label="Loading AI settings" />}
      {settings.isError && (
        <ErrorState message="AI settings could not be loaded." onRetry={() => settings.refetch()} />
      )}
      {data && (
        <div className="space-y-6">
          <StatusLine settings={data} />
          {!data.status.mock && <ProvidersList providers={data.providers} />}
          {!data.status.mock && (
            <div className="space-y-3">
              {AI_ROLES.map((role) => (
                <RoleForm
                  key={role}
                  role={role}
                  settings={data.preferences.roles[role]}
                  providers={data.providers}
                />
              ))}
            </div>
          )}
          <EmbeddingsPanel />
          <LimitsForm settings={data} />
          <AutoAcceptForm settings={data} />
          <UsagePanel />
        </div>
      )}
    </StickySection>
  );
}
