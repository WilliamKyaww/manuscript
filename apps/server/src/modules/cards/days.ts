/**
 * The review day: from 04:00 to 04:00 local time (as in Anki), so a session past midnight still
 * counts as the evening's. "Due today" means due before the day ends.
 */

export const DAY_STARTS_AT_HOUR = 4;

const pad = (value: number) => String(value).padStart(2, '0');

export interface ReviewDay {
  start: Date;
  end: Date;
  /** The local date the day is named after, `YYYY-MM-DD`. */
  key: string;
}

export function reviewDay(now: Date): ReviewDay {
  const start = new Date(now);
  start.setHours(DAY_STARTS_AT_HOUR, 0, 0, 0);
  if (now < start) start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start,
    end,
    key: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
  };
}

/** The review day `offset` days after the one containing `now`. */
export function shiftDay(day: ReviewDay, offset: number): ReviewDay {
  const moved = new Date(day.start);
  moved.setDate(moved.getDate() + offset);
  moved.setHours(DAY_STARTS_AT_HOUR + 1, 0, 0, 0);
  return reviewDay(moved);
}
