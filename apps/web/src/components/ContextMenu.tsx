import { ContextMenu as RadixMenu } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Right-click (and Shift+F10 / Menu key) menu, styled like `DropdownMenu`. Every action in a context
 * menu must also be reachable another way (keyboard shortcut or a visible control).
 */
export const ContextMenu = RadixMenu.Root;
export const ContextMenuTrigger = RadixMenu.Trigger;

export function ContextMenuContent({
  children,
  className,
  onCloseAutoFocus,
}: {
  children: ReactNode;
  className?: string;
  /** Call `preventDefault()` to keep focus where an item put it (an inline rename field). */
  onCloseAutoFocus?(event: Event): void;
}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        onCloseAutoFocus={onCloseAutoFocus}
        className={cn(
          'z-50 min-w-48 animate-fade-in rounded-md border border-border bg-surface-raised p-1 text-sm shadow-md',
          className,
        )}
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function ContextMenuItem({
  children,
  onSelect,
  disabled,
  tone = 'default',
  icon,
  shortcut,
}: {
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
  icon?: ReactNode;
  shortcut?: string;
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
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-xs text-subtle">{shortcut}</span>}
    </RadixMenu.Item>
  );
}

export function ContextMenuSeparator() {
  return <RadixMenu.Separator className="my-1 h-px bg-border" />;
}
