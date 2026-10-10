import { Dialog } from '../components/Dialog';
import { Kbd } from '../components/Kbd';
import { isApplePlatform } from '../lib/platform';
import { useLayoutStore } from './layout-store';
import { PAGE_SHORTCUTS, type ReferenceShortcut } from './shortcuts/reference';
import { keyLabels, normaliseKeys, type ShortcutGroup } from './shortcuts/registry';
import { useRegisteredShortcuts } from './shortcuts/useShortcuts';

const GROUP_ORDER: ShortcutGroup[] = ['General', 'Navigation', 'View', 'Editor', 'Review'];
/** Registered only while their page is open, and always listed under "On a page" instead. */
const PAGE_IDS = /^review\./;

function Section({
  title,
  rows,
  apple,
}: {
  title: string;
  rows: ReferenceShortcut[];
  apple: boolean;
}) {
  return (
    <section aria-label={title}>
      <h4 className="eyebrow mb-1">{title}</h4>
      <dl className="divide-y divide-border">
        {rows.map((row) => (
          <div
            key={row.description}
            className="flex items-center justify-between gap-4 py-1.5 text-sm"
          >
            <dt>{row.description}</dt>
            <dd className="flex shrink-0 items-center gap-2">
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
}

/**
 * The cheat sheet (opened with ? or Ctrl+/): the shortcuts that work everywhere, from the registry,
 * then the keys of each page and control (task 20.20).
 */
export function ShortcutsDialog() {
  const open = useLayoutStore((state) => state.shortcutsOpen);
  const setOpen = useLayoutStore((state) => state.setShortcutsOpen);
  const shortcuts = useRegisteredShortcuts();
  const apple = isApplePlatform();

  // Several ids may share a description (e.g. two ways to open this dialogue): show them on one row.
  const rows = new Map<string, ReferenceShortcut & { group: ShortcutGroup }>();
  for (const shortcut of shortcuts) {
    if (PAGE_IDS.test(shortcut.id)) continue;
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
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" size="lg">
      <div className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Everywhere</h3>
          {GROUP_ORDER.map((group) => {
            const items = [...rows.values()].filter((row) => row.group === group);
            return items.length === 0 ? null : (
              <Section key={group} title={group} rows={items} apple={apple} />
            );
          })}
        </div>
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">On a page</h3>
          <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {PAGE_SHORTCUTS.map((section) => (
              <Section
                key={section.title}
                title={section.title}
                rows={section.items}
                apple={apple}
              />
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
