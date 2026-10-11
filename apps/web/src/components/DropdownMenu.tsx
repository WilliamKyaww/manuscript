import { DropdownMenu as RadixMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export const DropdownMenu = RadixMenu.Root;
export const DropdownMenuTrigger = RadixMenu.Trigger;
export const DropdownMenuGroup = RadixMenu.Group;

export function DropdownMenuContent({
  children,
  align = 'end',
  className,
  onCloseAutoFocus,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** Call `preventDefault()` to keep focus where an item put it (the find bar, the file tree). */
  onCloseAutoFocus?(event: Event): void;
}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        onCloseAutoFocus={onCloseAutoFocus}
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-44 animate-fade-in rounded-md border border-border bg-surface-raised p-1 text-sm shadow-md',
          // A long menu in a short window scrolls rather than running off the screen.
          'max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto',
          className,
        )}
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  disabled,
  tone = 'default',
  icon,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  icon?: ReactNode;
}) {
  return (
    <RadixMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none',
        'data-[disabled]:opacity-50 data-[highlighted]:bg-surface-hover',
        tone === 'danger' && 'text-danger',
      )}
    >
      {icon && (
        <span aria-hidden="true" className="flex text-muted">
          {icon}
        </span>
      )}
      {children}
    </RadixMenu.Item>
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <RadixMenu.Label className="px-2 py-1 text-xs font-medium text-subtle">
      {children}
    </RadixMenu.Label>
  );
}

export function DropdownMenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-border" />;
}
