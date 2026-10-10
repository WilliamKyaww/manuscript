import type { EmbeddingModelV4, LanguageModelV4, TranscriptionModelV4 } from '@ai-sdk/provider';
import {
  AI_ROLES,
  AiError,
  type AiPreferences,
  type AiRole,
  type AiSettings,
  type AiStatus,
  type AutoAccept,
  type IdFactory,
  NotFoundError,
  type Provider,
  type ProviderInputSchema,
  type ProviderUpdateSchema,
  type RoleSettings,
  type ToolPermission,
  type UsageReport,
  ValidationError,
} from '@skb/core';
import { embed, generateText, transcribe } from 'ai';
import type { z } from 'zod';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';
import { describeProviderError } from './errors';
import { type ModelRegistry, type Resolved, secretName } from './registry';
import type { AiConfigStore, SecretStore, StoredProvider } from './store';
import type { Totals, UsageRepository } from './usage';

/**
 * The AI service (tasks 10.01–10.03): providers and their keys, a model per role, spend limits
 * and usage. Other modules ask it for a model (`require`), which refuses when AI is not set up or
 * the month's budget is spent, and report what each request used (`record`).
 */

type ProviderInput = z.output<typeof ProviderInputSchema>;
type ProviderUpdate = z.output<typeof ProviderUpdateSchema>;
type PreferencesPatch = {
  roles?: Partial<Record<AiRole, Partial<RoleSettings>>>;
  monthlyBudget?: number | null;
  contextTokens?: number;
  autoAccept?: Partial<AutoAccept>;
  /** Per-tool overrides; null returns a tool to the default for its risk. */
  toolPermissions?: Record<string, ToolPermission | null>;
};

export interface AiServiceDependencies {
  store: AiConfigStore;
  secrets: SecretStore;
  registry: ModelRegistry;
  usage: UsageRepository;
  mock: boolean;
  clock: Clock;
  ids: IdFactory;
  logger: Logger;
}

export type AiService = ReturnType<typeof createAiService>;

const CONNECTION_TIMEOUT_MS = 20_000;

/** The first moment of the current calendar month, local time. */
function monthStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 36);

const money = (value: number) => `$${value.toFixed(2)}`;

/** A WAV file of silence (16 kHz, mono, 16-bit), for testing a transcription model. */
function silentWav(seconds: number): Uint8Array {
  const rate = 16_000;
  const data = rate * 2 * seconds;
  const buffer = Buffer.alloc(44 + data);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + data, 4);
  buffer.write('WAVEfmt ', 8, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(data, 40);
  return new Uint8Array(buffer);
}

