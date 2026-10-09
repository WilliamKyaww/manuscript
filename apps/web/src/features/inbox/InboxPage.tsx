import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Badge } from '../../components/Badge';
import { Page } from '../../components/Page';
import { ErrorState, LoadingState } from '../../components/States';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/Tabs';
import { useApi } from '../../lib/api/context';
import { draftsQuery, inboxKeys, proposalsQuery } from './api';
import { DraftsPanel } from './DraftsPanel';
import { ProposalsPanel } from './ProposalsPanel';

/**
 * The Inbox (tasks 11.13–11.14): what the AI generated or suggested, waiting for your decision.
 * Nothing here is part of your knowledge base until you accept it.
 */
export function InboxPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const drafts = useQuery(draftsQuery(api));
  const proposals = useQuery(proposalsQuery(api));
  const draftCount = (drafts.data?.cards.length ?? 0) + (drafts.data?.questions.length ?? 0);
  const proposalCount = proposals.data?.proposals.length ?? 0;
  const [tab, setTab] = useState<'drafts' | 'proposals'>('drafts');
  const [chosen, setChosen] = useState(false);
  // Open on whichever has something waiting, until the student picks a tab.
  useEffect(() => {
    if (!chosen && drafts.data && proposals.data && draftCount === 0 && proposalCount > 0)
      setTab('proposals');
  }, [chosen, drafts.data, proposals.data, draftCount, proposalCount]);

  return (
    // One tab set across the fixed header (the tabs) and the body (the panels); `contents` keeps
    // the page's own layout.
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setChosen(true);
        setTab(value as typeof tab);
      }}
      className="contents"
    >
      <Page
        title="Inbox"
        description="Generated cards and questions, and suggested concepts, relations, links and notes. Nothing here is part of your knowledge base until you accept it."
        toolbar={
          <TabsList label="Inbox">
            <TabsTrigger value="drafts">
              Drafts {drafts.data && <Badge>{draftCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="proposals">
              Suggestions {proposals.data && <Badge>{proposalCount}</Badge>}
            </TabsTrigger>
          </TabsList>
        }
      >
        <TabsContent value="drafts">
          {drafts.isPending && <LoadingState label="Loading drafts" />}
          {drafts.isError && (
            <ErrorState message={drafts.error.message} onRetry={() => void drafts.refetch()} />
          )}
          {drafts.data && (
            <DraftsPanel
              drafts={drafts.data}
              onEdited={() => void queryClient.invalidateQueries({ queryKey: inboxKeys.all })}
            />
          )}
        </TabsContent>
        <TabsContent value="proposals">
          {proposals.isPending && <LoadingState label="Loading suggestions" />}
          {proposals.isError && (
            <ErrorState
              message={proposals.error.message}
              onRetry={() => void proposals.refetch()}
            />
          )}
          {proposals.data && <ProposalsPanel proposals={proposals.data.proposals} />}
        </TabsContent>
      </Page>
    </Tabs>
  );
}
