import { COLOUR_GROUPS, RADII, SHADOWS } from './tokens';

/** The value a token has in the current theme, as the browser resolved it. */
function tokenValues(): (token: string) => string {
  const style = typeof window === 'undefined' ? null : getComputedStyle(document.documentElement);
  return (token) => style?.getPropertyValue(`--skb-${token}`).trim() ?? '';
}

export function ColourSwatches() {
  const value = tokenValues();
  return (
    <div className="space-y-6">
      {COLOUR_GROUPS.map((group) => (
        <div key={group.title}>
          <h3 className="text-sm font-medium">{group.title}</h3>
          <p className="mb-2 text-xs text-muted">{group.description}</p>
          <ul
            aria-label={group.title}
            className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2"
          >
            {group.tokens.map((token) => (
              <li
                key={token}
                className="overflow-hidden rounded-md border border-border bg-surface text-xs"
              >
                <div
                  aria-hidden="true"
                  className="h-10 border-b border-border"
                  style={{ background: `var(--skb-${token})` }}
                />
                <div className="px-2 py-1.5">
                  <code className="block truncate font-mono">{token}</code>
                  <span className="block truncate text-muted">{value(token)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function TypeScale() {
  return (
    <dl className="space-y-3">
      {[
        [
          'Page title — text-xl semibold',
          'text-xl font-semibold tracking-tight',
          'Distributed Systems',
        ],
        ['Section title — text-sm semibold', 'text-sm font-semibold', 'Assessments'],
        [
          'Body — text-sm',
          'text-sm',
          'Raft splits consensus into leader election and log replication.',
        ],
        [
          'Note text — text-base',
          'text-base',
          'A candidate needs votes from a majority of the cluster.',
        ],
        ['Secondary — text-xs muted', 'text-xs text-muted', 'Weights add up to 100 %.'],
        ['Code — font-mono', 'font-mono text-sm', 'n.term++'],
      ].map(([name, classes, sample]) => (
        <div key={name} className="grid gap-1 sm:grid-cols-[16rem_1fr] sm:items-baseline">
          <dt className="text-xs text-muted">{name}</dt>
          <dd className={classes}>{sample}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ShapeAndDepth() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-medium">Radii</h3>
        <ul aria-label="Radii" className="flex gap-3">
          {RADII.map((token) => (
            <li key={token} className="text-center text-xs">
              <div
                aria-hidden="true"
                className="mb-1 size-16 border border-border-strong bg-surface-sunken"
                style={{ borderRadius: `var(--skb-${token})` }}
              />
              <code className="font-mono">{token}</code>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Elevation</h3>
        <ul aria-label="Elevation" className="flex gap-4">
          {SHADOWS.map((token) => (
            <li key={token} className="text-center text-xs">
              <div
                aria-hidden="true"
                className="mb-1 size-16 rounded-md bg-surface-raised"
                style={{ boxShadow: `var(--skb-${token})` }}
              />
              <code className="font-mono">{token}</code>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
