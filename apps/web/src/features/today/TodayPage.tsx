import { CalendarRange, Keyboard, type LucideIcon, Search, TrendingDown } from 'lucide-react';
import { useLayoutStore } from '../../app/layout-store';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Page, StickySection } from '../../components/Page';
import { formatLongDate, greeting } from '../../lib/format';
import { DeadlinesWidget, ReviewsWidget, TargetWidget } from './LearningWidgets';

interface UpcomingWidget {
  title: string;
  description: string;
  phase: number;
  icon: LucideIcon;
}

/** What Today will show; each widget names the phase that delivers it rather than showing fake data. */
const WIDGETS: UpcomingWidget[] = [
  {
    title: 'Today’s plan',
    description:
      'Study blocks chosen from your deadlines, assessment weights and weakest concepts.',
    phase: 14,
    icon: CalendarRange,
  },
  {
    title: 'Weak areas',
    description:
      'Concepts that are slipping or have never been practised, with one-click practice.',
    phase: 9,
    icon: TrendingDown,
  },
];

export function TodayPage({ now = new Date() }: { now?: Date }) {
  const openPalette = useLayoutStore((state) => state.setCommandPaletteOpen);
  const openShortcuts = useLayoutStore((state) => state.setShortcutsOpen);

  return (
    <Page title="Today" description={`${greeting(now)} — ${formatLongDate(now)}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <ReviewsWidget />
        <DeadlinesWidget now={now} />
        <TargetWidget now={now} />
        {WIDGETS.map((widget) => (
          <Card key={widget.title} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 items-center justify-center rounded-md bg-surface-sunken text-muted"
                >
                  <widget.icon size={18} />
                </span>
                <h2 className="text-base font-semibold">{widget.title}</h2>
              </div>
              <Badge>Phase {widget.phase}</Badge>
            </div>
            <p className="mt-3 text-sm text-muted">{widget.description}</p>
          </Card>
        ))}
      </div>

      <StickySection title="Available now" className="mt-8">
        <ul className="grid gap-3 sm:grid-cols-2">
          <li>
            <Card className="flex h-full items-center justify-between gap-3 p-4">
              <span className="text-sm">Jump anywhere or run a command</span>
              <Button size="sm" onClick={() => openPalette(true)}>
                <Search aria-hidden="true" size={14} />
                Command palette
              </Button>
            </Card>
          </li>
          <li>
            <Card className="flex h-full items-center justify-between gap-3 p-4">
              <span className="text-sm">See every keyboard shortcut</span>
              <Button size="sm" onClick={() => openShortcuts(true)}>
                <Keyboard aria-hidden="true" size={14} />
                Shortcuts
              </Button>
            </Card>
          </li>
        </ul>
      </StickySection>
    </Page>
  );
}
