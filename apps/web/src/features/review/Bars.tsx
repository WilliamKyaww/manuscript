/**
 * A small bar chart for counts per day. Each bar is a list item whose text (read by screen readers,
 * and shown on hover) gives the day and the count, so the chart is also a table.
 */

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export const dayLabel = (date: string) => DAY.format(new Date(`${date}T12:00:00`)).replace(',', '');

export function Bars({
  label,
  days,
  describe,
  tone = 'accent',
  empty,
}: {
  label: string;
  days: readonly { date: string; value: number; secondary?: number }[];
  describe(day: { date: string; value: number; secondary?: number }): string;
  tone?: 'accent' | 'info';
  /** Said over the chart when every day is zero, instead of a row of empty bars. */
  empty?: string;
}) {
  const max = Math.max(1, ...days.map((day) => day.value));
  const blank = days.every((day) => day.value === 0);
  return (
    <figure className="relative">
      {blank && empty && (
        <p className="absolute inset-x-0 top-0 flex h-24 items-center justify-center px-4 text-center text-xs text-muted">
          {empty}
        </p>
      )}
      <ol aria-label={label} className="flex h-24 items-end gap-0.5">
        {days.map((day) => {
          const text = `${dayLabel(day.date)}: ${describe(day)}`;
          const height = (day.value / max) * 100;
          const secondary = day.secondary ? (day.secondary / max) * 100 : 0;
          return (
            <li key={day.date} title={text} className="relative flex h-full flex-1 items-end">
              <span className="sr-only">{text}</span>
              <span
                aria-hidden="true"
                className={`relative w-full rounded-t-sm ${tone === 'accent' ? 'bg-accent' : 'bg-info'} ${day.value === 0 ? 'opacity-20' : ''}`}
                style={{ height: `${Math.max(height, 3)}%` }}
              >
                {secondary > 0 && (
                  <span
                    className="absolute inset-x-0 bottom-0 rounded-t-sm bg-danger"
                    style={{ height: `${(secondary / Math.max(height, 3)) * 100}%` }}
                  />
                )}
              </span>
            </li>
          );
        })}
      </ol>
      <figcaption className="mt-1 flex justify-between text-xs text-muted">
        <span>{days[0] ? dayLabel(days[0].date) : ''}</span>
        <span>{days.at(-1) ? dayLabel(days.at(-1)?.date ?? '') : ''}</span>
      </figcaption>
    </figure>
  );
}
