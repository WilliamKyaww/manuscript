import { type ButtonHTMLAttributes, forwardRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Tooltip } from './Tooltip';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Required: icon-only buttons need an accessible name (ui.md §7). Also used as the tooltip. */
  label: string;
  icon: ReactNode;
  shortcut?: string;
  tooltip?: boolean;
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left';
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, shortcut, tooltip = true, tooltipSide, size = 'md', className, type, ...props },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-muted',
        'transition-colors duration-(--skb-duration-fast) hover:bg-surface-hover hover:text-text',
        'disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'size-7' : 'size-9',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="flex">
        {icon}
      </span>
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});
