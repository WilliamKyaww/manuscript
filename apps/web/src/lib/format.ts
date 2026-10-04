/** Short, human-readable duration, e.g. "45 s", "12 min", "2 h 5 min". */
export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "Good morning/afternoon/evening" for the given local time. */
export function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** e.g. "Sunday 4 October 2026" (British format). */
export function formatLongDate(date: Date): string {
  return LONG_DATE.format(date).replace(',', '');
}
