import { Lightbulb, ListTree, Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Button, type ButtonVariant } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Dialog } from '../../components/Dialog';
import { IconButton } from '../../components/IconButton';
import { Input, Textarea } from '../../components/Input';
import { Kbd } from '../../components/Kbd';
import { Page, StickySection } from '../../components/Page';
import { ProgressBar } from '../../components/ProgressBar';
import { Spinner } from '../../components/Spinner';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/Tabs';
import { selectClasses } from '../learning/Field';
import { ColourSwatches, ShapeAndDepth, TypeScale } from './Swatches';

/**
 * The design system (task 20.02): every token and shared component, live, in the current theme. A
 * reference for building screens consistently and a quick check after changing a token. Nothing on
 * this page reads or changes your data.
 */

const VARIANTS: { variant: ButtonVariant; use: string }[] = [
  { variant: 'primary', use: 'The one main action of a page or dialogue' },
  { variant: 'secondary', use: 'Every other action' },
  { variant: 'ghost', use: 'Quiet actions in lists and toolbars' },
  { variant: 'link', use: 'A way to another page, among buttons' },
  { variant: 'danger-outline', use: 'Delete, in a page header' },
  { variant: 'danger', use: 'The confirming button of a delete' },
];
const TONES: BadgeTone[] = ['neutral', 'accent', 'success', 'warning', 'danger', 'info'];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-b border-border py-3 last:border-b-0 md:grid-cols-[14rem_1fr] md:items-center">
      <p className="text-xs text-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function DesignSystemPage() {
  const [dialog, setDialog] = useState<'plain' | 'confirm' | null>(null);
  return (
    <Page
      title="Design system"
      description="The tokens and components every screen is built from, in the current theme. Change the theme in Settings to compare."
      breadcrumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Design system' }]}
    >
      <StickySection
        title="Colour"
        description="Semantic tokens: components never use raw colours."
      >
        <ColourSwatches />
      </StickySection>

      <StickySection title="Type" description="Segoe UI Variable on Windows, then the system font.">
        <TypeScale />
      </StickySection>

      <StickySection title="Shape and depth" description="Three radii and three shadows.">
        <ShapeAndDepth />
      </StickySection>

      <StickySection title="Buttons" description="One primary action per view; delete asks first.">
        <Card className="px-4">
          {VARIANTS.map(({ variant, use }) => (
            <Row key={variant} label={`${variant} — ${use}`}>
              <Button variant={variant}>
                <Pencil aria-hidden="true" size={16} />
                Medium
              </Button>
              <Button variant={variant} size="sm">
                Small
              </Button>
              <Button variant={variant} disabled>
                Disabled
              </Button>
            </Row>
          ))}
          <Row label="Busy — a spinner, and the button is disabled">
            <Button variant="primary" loading>
              Saving
            </Button>
          </Row>
          <Row label="Icon buttons — always labelled; the label is the tooltip">
            <IconButton label="Add" icon={<Plus size={16} />} />
            <IconButton label="Delete" icon={<Trash2 size={16} />} size="sm" />
            <IconButton
              label="Toggle (pressed)"
              icon={<Lightbulb size={16} />}
              size="sm"
              aria-pressed
              className="aria-pressed:bg-accent-subtle aria-pressed:text-text"
            />
          </Row>
        </Card>
      </StickySection>

      <StickySection title="Form controls" description="Labelled, full width in forms.">
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <Input aria-label="Example text field" placeholder="A text field" />
          <select aria-label="Example choice" className={selectClasses} defaultValue="">
            <option value="">A choice…</option>
            <option value="a">First</option>
          </select>
          <Textarea
            aria-label="Example longer text"
            placeholder="Longer text"
            className="sm:col-span-2"
          />
        </div>
      </StickySection>

      <StickySection title="Badges, progress and keys">
        <Card className="px-4">
          <Row label="Badges — status and counts">
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </Row>
          <Row label="Progress — known and unknown">
            <ProgressBar value={0.62} label="Example progress" className="w-48" />
            <ProgressBar value={null} label="Example progress, unknown" className="w-48" />
            <Spinner label="Example spinner" />
          </Row>
          <Row label="Keys — shortcuts in menus and tooltips">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </Row>
        </Card>
      </StickySection>

      <StickySection
        title="Tabs"
        description="Words in a page; icons and a name in a narrow panel."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <Tabs defaultValue="one">
            <TabsList label="Example tabs">
              <TabsTrigger value="one">Drafts</TabsTrigger>
              <TabsTrigger value="two">Suggestions</TabsTrigger>
            </TabsList>
            <TabsContent value="one" className="pt-3 text-sm text-muted">
              The first tab’s content.
            </TabsContent>
            <TabsContent value="two" className="pt-3 text-sm text-muted">
              The second tab’s content.
            </TabsContent>
          </Tabs>
          <Tabs defaultValue="outline" className="max-w-60">
            <TabsList label="Example narrow tabs">
              <TabsTrigger value="outline" icon={<ListTree size={14} />}>
                Outline
              </TabsTrigger>
              <TabsTrigger value="graph" icon={<Network size={14} />}>
                Graph
              </TabsTrigger>
            </TabsList>
            <TabsContent value="outline" className="pt-3 text-sm text-muted">
              In a narrow panel, only the selected tab is named.
            </TabsContent>
            <TabsContent value="graph" className="pt-3 text-sm text-muted">
              The graph tab.
            </TabsContent>
          </Tabs>
        </div>
      </StickySection>

      <StickySection
        title="States"
        description="Every list and page has an empty, a loading and an error state."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <EmptyState
              title="No flashcards yet"
              description="Say what is missing and how to add it."
              action={<Button size="sm">The next step</Button>}
            />
          </Card>
          <Card>
            <LoadingState label="Loading an example" />
          </Card>
          <Card>
            <ErrorState
              message="An example error: what failed, in words."
              onRetry={() => undefined}
            />
          </Card>
        </div>
      </StickySection>

      <StickySection title="Dialogues" description="Focus is kept inside; Escape closes.">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog('plain')}>Open a dialogue</Button>
          <Button variant="danger-outline" onClick={() => setDialog('confirm')}>
            <Trash2 aria-hidden="true" size={16} />
            Delete…
          </Button>
        </div>
        <Dialog
          open={dialog === 'plain'}
          onOpenChange={(open) => !open && setDialog(null)}
          title="A dialogue"
          footer={
            <Button variant="primary" onClick={() => setDialog(null)}>
              Done
            </Button>
          }
        >
          <p className="text-sm">A title, the content, and the actions at the bottom right.</p>
        </Dialog>
        <ConfirmDialog
          open={dialog === 'confirm'}
          title="Delete the example?"
          confirmLabel="Delete example"
          onCancel={() => setDialog(null)}
          onConfirm={() => setDialog(null)}
        >
          <p>Says what is deleted and what is kept. (This one deletes nothing.)</p>
        </ConfirmDialog>
      </StickySection>
    </Page>
  );
}
