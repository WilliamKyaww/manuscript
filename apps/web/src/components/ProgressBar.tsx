import { cn } from '../lib/cn';

/**
 * Determinate progress (0–1), or indeterminate when `value` is null. Labelled for assistive
 * technology; the label is also shown beside the bar unless `hideLabel` is set.
 */
export function ProgressBar({
  value,
  label,
  hideLabel = false,
  className,
}: {
  value: number | null;
  label: string;
  hideLabel?: boolean;
  className?: string;
}) {
  const percent = value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={cn(
            'h-full rounded-full bg-accent transition-[width] duration-(--skb-duration-fast)',
            percent === null && 'w-1/3 animate-pulse motion-reduce:animate-none',
          )}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      {!hideLabel && (
        <span className="shrink-0 text-xs text-muted tabular-nums">
          {label}
          {percent !== null && ` · ${percent} %`}
        </span>
      )}
    </div>
  );
}
