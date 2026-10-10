import { Keyboard, Search } from 'lucide-react';
import { useLayoutStore } from '../../app/layout-store';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Page, StickySection } from '../../components/Page';
import { formatLongDate, greeting } from '../../lib/format';
import { DeadlinesWidget, ReviewsWidget, TargetWidget, WeakAreasWidget } from './LearningWidgets';
import { ResurfaceWidget } from './ResurfaceWidget';
import { PlanWidget } from './TodayPlanWidget';

export function TodayPage({ now = new Date() }: { now?: Date }) {
  const openPalette = useLayoutStore((state) => state.setCommandPaletteOpen);
  const openShortcuts = useLayoutStore((state) => state.setShortcutsOpen);

  return (
    <Page title="Today" description={`${greeting(now)} — ${formatLongDate(now)}`}>
      <div className="grid gap-4 md:grid-cols-2">
        <ReviewsWidget />
        <DeadlinesWidget now={now} />
        <TargetWidget now={now} />
        <WeakAreasWidget />
        <PlanWidget />
        <ResurfaceWidget />
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