export function createAiService(deps: AiServiceDependencies) {
  const { store, secrets, registry, usage, mock, clock, ids, logger } = deps;

  const providerView = (provider: StoredProvider): Provider => ({
    id: provider.id,
    kind: provider.kind,
    name: provider.name,
    baseUrl: provider.baseUrl,
    hasKey: secrets.get(secretName(provider.id)) !== null,
  });

  const requireProvider = (id: string) => {
    const config = store.read();
    const provider = config.providers.find((candidate) => candidate.id === id);
    if (!provider) throw new NotFoundError('That provider does not exist.');
    return { config, provider };
  };

  const cost = (settings: RoleSettings, inputTokens: number, outputTokens: number) =>
    (inputTokens * (settings.inputPrice ?? 0) + outputTokens * (settings.outputPrice ?? 0)) /
    1_000_000;

  function status(): AiStatus {
    const preferences = store.read().preferences;
    const month = usage.since(monthStart(clock.now()).toISOString());
    const budget = preferences.monthlyBudget;
    const roles = Object.fromEntries(
      AI_ROLES.map((role) => [role, registry.status(role)]),
    ) as AiStatus['roles'];
    return {
      enabled: roles.chat.ready,
      mock,
      roles,
      month: {
        ...month,
        budget,
        warning: budget !== null && month.cost >= budget * 0.8,
        exhausted: budget !== null && month.cost >= budget,
      },
    };
  }

  function settings(): AiSettings {
    const config = store.read();
    return {
      providers: config.providers.map(providerView),
      preferences: config.preferences,
      status: status(),
    };
  }

  function checkBudget() {
    const { month } = status();
    if (month.exhausted && month.budget !== null)
      throw new AiError(
        'budget',
        `This month's AI budget of ${money(month.budget)} is used up (${money(month.cost)} estimated). Raise it in Settings → AI, or wait until next month.`,
      );
  }

  function record<M>(
    resolved: Resolved<M>,
    purpose: string,
    inputTokens = 0,
    outputTokens = 0,
    /** Spend worked out by the caller (transcription is priced per minute of audio). */
    spentOverride?: number,
  ): Totals {
    const spent = spentOverride ?? cost(resolved.settings, inputTokens, outputTokens);
    usage.insert({
      id: ids('usage'),
      role: resolved.role,
      provider: resolved.provider,
      model: resolved.modelId,
      purpose,
      inputTokens,
      outputTokens,
      cost: spent,
      createdAt: clock.now().toISOString(),
    });
    return { requests: 1, inputTokens, outputTokens, cost: spent };
  }

  /** Records a transcription, priced per minute of audio (the role's input price). */
  const recordTranscription = (
    resolved: Resolved<TranscriptionModelV4>,
    purpose: string,
    seconds: number,
  ): Totals =>
    record(resolved, purpose, 0, 0, ((resolved.settings.inputPrice ?? 0) * seconds) / 60);

  return {
    settings,
    status,
    record,
    recordTranscription,

    /** A language model for a role, or an AiError saying why there is none. */
    require(role: 'chat' | 'fast'): Resolved<LanguageModelV4> {
      const resolved = registry.language(role);
      if (!resolved)
        throw new AiError(
          'not_configured',
          registry.status(role).reason ?? 'AI is not set up. Add a provider in Settings → AI.',
        );
      checkBudget();
      return resolved;
    },

    /** The embedding model, or null when semantic search is not set up (it is optional). */
    embeddingModel(): Resolved<EmbeddingModelV4> | null {
      const resolved = registry.embedding();
      if (!resolved) return null;
      checkBudget();
      return resolved;
    },

    /** The transcription model, or an AiError saying why there is none. */
    requireTranscription(): Resolved<TranscriptionModelV4> {
      const resolved = registry.transcription();
      if (!resolved)
        throw new AiError(
          'not_configured',
          registry.status('transcription').reason ??
            'Transcription is not set up. Choose a model in Settings → AI.',
        );
      checkBudget();
      return resolved;
    },

    updatePreferences(patch: PreferencesPatch): AiSettings {
      const config = store.read();
      const preferences: AiPreferences = structuredClone(config.preferences);
      for (const role of AI_ROLES) {
        const change = patch.roles?.[role];
        if (!change) continue;
        if (
          change.providerId &&
          !config.providers.some((provider) => provider.id === change.providerId)
        )
          throw new ValidationError('That provider does not exist.');
        preferences.roles[role] = { ...preferences.roles[role], ...change };
      }
      if (patch.monthlyBudget !== undefined) preferences.monthlyBudget = patch.monthlyBudget;
      if (patch.contextTokens !== undefined) preferences.contextTokens = patch.contextTokens;
      if (patch.autoAccept)
        preferences.autoAccept = { ...preferences.autoAccept, ...patch.autoAccept };
      for (const [tool, permission] of Object.entries(patch.toolPermissions ?? {})) {
        if (permission === null) delete preferences.toolPermissions[tool];
        else preferences.toolPermissions[tool] = permission;
      }
      store.write({ ...config, preferences });
      return settings();
    },

    createProvider(input: ProviderInput): Provider {
      const config = store.read();
      if (input.kind === 'openai-compatible' && !input.baseUrl)
        throw new ValidationError('An OpenAI-compatible provider needs the server address.');
      const base = slug(input.name) || input.kind;
      let id = base;
      for (let n = 2; config.providers.some((provider) => provider.id === id); n += 1)
        id = `${base}-${n}`;
      const provider: StoredProvider = {
        id,
        kind: input.kind,
        name: input.name,
        baseUrl: input.baseUrl ?? null,
      };
      if (input.apiKey) secrets.set(secretName(id), input.apiKey);
      store.write({ ...config, providers: [...config.providers, provider] });
      logger.info('ai.provider.added', { id, kind: input.kind });
      return providerView(provider);
    },

    updateProvider(id: string, patch: ProviderUpdate): Provider {
      const { config, provider } = requireProvider(id);
      const next: StoredProvider = {
        ...provider,
        name: patch.name ?? provider.name,
        baseUrl: patch.baseUrl === undefined ? provider.baseUrl : patch.baseUrl,
      };
      if (next.kind === 'openai-compatible' && !next.baseUrl)
        throw new ValidationError('An OpenAI-compatible provider needs the server address.');
      if (patch.apiKey === null) secrets.delete(secretName(id));
      else if (patch.apiKey) secrets.set(secretName(id), patch.apiKey);
      store.write({
        ...config,
        providers: config.providers.map((candidate) => (candidate.id === id ? next : candidate)),
      });
      return providerView(next);
    },

    /** Removes a provider and its key; roles that used it are left without a provider. */
    deleteProvider(id: string): void {
      const { config } = requireProvider(id);
      const preferences = structuredClone(config.preferences);
      for (const role of AI_ROLES)
        if (preferences.roles[role].providerId === id) preferences.roles[role].providerId = null;
      secrets.delete(secretName(id));
      store.write({
        providers: config.providers.filter((provider) => provider.id !== id),
        preferences,
      });
    },

    async testProvider(id: string, modelId: string, role: AiRole) {
      requireProvider(id);
      const made = registry.forTest(id, modelId, role);
      if ('problem' in made) return { ok: false, message: made.problem ?? '', latencyMs: 0 };
      const started = Date.now();
      const settingsFor = store.read().preferences.roles[role];
      const priced =
        settingsFor.providerId === id && settingsFor.model === modelId
          ? settingsFor
          : { ...settingsFor, inputPrice: null, outputPrice: null };
      const resolved = { role, provider: id, modelId, settings: priced };
      try {
        if (made.transcription) {
          const result = await transcribe({
            model: made.transcription,
            audio: silentWav(1),
            abortSignal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
            maxRetries: 0,
          });
          recordTranscription({ ...resolved, model: made.transcription }, 'connection test', 1);
          return {
            ok: true,
            message: `Connected: ${modelId} transcribed a second of silence${result.text.trim() ? ` as “${result.text.trim().slice(0, 40)}”` : ''}.`,
            latencyMs: Date.now() - started,
          };
        }
        if (made.embedding) {
          const result = await embed({
            model: made.embedding,
            value: 'Connection test',
            abortSignal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
            maxRetries: 0,
          });
          record({ ...resolved, model: made.embedding }, 'connection test', result.usage.tokens);
          return {
            ok: true,
            message: `Connected: ${modelId} returns vectors of ${result.embedding.length} numbers.`,
            latencyMs: Date.now() - started,
          };
        }
        const result = await generateText({
          model: made.language,
          prompt: 'Reply with OK.',
          maxOutputTokens: 16,
          abortSignal: AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
          maxRetries: 0,
        });
        record(
          { ...resolved, model: made.language },
          'connection test',
          result.usage.inputTokens ?? 0,
          result.usage.outputTokens ?? 0,
        );
        return {
          ok: true,
          message: `Connected: ${modelId} answered.`,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        const message = describeProviderError(error);
        logger.warn('ai.provider.test-failed', { id, model: modelId, message });
        return { ok: false, message, latencyMs: Date.now() - started };
      }
    },

    usageReport(): UsageReport {
      const now = clock.now();
      const from = monthStart(now).toISOString();
      return {
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        totals: usage.since(from),
        byModel: usage.byModel(from),
        recent: usage.recent(20),
      };
    },
  };
}
