# UI components

The shared component layer for the web app. Feature code uses these instead of raw Radix primitives,
raw colours or ad-hoc layout, so behaviour, accessibility and styling stay consistent (ui.md).

## Layout — the sticky-header rule

| Component | Use it for | Rules |
|---|---|---|
| `Page` (`Page.tsx`) | **Every route** | Exactly one per route. Title, description, `actions` and `toolbar` (tabs/filters) live in the fixed header; `children` go in the page body, the only scroll container. Sets `document.title`. Widths: `default`, `wide`, `full`. |
| `StickySection` (`Page.tsx`) | Groups inside a page body | Its header sticks to the top of the body while its content scrolls; labelled region with an `h2`. |

Never add another top-level scroll container inside a route, and never put page-level controls in the
body. The E2E suite (`e2e/shell.spec.ts`) checks every route.

## Primitives

| Component | Notes |
|---|---|
| `Button` | Variants `primary`, `secondary` (default), `ghost`, `danger`; sizes `sm`, `md`; `loading`; `asChild` to style a router `Link`. Always `type="button"` unless set. |
| `IconButton` | Icon-only; `label` is **required** (accessible name and tooltip); optional `shortcut` shown in the tooltip. |
| `Input`, `Textarea` | Use with a visible `<label>`; `aria-invalid` turns the border red. |
| `Badge` | Tones `neutral`, `accent`, `success`, `warning`, `danger`, `info`. Never the only carrier of meaning. |
| `Card`, `CardHeader`, `CardBody` | Surfaces; card titles are `h2` by default (pages own the `h1`). |
| `Kbd`, `Separator`, `Spinner` | `Spinner` needs a `label` unless decorative (`label=""`). |

## Overlays (Radix-based)

| Component | Notes |
|---|---|
| `Dialog` | `title` is required (visually hidden with `hideTitle`); focus trap, Escape, focus return built in. |
| `DropdownMenu*` | Menu with keyboard navigation; `tone="danger"` for destructive items. |
| `Tooltip` / `TooltipProvider` | Supplementary only: the trigger must already have an accessible name. |
| `Tabs*` | `TabsList` needs a `label`. |
| `Popover*` | `PopoverContent` needs a `label`. |

## States

`EmptyState`, `ErrorState` (retry + technical-details disclosure), `Skeleton`, `LoadingState` — every
data view uses these (ui.md §5). Placeholders for unbuilt areas name the phase that delivers them and
never show invented data.

## Styling

Use the token utilities (`bg-surface`, `text-muted`, `border-border`, `bg-accent`, …) defined in
`src/styles/index.css` from `src/styles/tokens.css`; do not use raw colour values. `cn()` (`lib/cn.ts`)
merges class names and resolves Tailwind conflicts.
