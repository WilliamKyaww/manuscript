import { FrontmatterEditError, setFrontmatterValues, splitFrontmatter } from '@skb/core/markdown';
import { FALLBACK_ID_KEY, ID_KEY } from './identity';

/**
 * Note templates (task 3.10): ordinary notes in the templates folder whose placeholders are filled
 * in when a note is created from them. Supported: `{{title}}`, `{{date}}`, `{{time}}`,
 * `{{date:FORMAT}}`, `{{time:FORMAT}}`, `{{module}}` and `{{lecture}}` (Obsidian's core template
 * syntax plus our course fields). Unknown placeholders are left as they are.
 */

export interface TemplateValues {
  title: string;
  /** Local date and time to use for `{{date}}` and `{{time}}`. */
  now: Date;
  module?: string | null;
  lecture?: string | null;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** Formats a local date with Moment-style tokens (the subset Obsidian users rely on). */
export function formatDate(date: Date, format: string): string {
  const tokens: Record<string, () => string> = {
    YYYY: () => String(date.getFullYear()),
    YY: () => pad(date.getFullYear() % 100),
    MMMM: () => MONTHS[date.getMonth()] ?? '',
    MMM: () => (MONTHS[date.getMonth()] ?? '').slice(0, 3),
    MM: () => pad(date.getMonth() + 1),
    M: () => String(date.getMonth() + 1),
    dddd: () => DAYS[date.getDay()] ?? '',
    ddd: () => (DAYS[date.getDay()] ?? '').slice(0, 3),
    DD: () => pad(date.getDate()),
    D: () => String(date.getDate()),
    HH: () => pad(date.getHours()),
    H: () => String(date.getHours()),
    mm: () => pad(date.getMinutes()),
    ss: () => pad(date.getSeconds()),
  };
  // Longest tokens first; text in [brackets] is literal, as in Moment.
  return format.replace(
    /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|mm|ss/g,
    (match, literal?: string) => (literal !== undefined ? literal : (tokens[match]?.() ?? match)),
  );
}

/** Removes the template's own id so every note created from it gets a fresh one. */
function withoutIds(text: string): string {
  if (!splitFrontmatter(text).present) return text;
  try {
    return setFrontmatterValues(text, { [ID_KEY]: undefined, [FALLBACK_ID_KEY]: undefined });
  } catch (error) {
    if (error instanceof FrontmatterEditError) return text;
    throw error;
  }
}

export function instantiateTemplate(template: string, values: TemplateValues): string {
  const replacements: Record<string, (format?: string) => string> = {
    title: () => values.title,
    date: (format) => formatDate(values.now, format ?? 'YYYY-MM-DD'),
    time: (format) => formatDate(values.now, format ?? 'HH:mm'),
    module: () => values.module ?? '',
    lecture: () => values.lecture ?? '',
  };
  return withoutIds(template).replace(
    /\{\{\s*(title|date|time|module|lecture)(?::([^}]*))?\s*\}\}/g,
    (_, name: string, format?: string) => replacements[name]?.(format?.trim() || undefined) ?? '',
  );
}
