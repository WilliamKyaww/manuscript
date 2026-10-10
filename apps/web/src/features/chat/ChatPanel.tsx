import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Maximize2, MessageSquarePlus, X } from 'lucide-react';
import { useEffect } from 'react';
import { IconButton } from '../../components/IconButton';
import { useApi } from '../../lib/api/context';
import { cn } from '../../lib/cn';
import { selectClasses } from '../learning/Field';
import { threadsQuery } from './api';
import { ChatWorkspace } from './ChatWorkspace';
import { useChat } from './chat-store';

/**
 * The chat side panel (task 13.09): Ctrl+J opens it beside whatever page you are on. The page stays
 * usable, and the assistant knows which page it is (and what you selected on it).
 */

export const MESSAGE_FIELD = 'textarea[aria-label="Message"]';

export function ChatPanel() {
  const api = useApi();
  const open = useChat((state) => state.panelOpen);
  const threadId = useChat((state) => state.panelThreadId);
  const threads = useQuery({ ...threadsQuery(api), enabled: open });

  // Opening the panel puts the cursor in the message box.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>(`[data-chat-panel] ${MESSAGE_FIELD}`)?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Escape closes the panel from inside it, or from the page when nothing else has the keyboard.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const active = document.activeElement;
      const inside = Boolean(active?.closest('[data-chat-panel]'));
      if (inside || active === document.body || active === null) {
        event.preventDefault();
        useChat.getState().closePanel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const close = () => useChat.getState().closePanel();
  return (
    <aside
      aria-label="Chat panel"
      data-chat-panel
      className={cn(
        'flex w-[26rem] max-w-[45vw] flex-none flex-col border-l border-border bg-surface',
        'max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:w-full max-md:max-w-none',
      )}
    >
      <header className="flex flex-none items-center gap-1 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Chat</h2>
        <select
          aria-label="Conversation"
          className={cn(selectClasses, 'ml-2 h-8 min-w-0 flex-1')}
          value={threadId ?? ''}
          onChange={(event) => useChat.getState().setPanelThread(event.target.value || null)}
        >
          <option value="">New chat</option>
          {threads.data?.threads.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {thread.title}
            </option>
          ))}
        </select>
        <IconButton
          size="sm"
          label="New chat"
          icon={<MessageSquarePlus aria-hidden="true" size={16} />}
          onClick={() => useChat.getState().setPanelThread(null)}
        />
        <Link
          to={threadId ? '/chat/$threadId' : '/chat'}
          params={threadId ? { threadId } : undefined}
          aria-label="Open in the Chat page"
          title="Open in the Chat page"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-text"
          onClick={close}
        >
          <Maximize2 aria-hidden="true" size={16} />
        </Link>
        <IconButton
          size="sm"
          label="Close chat panel"
          icon={<X aria-hidden="true" size={16} />}
          onClick={close}
        />
      </header>
      <div className="min-h-0 flex-1">
        <ChatWorkspace
          key={threadId ?? 'new'}
          threadId={threadId}
          compact
          onThreadCreated={(id) => useChat.getState().setPanelThread(id)}
        />
      </div>
    </aside>
  );
}
