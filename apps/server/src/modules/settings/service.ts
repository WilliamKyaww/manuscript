import {
  DEFAULT_NOTES_SETTINGS,
  issuesFromZod,
  type NotesSettings,
  NotesSettingsSchema,
  ValidationError,
} from '@skb/core';
import type { SqlDatabase } from '../../db/sqlite';
import type { Clock } from '../../shared/clock';
import type { Logger } from '../../shared/logger';

/**
 * Vault-scoped, non-secret settings stored as JSON rows in `settings` (canonical). Secrets never live
 * here (ADR-0005). Each group has a Zod schema and defaults; a stored value that no longer validates
 * falls back to the defaults for the invalid keys, with a warning, rather than breaking start-up.
 */

const NOTES_KEY = 'notes';

export interface SettingsService {
  notes(): NotesSettings;
  updateNotes(changes: Partial<NotesSettings>): NotesSettings;
  onNotesChange(listener: (next: NotesSettings, previous: NotesSettings) => void): () => void;
}

export interface SettingsDependencies {
  db: SqlDatabase;
  clock: Clock;
  logger: Logger;
}

export function createSettingsService({
  db,
  clock,
  logger,
}: SettingsDependencies): SettingsService {
  const listeners = new Set<(next: NotesSettings, previous: NotesSettings) => void>();
  let cached: NotesSettings | undefined;

  const read = (): NotesSettings => {
    const row = db.get<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', [
      NOTES_KEY,
    ]);
    if (!row) return { ...DEFAULT_NOTES_SETTINGS };
    let stored: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.value_json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        stored = parsed as Record<string, unknown>;
    } catch {
      // Unreadable JSON: fall back to the defaults below.
    }
    const merged: Record<string, unknown> = { ...DEFAULT_NOTES_SETTINGS };
    for (const [key, value] of Object.entries(stored)) {
      if (!(key in DEFAULT_NOTES_SETTINGS)) continue;
      const field = NotesSettingsSchema.shape[key as keyof NotesSettings].safeParse(value);
      if (field.success) merged[key] = field.data;
      else logger.warn('Ignoring an invalid stored setting', { group: NOTES_KEY, key });
    }
    return NotesSettingsSchema.parse(merged);
  };

  return {
    notes() {
      cached ??= read();
      return cached;
    },
    updateNotes(changes) {
      const previous = this.notes();
      const result = NotesSettingsSchema.safeParse({ ...previous, ...changes });
      if (!result.success)
        throw new ValidationError('Invalid notes settings.', issuesFromZod(result.error));
      const next = result.data;
      db.run(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [NOTES_KEY, JSON.stringify(next), clock.now().toISOString()],
      );
      cached = next;
      for (const listener of [...listeners]) listener(next, previous);
      return next;
    },
    onNotesChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
