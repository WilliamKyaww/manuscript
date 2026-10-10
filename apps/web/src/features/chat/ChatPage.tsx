import type { ChatThread } from '@skb/core';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Ellipsis, MessageSquarePlus, Pencil, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/DropdownMenu';
import { IconButton } from '../../components/IconButton';
import { Input } from '../../components/Input';
import { Page } from '../../components/Page';
import { Pane } from '../../components/Pane';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { notifyError } from '../../lib/notify';
import { threadQuery, threadsQuery, useChatActions } from './api';
import { ChatWorkspace } from './ChatWorkspace';

/**
 * Chat (tasks 13.03, 13.09): every conversation in a list you can search, rename and delete, and the
 * open one beside it. The same conversation opens in the side panel (Ctrl+J) from any page.
 */

function ThreadItem({
  thread,
  active,
  onRename,
  onDelete,
}: {
  thread: ChatThread;
  active: boolean;
  onRename(): void;
  onDelete(): void;
}) {
  return (
    <li
      className={cn(
        'group flex items-center gap-1 rounded-md pr-1',
        active ? 'bg-accent-subtle' : 'hover:bg-surface-hover',
      )}
    >
      <Link
        to="/chat/$threadId"
        params={{ threadId: thread.id }}
        aria-current={active ? 'page' : undefined}
        className="min-w-0 flex-1 px-2 py-1.5 text-sm"
      >
        <span className="block truncate font-medium">{thread.title}</span>
        <span className="flex items-center gap-1 text-xs text-muted">
          {formatDateTime(new Date(thread.updatedAt))}
          {thread.awaitingApproval && <Badge tone="warning">Waiting for you</Badge>}
        </span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            size="sm"
            label={`Actions for ${thread.title}`}
            icon={<Ellipsis aria-hidden="true" size={16} />}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onRename} icon={<Pencil size={14} />}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDelete} tone="danger" icon={<Trash2 size={14} />}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function ChatPage() {
  const api = useApi();
  const navigate = useNavigate();
  const { threadId } = useParams({ strict: false }) as { threadId?: string };
  const [search, setSearch] = useState('');
  const threads = useQuery(threadsQuery(api, search.trim()));
  const open = useQuery({ ...threadQuery(api, threadId ?? ''), enabled: Boolean(threadId) });
  const actions = useChatActions();
  const [renaming, setRenaming] = useState<ChatThread | null>(null);
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState<ChatThread | null>(null);

  const rename = () => {
    if (!renaming || !title.trim()) return;
    actions.update.mutate(
      { id: renaming.id, title: title.trim() },
      { onSuccess: () => setRenaming(null), onError: notifyError },
    );
  };
  const remove = () => {
    if (!deleting) return;
    const { id } = deleting;
    actions.remove.mutate(id, {
      onSuccess: () => {
        setDeleting(null);
        if (id === threadId) void navigate({ to: '/chat' });
      },
      onError: notifyError,
    });
  };

  return (
    <Page
      title="Chat"
      description="Ask about your material, be tutored, or let the assistant make things for you."
      width="full"
      layout="panes"
      actions={
        <Link to="/chat" className="inline-flex">
          <span className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-contrast hover:bg-accent-hover">
            <MessageSquarePlus aria-hidden="true" size={16} /> New chat
          </span>
        </Link>
      }
    >
      <Pane
        title="Conversations"
        className="w-72 flex-none border-r border-border max-md:w-52"
        toolbar={
          <div className="relative">
            <Search
              aria-hidden="true"
              size={14}
              className="pointer-events-none absolute top-2.5 left-2 text-muted"
            />
            <Input
              aria-label="Search conversations"
              type="search"
              className="h-8 pl-7"
              placeholder="Search conversations"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        }
      >
        <div className="p-2">
          {threads.isPending && <LoadingState label="Loading conversations" />}
          {threads.isError && (
            <ErrorState
              title="Could not load conversations"
              message="Check that the Manuscript server is running."
              onRetry={() => threads.refetch()}
            />
          )}
          {threads.data?.threads.length === 0 && (
            <p className="px-2 py-4 text-sm text-muted">
              {search.trim() ? 'No conversation matches.' : 'No conversations yet.'}
            </p>
          )}
          <ul aria-label="Conversations" className="space-y-0.5">
            {threads.data?.threads.map((thread) => (
              <ThreadItem
                key={thread.id}
                thread={thread}
                active={thread.id === threadId}
                onRename={() => {
                  setTitle(thread.title);
                  setRenaming(thread);
                }}
                onDelete={() => setDeleting(thread)}
              />
            ))}
          </ul>
        </div>
      </Pane>
      <Pane
        title={open.data?.title ?? 'New chat'}
        className="min-w-0 flex-1"
        bodyClassName="flex flex-col overflow-hidden"
      >
        {threadId && open.isError ? (
          <EmptyState
            title="This conversation does not exist"
            description="It may have been deleted."
            action={
              <Link to="/chat" className="underline">
                Start a new chat
              </Link>
            }
          />
        ) : (
          <ChatWorkspace
            key={threadId ?? 'new'}
            threadId={threadId ?? null}
            onThreadCreated={(id) =>
              void navigate({ to: '/chat/$threadId', params: { threadId: id } })
            }
          />
        )}
      </Pane>

      <Dialog
        open={renaming !== null}
        onOpenChange={(value) => !value && setRenaming(null)}
        title="Rename conversation"
        size="sm"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>Cancel</Button>
            <Button variant="primary" onClick={rename} loading={actions.update.isPending}>
              Rename
            </Button>
          </>
        }
      >
        <Input
          aria-label="Title"
          value={title}
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && rename()}
        />
      </Dialog>
      <Dialog
        open={deleting !== null}
        onOpenChange={(value) => !value && setDeleting(null)}
        title="Delete this conversation?"
        size="sm"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={actions.remove.isPending}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm">
          “{deleting?.title}” and its messages are deleted. Anything the assistant made in it stays,
          and can still be undone from Settings → Assistant actions.
        </p>
      </Dialog>
    </Page>
  );
}
