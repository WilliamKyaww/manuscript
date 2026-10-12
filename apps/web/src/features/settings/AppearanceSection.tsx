import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { RadioGroup, Switch } from 'radix-ui';
import { type ReactNode, useId } from 'react';
import {
  PALETTES,
  type PaletteId,
  type PaletteOption,
  useAppearance,
} from '../../app/theme/appearance';
import { type ThemePreference, useThemeStore } from '../../app/theme/theme';
import { StickySection } from '../../components/Page';
import { cn } from '../../lib/cn';
import { useNotesUi } from '../notes/notes-store';

/**
 * Settings → Appearance (Phase 24, ADR-0043): the theme, the colour palette and Simplified UI. Each applies
 * at once and is remembered on this computer; none changes data or what the application can do.
 */

const THEME_OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    value: 'light',
    label: 'Light',
    description: 'Light surfaces, for daylight',
    icon: <Sun size={18} />,
  },
  {
    value: 'dark',
    label: 'Dark',
    description: 'Low glare for long sessions',
    icon: <Moon size={18} />,
  },
  {
    value: 'system',
    label: 'Match system',
    description: 'Follow the Windows setting',
    icon: <Monitor size={18} />,
  },
];

const OPTION = cn(
  'rounded-lg border border-border bg-surface text-left outline-none',
  'hover:border-border-strong focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
  'data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle',
);

export function AppearanceSection() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const palette = useAppearance((state) => state.palette);
  const setPalette = useAppearance((state) => state.setPalette);
  const simplified = useAppearance((state) => state.simplified);
  const setSimplified = useAppearance((state) => state.setSimplified);
  const themeLabel = useId();
  const paletteLabel = useId();
  const simplifiedLabel = useId();
  const simplifiedHint = useId();
  const strictLabel = useId();
  const strictHint = useId();
  const strict = useNotesUi((state) => state.strictLineBreaks);
  const setStrict = useNotesUi((state) => state.setStrictLineBreaks);

  return (
    <StickySection
      title="Appearance"
      description="Applies immediately and is remembered on this computer. Nothing here changes your notes or what Manuscript can do."
    >
      <div className="space-y-6">
        <div>
          <div id={themeLabel} className="mb-3 text-sm font-medium">
            Theme
          </div>
          <RadioGroup.Root
            aria-labelledby={themeLabel}
            value={preference}
            onValueChange={(value) => setPreference(value as ThemePreference)}
            className="grid gap-3 sm:grid-cols-3"
          >
            {THEME_OPTIONS.map((option) => (
              <RadioGroup.Item
                key={option.value}
                value={option.value}
                className={cn(OPTION, 'flex items-center gap-3 p-3')}
              >
                <span aria-hidden="true" className="text-muted">
                  {option.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted">{option.description}</span>
                </span>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </div>

        <div>
          <div id={paletteLabel} className="mb-1 text-sm font-medium">
            Palette
          </div>
          <p className="mb-3 text-xs text-muted">
            Colours for surfaces, text and the accent, in light and dark. Status and mastery colours
            keep their meaning in every palette.
          </p>
          <RadioGroup.Root
            aria-labelledby={paletteLabel}
            value={palette}
            onValueChange={(value) => setPalette(value as PaletteId)}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {PALETTES.map((option) => (
              <RadioGroup.Item
                key={option.id}
                value={option.id}
                aria-describedby={`${paletteLabel}-${option.id}`}
                className={cn(OPTION, 'group overflow-hidden')}
              >
                <PalettePreview palette={option} />
                <span className="flex items-start gap-2 px-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{option.name}</span>
                    <span id={`${paletteLabel}-${option.id}`} className="block text-xs text-muted">
                      {option.description}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-0.5 hidden size-4 shrink-0 items-center justify-center rounded-full bg-accent text-accent-contrast group-data-[state=checked]:flex"
                  >
                    <Check size={11} strokeWidth={3} />
                  </span>
                </span>
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </div>

        <div className="flex items-start justify-between gap-6 rounded-lg border border-border bg-surface p-4">
          <div className="min-w-0">
            <label htmlFor={simplifiedLabel} className="block text-sm font-medium">
              Simplified UI
            </label>
            <p id={simplifiedHint} className="mt-0.5 text-xs text-muted">
              Reduce visual clutter and simplify the interface without removing features or
              functionality.
            </p>
          </div>
          <Switch.Root
            id={simplifiedLabel}
            checked={simplified}
            onCheckedChange={setSimplified}
            aria-describedby={simplifiedHint}
            className={cn(
              'relative mt-0.5 inline-flex h-6 w-10 shrink-0 cursor-default items-center rounded-full border border-border-strong bg-surface-sunken p-0.5 outline-none',
              'transition-colors duration-(--skb-duration-fast) focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
            )}
          >
            <Switch.Thumb
              className={cn(
                'block size-4 rounded-full bg-subtle shadow-sm transition-transform duration-(--skb-duration-fast)',
                'data-[state=checked]:translate-x-4 data-[state=checked]:bg-accent-contrast',
              )}
            />
          </Switch.Root>
        </div>

        <div className="flex items-start justify-between gap-6 rounded-lg border border-border bg-surface p-4">
          <div className="min-w-0">
            <label htmlFor={strictLabel} className="block text-sm font-medium">
              Strict line breaks
            </label>
            <p id={strictHint} className="mt-0.5 text-xs text-muted">
              Off, as in Obsidian: a single line break in a note is a line break in the reading
              view. On: only a blank line starts a new paragraph, as in standard Markdown.
            </p>
          </div>
          <Switch.Root
            id={strictLabel}
            checked={strict}
            onCheckedChange={setStrict}
            aria-describedby={strictHint}
            className={cn(
              'relative mt-0.5 inline-flex h-6 w-10 shrink-0 cursor-default items-center rounded-full border border-border-strong bg-surface-sunken p-0.5 outline-none',
              'transition-colors duration-(--skb-duration-fast) focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              'data-[state=checked]:border-accent data-[state=checked]:bg-accent',
            )}
          >
            <Switch.Thumb
              className={cn(
                'block size-4 rounded-full bg-subtle shadow-sm transition-transform duration-(--skb-duration-fast)',
                'data-[state=checked]:translate-x-4 data-[state=checked]:bg-accent-contrast',
              )}
            />
          </Switch.Root>
        </div>
      </div>
    </StickySection>
  );
}

/** A palette in miniature: a light window and a dark one, each with its sidebar, text and accent. */
function PalettePreview({ palette }: { palette: PaletteOption }) {
  return (
    <span aria-hidden="true" className="grid grid-cols-2 border-b border-border">
      {(['light', 'dark'] as const).map((mode) => {
        const colours = palette.preview[mode];
        return (
          <span
            key={mode}
            className="flex h-16 gap-1.5 p-2"
            style={{ backgroundColor: colours.bg }}
          >
            <span className="w-4 rounded-sm" style={{ backgroundColor: colours.chrome }} />
            <span className="flex flex-1 flex-col justify-center gap-1.5">
              <span
                className="h-1.5 w-3/4 rounded-full"
                style={{ backgroundColor: colours.text }}
              />
              <span
                className="h-1.5 w-1/2 rounded-full opacity-60"
                style={{ backgroundColor: colours.text }}
              />
              <span
                className="h-1.5 w-1/3 rounded-full"
                style={{ backgroundColor: colours.accent }}
              />
            </span>
          </span>
        );
      })}
    </span>
  );
}
