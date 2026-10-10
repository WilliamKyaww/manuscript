import { DAY_STARTS_AT_HOUR } from '../apps/server/src/modules/cards/days';

/**
 * A date, `YYYY-MM-DD`, `offset` days from today as the application counts days: from 04:00 to 04:00
 * local time (as in Anki), so between midnight and 04:00 it is still yesterday. Tests that seed dates
 * relative to today must count from the same day, or "tomorrow" is two days away after midnight.
 */
export function studyDay(offset = 0): string {
  const date = new Date(Date.now() - DAY_STARTS_AT_HOUR * 3_600_000);
  date.setDate(date.getDate() + offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
