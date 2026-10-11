import { Check, ChevronRight } from 'lucide-react';
import { ContextMenu as RadixContext, DropdownMenu as RadixDropdown } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * A menu described as data (task 23.08), drawn either as a dropdown (the "More options" button) or
 * as a right-click menu (the file tree), so that the two menus for one file always offer the same
 * commands in the same words. Submenus open with the right arrow key as well as the pointer.
 */

export type MenuEntry =
  | {
      kind?: 'item';
      label: string;
      icon?: ReactNode;
      /** Shown on the right: a shortcut ("Ctrl+F") or a short note ("Desktop app"). */
      hint?: string;
      onSelect(): void;
      disabled?: boolean;
      tone?: 'default' | 'danger';
    }
  | {
      kind: 'checkbox';
      label: string;
      icon?: ReactNode;
      checked: boolean;
      onCheckedChange(checked: boolean): void;
      disabled?: boolean;
    }
  | {
      kind: 'radio';
      label?: string;
      value: string;
      options: readonly { value: string; label: string }[];
      onValueChange(value: string): void;
    }
  | { kind: 'submenu'; label: string; icon?: ReactNode; entries: MenuEntry[]; disabled?: boolean }
  | { kind: 'separator' };

/**
 * The two Radix menus share their parts and props; the context menu's are typed as the
 * dropdown's so that one renderer serves both.
 */
type Parts = Pick<
  typeof RadixDropdown,
  | 'Item'
  | 'CheckboxItem'
  | 'ItemIndicator'
  | 'RadioGroup'
  | 'RadioItem'
  | 'Label'
  | 'Separator'
  | 'Sub'
  | 'SubTrigger'
  | 'SubContent'
  | 'Portal'
>;
const PARTS: Record<'dropdown' | 'context', Parts> = {
  dropdown: RadixDropdown,
  context: RadixContext as unknown as Parts,
};

const ITEM = cn(
  'flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none',
  'data-[disabled]:opacity-50 data-[highlighted]:bg-surface-hover data-[state=open]:bg-surface-hover',
);
export const MENU_SURFACE =
  'z-50 min-w-52 animate-fade-in rounded-md border border-border bg-surface-raised p-1 text-sm shadow-md';

function Icon({ children }: { children?: ReactNode }) {
  return (
    <span aria-hidden="true" className="flex w-4 shrink-0 justify-center text-muted">
      {children}
    </span>
  );
}

export function MenuEntries({
  entries,
  as,
}: {
  entries: readonly MenuEntry[];
  as: 'dropdown' | 'context';
}) {
  const M = PARTS[as];
  return (
    <>
      {entries.map((entry, index) => {
        // Entries are a fixed list built for one render; their position is their identity.
        const key = `${index}-${entry.kind ?? 'item'}-${'label' in entry ? entry.label : ''}`;
        switch (entry.kind) {
          case 'separator':
            return <M.Separator key={key} className="my-1 h-px bg-border" />;
          case 'checkbox':
            return (
              <M.CheckboxItem
                key={key}
                checked={entry.checked}
                disabled={entry.disabled}
                onCheckedChange={(checked) => entry.onCheckedChange(checked === true)}
                className={ITEM}
              >
                <Icon>{entry.icon}</Icon>
                <span className="flex-1">{entry.label}</span>
                <M.ItemIndicator className="flex text-accent">
                  <Check aria-hidden="true" size={14} />
                </M.ItemIndicator>
              </M.CheckboxItem>
            );
          case 'radio':
            return (
              <M.RadioGroup
                key={key}
                value={entry.value}
                onValueChange={entry.onValueChange}
                aria-label={entry.label}
              >
                {entry.label && (
                  <M.Label className="px-2 py-1 text-xs font-medium text-subtle">
                    {entry.label}
                  </M.Label>
                )}
                {entry.options.map((option) => (
                  <M.RadioItem key={option.value} value={option.value} className={ITEM}>
                    <Icon>
                      <M.ItemIndicator className="flex text-accent">
                        <Check size={14} />
                      </M.ItemIndicator>
                    </Icon>
                    <span className="flex-1">{option.label}</span>
                  </M.RadioItem>
                ))}
              </M.RadioGroup>
            );
          case 'submenu':
            return (
              <M.Sub key={key}>
                <M.SubTrigger disabled={entry.disabled} className={ITEM}>
                  <Icon>{entry.icon}</Icon>
                  <span className="flex-1">{entry.label}</span>
                  <ChevronRight aria-hidden="true" size={14} className="text-subtle" />
                </M.SubTrigger>
                <M.Portal>
                  <M.SubContent sideOffset={4} className={MENU_SURFACE}>
                    <MenuEntries entries={entry.entries} as={as} />
                  </M.SubContent>
                </M.Portal>
              </M.Sub>
            );
          default:
            return (
              <M.Item
                key={key}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
                className={cn(ITEM, entry.tone === 'danger' && 'text-danger')}
              >
                <Icon>{entry.icon}</Icon>
                <span className="flex-1">{entry.label}</span>
                {entry.hint && <span className="pl-4 text-xs text-subtle">{entry.hint}</span>}
              </M.Item>
            );
        }
      })}
    </>
  );
}
