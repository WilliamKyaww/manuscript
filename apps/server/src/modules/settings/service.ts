import {
  type Bookmarks,
  BookmarksSchema,
  DEFAULT_NOTES_SETTINGS,
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_PLAN_SETTINGS,
  DEFAULT_REVIEW_SETTINGS,
  issuesFromZod,
  type NotesSettings,
  NotesSettingsSchema,
  type PipelineSettings,
  PipelineSettingsSchema,
  type PlanSettings,
  PlanSettingsSchema,
  type ReviewSettings,
  ReviewSettingsSchema,
  ValidationError,
} from '@skb/core';
import type { z } from 'zod';
import type { SqlDatabase } from '../../db/sqlite';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';

/**
 * Vault-scoped, non-secret settings stored as JSON rows in `settings` (canonical). Secrets never live
 * here (ADR-0005). Each group has a Zod schema and defaults; a stored value that no longer validates
 * falls back to the defaults for the invalid keys, with a warning, rather than breaking start-up.
 */

export interface SettingsService {
  notes(): NotesSettings;
  updateNotes(changes: Partial<NotesSettings>): NotesSettings;
  onNotesChange(listener: (next: NotesSettings, previous: NotesSettings) => void): () => void;
  review(): ReviewSettings;
  updateReview(changes: Partial<ReviewSettings>): ReviewSettings;
  pipeline(): PipelineSettings;
  updatePipeline(changes: Partial<PipelineSettings>): PipelineSettings;
  plan(): PlanSettings;
  updatePlan(changes: Partial<PlanSettings>): PlanSettings;
  /** Bookmarked notes, folders and attachments (ADR-0042), by path. */
  bookmarks(): Bookmarks;
  updateBookmarks(next: Bookmarks): Bookmarks;
}

export interface SettingsDependencies {
  db: SqlDatabase;
  clock: Clock;
  logger: Logger;
}

/** One group of settings under one key: read with fallbacks, cached, validated on update. */
function settingsGroup<T extends Record<string, unknown>>(
  { db, clock, logger }: SettingsDependencies,
  key: string,
  schema: z.ZodObject,
  defaults: T,
  label: string,
) {
  const listeners = new Set<(next: T, previous: T) => void>();
  let cached: T | undefined;

  const read = (): T => {
    const row = db.get<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', [
      key,
    ]);
    if (!row) return { ...defaults };
    let stored: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.value_json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        stored = parsed as Record<string, unknown>;
    } catch {
      // Unreadable JSON: fall back to the defaults below.
    }
    const merged: Record<string, unknown> = { ...defaults };
    for (const [name, value] of Object.entries(stored)) {
      if (!(name in defaults)) continue;
      const field = (schema.shape[name] as z.ZodType).safeParse(value);
      if (field.success) merged[name] = field.data;
      else logger.warn('Ignoring an invalid stored setting', { group: key, key: name });
    }
    return schema.parse(merged) as T;
  };

  return {
    get(): T {
      cached ??= read();
      return cached;
    },
    update(changes: Partial<T>): T {
      const previous = this.get();
      const result = schema.safeParse({ ...previous, ...changes });
      if (!result.success)
        throw new ValidationError(`Invalid ${label} settings.`, issuesFromZod(result.error));
      const next = result.data as T;
      db.run(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [key, JSON.stringify(next), clock.now().toISOString()],
      );
      cached = next;
      for (const listener of [...listeners]) listener(next, previous);
      return next;
    },
    onChange(listener: (next: T, previous: T) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createSettingsService(deps: SettingsDependencies): SettingsService {
  const notes = settingsGroup(deps, 'notes', NotesSettingsSchema, DEFAULT_NOTES_SETTINGS, 'notes');
  const review = settingsGroup(
    deps,
    'review',
    ReviewSettingsSchema,
    DEFAULT_REVIEW_SETTINGS,
    'review',
  );
  const plan = settingsGroup(deps, 'plan', PlanSettingsSchema, DEFAULT_PLAN_SETTINGS, 'study plan');
  const pipeline = settingsGroup(
    deps,
    'pipeline',
    PipelineSettingsSchema,
    DEFAULT_PIPELINE_SETTINGS,
    'lecture pipeline',
  );
  const bookmarks = settingsGroup<Bookmarks>(
    deps,
    'bookmarks',
    BookmarksSchema,
    { items: [] },
    'bookmarks',
  );
  return {
    bookmarks: () => bookmarks.get(),
    updateBookmarks: (next) => bookmarks.update(next),
    pipeline: () => pipeline.get(),
    updatePipeline: (changes) => pipeline.update(changes),
    plan: () => plan.get(),
    updatePlan: (changes) => plan.update(changes),
    notes: () => notes.get(),
    updateNotes: (changes) => notes.update(changes),
    onNotesChange: (listener) => notes.onChange(listener),
    review: () => review.get(),
    updateReview: (changes) => review.update(changes),
  };
}
