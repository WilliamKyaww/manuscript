import { PROVIDER_KINDS, type Provider, type ProviderKind } from '@skb/core';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Input } from '../../../components/Input';
import { describeError, notifySuccess } from '../../../lib/notify';
import { Field, FormError, selectClasses } from '../../learning/Field';
import { useAiActions } from '../api';

/**
 * Adding or editing a provider (task 10.04). The key field is write-only: an existing key is never
 * shown, only replaced or removed.
 */

export const KIND_LABELS: Record<ProviderKind, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'openai-compatible': 'OpenAI-compatible (Ollama, LM Studio, OpenRouter…)',
};

const ADDRESS_HINTS: Record<ProviderKind, string> = {
  anthropic: 'Leave empty for api.anthropic.com.',
  openai: 'Leave empty for api.openai.com.',
  'openai-compatible':
    'Required, ending in /v1 — e.g. http://localhost:11434/v1 (Ollama) or http://localhost:1234/v1 (LM Studio).',
};

export function ProviderDialog({ provider, onClose }: { provider?: Provider; onClose(): void }) {
  const actions = useAiActions();
  const formId = useId();
  const [kind, setKind] = useState<ProviderKind>(provider?.kind ?? 'anthropic');
  const [name, setName] = useState(provider?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saving = actions.createProvider.isPending || actions.updateProvider.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (provider) {
        await actions.updateProvider.mutateAsync({
          id: provider.id,
          name: name.trim(),
          baseUrl: baseUrl.trim() || null,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        });
        notifySuccess(`${name.trim()} saved`);
      } else {
        await actions.createProvider.mutateAsync({
          kind,
          name: name.trim() || KIND_LABELS[kind].split(' ')[0] || kind,
          ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        });
        notifySuccess('Provider added');
      }
      onClose();
    } catch (reason) {
      setError(describeError(reason).description);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && onClose()}
      title={provider ? `Edit ${provider.name}` : 'Add a provider'}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {provider ? 'Save' : 'Add provider'}
          </Button>
        </div>
      }
    >
      <form id={formId} className="space-y-4" onSubmit={submit}>
        {!provider && (
          <Field label="Kind">
            {(id) => (
              <select
                id={id}
                className={selectClasses}
                value={kind}
                onChange={(event) => setKind(event.target.value as ProviderKind)}
              >
                {PROVIDER_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {KIND_LABELS[value]}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Name" hint="How it appears in the model choices, e.g. Ollama on this laptop.">
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              value={name}
              placeholder={KIND_LABELS[kind].split(' ')[0]}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Server address" hint={ADDRESS_HINTS[provider?.kind ?? kind]}>
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              type="url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          )}
        </Field>
        <Field
          label="API key"
          hint={
            provider?.hasKey
              ? 'A key is saved. Type a new one to replace it; it is never shown again.'
              : 'Stored on this computer outside your vault, and only sent to this provider. Local servers often need none.'
          }
        >
          {(id, hint) => (
            <Input
              id={id}
              aria-describedby={hint}
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={provider?.hasKey ? '••••••••  (saved)' : ''}
              onChange={(event) => setApiKey(event.target.value)}
            />
          )}
        </Field>
        {provider?.hasKey && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() =>
              actions.updateProvider.mutate(
                { id: provider.id, apiKey: null },
                { onSuccess: () => notifySuccess('Key removed') },
              )
            }
          >
            Remove the saved key
          </Button>
        )}
        <FormError error={error} />
      </form>
    </Dialog>
  );
}
