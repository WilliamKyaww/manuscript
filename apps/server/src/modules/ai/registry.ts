import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { EmbeddingModelV4, LanguageModelV4, TranscriptionModelV4 } from '@ai-sdk/provider';
import type { AiRole, RoleSettings } from '@skb/core';
import {
  createMockEmbeddingModel,
  createMockLanguageModel,
  createMockTranscriptionModel,
} from './mock';
import type { AiConfigStore, SecretStore, StoredProvider } from './store';

/**
 * The provider registry (agent-system.md §2): turns the stored providers, keys and per-role choices
 * into AI SDK models. The only place that constructs provider clients, so keys never travel further
 * than this file and the request that uses them.
 */

export const secretName = (providerId: string) => `provider:${providerId}`;

export interface RoleState {
  ready: boolean;
  reason: string | null;
  /** "OpenAI · text-embedding-3-small". */
  label: string | null;
}

export interface Resolved<M> {
  model: M;
  role: AiRole;
  /** The provider id in the settings, or "mock". */
  provider: string;
  modelId: string;
  settings: RoleSettings;
}

export interface RegistryDependencies {
  store: AiConfigStore;
  secrets: SecretStore;
  mock: boolean;
  /** Injected in tests to stand in for the provider's HTTP API. */
  fetch?: typeof globalThis.fetch;
}

export type ModelRegistry = ReturnType<typeof createModelRegistry>;

const ROLE_NAMES: Record<AiRole, string> = {
  chat: 'answers',
  fast: 'quick tasks',
  embedding: 'semantic search',
  transcription: 'transcribing recordings',
};

export function createModelRegistry(deps: RegistryDependencies) {
  const { store, secrets, mock } = deps;

  const needsKey = (provider: StoredProvider) => provider.kind !== 'openai-compatible';

  function client(provider: StoredProvider) {
    const apiKey = secrets.get(secretName(provider.id)) ?? undefined;
    const baseURL = provider.baseUrl ?? undefined;
    const fetch = deps.fetch;
    switch (provider.kind) {
      case 'anthropic': {
        const made = createAnthropic({ apiKey, baseURL, fetch });
        return {
          language: (id: string) => made.languageModel(id),
          embedding: null as ((id: string) => EmbeddingModelV4) | null,
          transcription: null as ((id: string) => TranscriptionModelV4) | null,
        };
      }
      case 'openai': {
        const made = createOpenAI({ apiKey, baseURL, fetch });
        return {
          language: (id: string) => made.languageModel(id),
          embedding: (id: string) => made.embeddingModel(id),
          transcription: (id: string) => made.transcription(id),
        };
      }
      default: {
        const made = createOpenAICompatible({
          name: provider.id,
          baseURL: provider.baseUrl ?? '',
          apiKey,
          fetch,
        });
        // Local transcription servers (whisper.cpp, faster-whisper, LocalAI…) copy OpenAI's
        // /audio/transcriptions endpoint, so OpenAI's client talks to them; many need no key.
        const openai = createOpenAI({ apiKey: apiKey ?? 'none', baseURL, fetch });
        return {
          language: (id: string) => made.chatModel(id),
          embedding: (id: string) => made.embeddingModel(id),
          transcription: (id: string) => openai.transcription(id),
        };
      }
    }
  }

  /** Why a provider cannot be used yet, or null. */
  function providerProblem(provider: StoredProvider): string | null {
    if (provider.kind === 'openai-compatible' && !provider.baseUrl)
      return `Add the server address for ${provider.name}.`;
    if (needsKey(provider) && !secrets.get(secretName(provider.id)))
      return `Add an API key for ${provider.name}.`;
    return null;
  }

  function state(role: AiRole): RoleState & { provider?: StoredProvider; settings: RoleSettings } {
    const config = store.read();
    const settings = config.preferences.roles[role];
    if (mock) return { ready: true, reason: null, label: 'Test model (mock)', settings };
    if (!settings.providerId)
      return {
        ready: false,
        reason: `Choose a provider and model for ${ROLE_NAMES[role]}.`,
        label: null,
        settings,
      };
    const provider = config.providers.find((candidate) => candidate.id === settings.providerId);
    if (!provider)
      return {
        ready: false,
        reason: `The provider chosen for ${ROLE_NAMES[role]} was removed.`,
        label: null,
        settings,
      };
    const label = settings.model ? `${provider.name} · ${settings.model}` : provider.name;
    const problem = providerProblem(provider);
    if (problem) return { ready: false, reason: problem, label, settings };
    if (!settings.model)
      return { ready: false, reason: `Enter a model for ${ROLE_NAMES[role]}.`, label, settings };
    if (role === 'embedding' && provider.kind === 'anthropic')
      return {
        ready: false,
        reason: 'Anthropic has no embedding models: choose another provider for semantic search.',
        label,
        settings,
      };
    if (role === 'transcription' && provider.kind === 'anthropic')
      return {
        ready: false,
        reason: 'Anthropic has no transcription models: choose OpenAI or a Whisper server.',
        label,
        settings,
      };
    return { ready: true, reason: null, label, provider, settings };
  }

  return {
    status(role: AiRole): RoleState {
      const { ready, reason, label } = state(role);
      return { ready, reason, label };
    },

    language(role: 'chat' | 'fast'): Resolved<LanguageModelV4> | null {
      const current = state(role);
      if (!current.ready) return null;
      if (mock || !current.provider)
        return {
          model: createMockLanguageModel(),
          role,
          provider: 'mock',
          modelId: 'mock-chat',
          settings: current.settings,
        };
      return {
        model: client(current.provider).language(current.settings.model),
        role,
        provider: current.provider.id,
        modelId: current.settings.model,
        settings: current.settings,
      };
    },

    embedding(): Resolved<EmbeddingModelV4> | null {
      const current = state('embedding');
      if (!current.ready) return null;
      if (mock || !current.provider)
        return {
          model: createMockEmbeddingModel(),
          role: 'embedding',
          provider: 'mock',
          modelId: 'mock-embedding',
          settings: current.settings,
        };
      const make = client(current.provider).embedding;
      if (!make) return null;
      return {
        model: make(current.settings.model),
        role: 'embedding',
        provider: current.provider.id,
        modelId: current.settings.model,
        settings: current.settings,
      };
    },

    transcription(): Resolved<TranscriptionModelV4> | null {
      const current = state('transcription');
      if (!current.ready) return null;
      if (mock || !current.provider)
        return {
          model: createMockTranscriptionModel(),
          role: 'transcription',
          provider: 'mock',
          modelId: 'mock-transcription',
          settings: current.settings,
        };
      const make = client(current.provider).transcription;
      if (!make) return null;
      return {
        model: make(current.settings.model),
        role: 'transcription',
        provider: current.provider.id,
        modelId: current.settings.model,
        settings: current.settings,
      };
    },

    /** A model on a given provider, for a connection test before it is chosen for a role. */
    forTest(providerId: string, modelId: string, role: AiRole) {
      const provider = store.read().providers.find((candidate) => candidate.id === providerId);
      if (!provider) return { problem: 'That provider does not exist.' } as const;
      const problem = providerProblem(provider);
      if (problem) return { problem } as const;
      const made = client(provider);
      if (role === 'embedding') {
        if (!made.embedding)
          return { problem: `${provider.name} has no embedding models.` } as const;
        return { embedding: made.embedding(modelId) } as const;
      }
      if (role === 'transcription') {
        if (!made.transcription)
          return { problem: `${provider.name} has no transcription models.` } as const;
        return { transcription: made.transcription(modelId) } as const;
      }
      return { language: made.language(modelId) } as const;
    },
  };
}
