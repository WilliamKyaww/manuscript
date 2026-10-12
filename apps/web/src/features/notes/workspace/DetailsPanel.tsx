import { ArrowLeftFromLine, ArrowRightFromLine, ListTree, Network, Tags, X } from 'lucide-react';
import { IconButton } from '../../../components/IconButton';
import { Pane } from '../../../components/Pane';
import { EmptyState } from '../../../components/States';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/Tabs';
import { LocalGraph } from '../../graph/LocalGraph';
import { type SidePanel, useNotesUi } from '../notes-store';
import { BacklinksPanel } from '../panels/BacklinksPanel';
import { OutgoingPanel } from '../panels/OutgoingPanel';
import { OutlinePanel } from '../panels/OutlinePanel';
import { PropertiesPanel } from '../panels/PropertiesPanel';
import { useActiveNote } from './active-note';

/**
 * The Details panel (task 23.05): one panel beside the panes for the note in the active pane — its
 * outline, backlinks, outgoing links, properties and local graph. It starts closed.
 */
export function DetailsPanel() {
  const view = useActiveNote((state) => state.view);
  const panel = useNotesUi((state) => state.panel);
  const setPanel = useNotesUi((state) => state.setPanel);
  const setDetailsOpen = useNotesUi((state) => state.setDetailsOpen);
  const addPending = useNotesUi((state) => state.addPropertyPending);
  const addHandled = useNotesUi((state) => state.addPropertyHandled);

  return (
    <Tabs value={panel} onValueChange={(value) => setPanel(value as SidePanel)} className="h-full">
      <Pane
        title="Details"
        className="simplified:bg-surface"
        actions={
          <IconButton
            label="Close details"
            icon={<X size={15} />}
            size="sm"
            onClick={() => setDetailsOpen(false)}
          />
        }
        toolbar={
          <TabsList label="Note details" className="-mb-1.5 border-b-0">
            <TabsTrigger crowded value="outline" icon={<ListTree size={14} />}>
              Outline
            </TabsTrigger>
            <TabsTrigger crowded value="backlinks" icon={<ArrowLeftFromLine size={14} />}>
              Backlinks
            </TabsTrigger>
            <TabsTrigger crowded value="outgoing" icon={<ArrowRightFromLine size={14} />}>
              Outgoing
            </TabsTrigger>
            <TabsTrigger crowded value="properties" icon={<Tags size={14} />}>
              Properties
            </TabsTrigger>
            <TabsTrigger crowded value="graph" icon={<Network size={14} />}>
              Graph
            </TabsTrigger>
          </TabsList>
        }
      >
        <TabsContent value="outline">
          {view ? (
            <OutlinePanel headings={view.headings} onSelect={view.goToHeading} />
          ) : (
            <NoNote />
          )}
        </TabsContent>
        <TabsContent value="backlinks">
          {view ? <BacklinksPanel noteId={view.note.id} /> : <NoNote />}
        </TabsContent>
        <TabsContent value="outgoing">
          {view ? <OutgoingPanel links={view.note.links} /> : <NoNote />}
        </TabsContent>
        <TabsContent value="properties">
          {view ? (
            <PropertiesPanel
              key={view.note.id}
              text={view.text}
              readOnly={view.readOnly}
              onChange={view.setText}
              addRequested={addPending}
              onAddHandled={addHandled}
            />
          ) : (
            <NoNote />
          )}
        </TabsContent>
        <TabsContent value="graph">
          {view ? (
            <div className="p-3">
              <LocalGraph node={view.note.id} height={240} />
            </div>
          ) : (
            <NoNote />
          )}
        </TabsContent>
      </Pane>
    </Tabs>
  );
}

function NoNote() {
  return (
    <EmptyState
      title="No note open"
      description="Open a note to see its outline, links and properties here."
    />
  );
}
