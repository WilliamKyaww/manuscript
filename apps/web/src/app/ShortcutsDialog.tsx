import { Dialog } from '../components/Dialog';
import { Kbd } from '../components/Kbd';
import { isApplePlatform } from '../lib/platform';
import { useLayoutStore } from './layout-store';
import { keyLabels, normaliseKeys, type ShortcutGroup } from './shortcuts/registry';
import { useRegisteredShortcuts } from './shortcuts/useShortcuts';

const GROUP_ORDER: ShortcutGroup[] = ['General', 'Navigation', 'View', 'Editor', 'Review'];

/** Cheat sheet listing every shortcut currently registered (opened with ? or Ctrl+/). */
export function ShortcutsDialog() {
  const open = useLayoutStore((state) => state.shortcutsOpen);
  const setOpen = useLayoutStore((state) => state.setShortcutsOpen);
  const shortcuts = useRegisteredShortcuts();
  const apple = isApplePlatform();

  // Several ids may share a description (e.g. two ways to open this dialogue): show them on one row.
  const rows = new Map<string, { group: ShortcutGroup; description: string; keys: string[] }>();
  for (const shortcut of shortcuts) {
    const key = `${shortcut.group}|${shortcut.description}`;
    const row = rows.get(key) ?? {
      group: shortcut.group,
      description: shortcut.description,
      keys: [],
    };
    const normalised = normaliseKeys(shortcut.keys);
    if (!row.keys.includes(normalised)) row.keys.push(normalised);
    rows.set(key, row);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" size="md">
      <div className="space-y-5">
        {GROUP_ORDER.map((group) => {
          const items = [...rows.values()].filter((row) => row.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group} aria-label={group}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-subtle uppercase">
                {group}
              </h3>
              <dl className="divide-y divide-border">
                {items.map((row) => (
                  <div
                    key={row.description}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <dt>{row.description}</dt>
                    <dd className="flex items-center gap-2">
                      {row.keys.map((keys, index) => (
                        <span key={keys} className="flex items-center gap-1">
                          {index > 0 && <span className="text-xs text-subtle">or</span>}
                          {keyLabels(keys, apple).map((label) => (
                            <Kbd key={label}>{label}</Kbd>
                          ))}
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
