import type { NoteDetail } from '@skb/core';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../lib/api/client';
import { ApiProvider } from '../../../lib/api/context';
import { dispatchServerEvent } from '../../../lib/events';
import { createQueryClient } from '../../../lib/queryClient';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import { useNoteSession } from './useNoteSession';

const ID = 'note_01J9Z3K4M2Q8R5T7V9X1Y3Z5A7';

function detail(content: string, hash: string, extra: Partial<NoteDetail> = {}): NoteDetail {
  return {
    id: ID as NoteDetail['id'],
    path: 'A.md',
    title: 'A',
    type: null,
    aliases: [],
    updatedAt: '2026-10-07T12:00:00.000Z',
    content,
    hash,
    frontmatter: {},
    module: null,
    lecture: null,
    tags: [],
    createdAt: '2026-10-07T12:00:00.000Z',
    wordCount: 1,
    sizeBytes: content.length,
    idPersisted: false,
    headings: [],
    links: [],
    warnings: [],
    ...extra,
  };
}

type Reply = { status: number; body: unknown };

/** A fake server: records requests and answers from a queue (or with the current disk state). */
function fakeServer(initial: NoteDetail) {
  const requests: { method: string; body: { content: string; baseHash: string } | null }[] = [];
  const replies: Reply[] = [];
  let disk = initial;
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as { content: string; baseHash: string })
      : null;
    requests.push({ method: init?.method ?? 'GET', body });
    const reply = replies.shift();
    if (reply) return new Response(JSON.stringify(reply.body), { status: reply.status });
    if (init?.method === 'PUT' && body) {
      disk = detail(body.content, `hash:${body.content}`);
    }
    return new Response(JSON.stringify(disk), { status: 200 });
  };
  return {
    fetch,
    requests,
    reply: (status: number, body: unknown) => replies.push({ status, body }),
    setDisk: (next: NoteDetail) => {
      disk = next;
    },
  };
}

/** An editor stand-in that keeps the text and reports changes like CodeMirror. */
function fakeEditor(onChange: (text: string) => void) {
  let text = '';
  const handle: MarkdownEditorHandle = {
    focus: () => undefined,
    getText: () => text,
    setText: (next) => {
      text = next;
      onChange(next);
    },
    checkpoint: () => 1,
    applyToCheckpoint: (_id, from, to, insert) => {
      text = text.slice(0, from) + insert + text.slice(to);
      onChange(text);
    },
    releaseCheckpoint: () => undefined,
    insertAt: () => undefined,
    goToLine: () => undefined,
  };
  return {
    handle,
    type: (next: string) => {
      text = next;
      onChange(next);
    },
    text: () => text,
  };
}

function setUp(note: NoteDetail) {
  const server = fakeServer(note);
  const queryClient = createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiProvider client={createApiClient({ fetch: server.fetch })}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ApiProvider>
  );
  const ref: { current: MarkdownEditorHandle | null } = { current: null };
  const hook = renderHook(() => useNoteSession(note, ref), { wrapper });
  const editor = fakeEditor((text) => hook.result.current.onEditorChange(text));
  ref.current = editor.handle;
  editor.type(hook.result.current.editorText);
  return { server, hook, editor };
}

const flush = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(1100);
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useNoteSession', () => {
  it('autosaves after a pause, based on the version it opened', async () => {
    const { server, hook, editor } = setUp(detail('one', 'h1'));
    act(() => editor.type('one two'));
    expect(hook.result.current.status).toBe('unsaved');
    await flush();
    expect(server.requests).toEqual([
      { method: 'PUT', body: { content: 'one two', baseHash: 'h1' } },
    ]);
    expect(hook.result.current.status).toBe('saved');

    act(() => editor.type('one two three'));
    await flush();
    expect(server.requests[1]?.body?.baseHash).toBe('hash:one two');
  });

  it('raises a conflict instead of overwriting an external edit, and keeps mine only when asked', async () => {
    const { server, hook, editor } = setUp(detail('one', 'h1'));
    server.reply(409, {
      type: 'urn:skb:problem:conflict',
      title: 'Conflict',
      status: 409,
      code: 'conflict',
      details: { reason: 'changed', currentHash: 'theirs' },
    });
    act(() => editor.type('mine'));
    await flush();
    expect(hook.result.current.conflict).toEqual({ kind: 'changed', theirHash: 'theirs' });

    // Further typing does not save while the conflict is open.
    act(() => editor.type('mine, more'));
    await flush();
    expect(server.requests).toHaveLength(1);

    await act(async () => {
      await hook.result.current.keepMine();
    });
    expect(server.requests[1]?.body).toEqual({ content: 'mine, more', baseHash: 'theirs' });
    expect(hook.result.current.conflict).toBeNull();
  });

  it('reloads the version on disk when asked', async () => {
    const { server, hook, editor } = setUp(detail('one', 'h1'));
    server.reply(409, {
      type: 'x',
      title: 'Conflict',
      status: 409,
      code: 'conflict',
      details: { reason: 'changed', currentHash: 'h2' },
    });
    act(() => editor.type('mine'));
    await flush();
    server.setDisk(detail('their edit', 'h2'));
    await act(async () => {
      await hook.result.current.reload();
    });
    expect(editor.text()).toBe('their edit');
    expect(hook.result.current.conflict).toBeNull();
    expect(hook.result.current.status).toBe('saved');
  });

  it('follows external edits when nothing is unsaved, and raises a conflict when something is', async () => {
    const { server, hook, editor } = setUp(detail('one', 'h1'));
    server.setDisk(detail('changed elsewhere', 'h2'));
    await act(async () => {
      dispatchServerEvent({
        type: 'vault.changed',
        structure: false,
        notes: [
          {
            kind: 'updated',
            id: ID as NoteDetail['id'],
            path: 'A.md',
            from: null,
            hash: 'h2',
            origin: 'external',
          },
        ],
      });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(editor.text()).toBe('changed elsewhere');

    act(() => editor.type('changed elsewhere, and here'));
    act(() =>
      dispatchServerEvent({
        type: 'vault.changed',
        structure: false,
        notes: [
          {
            kind: 'updated',
            id: ID as NoteDetail['id'],
            path: 'A.md',
            from: null,
            hash: 'h3',
            origin: 'external',
          },
        ],
      }),
    );
    expect(hook.result.current.conflict).toEqual({ kind: 'changed', theirHash: 'h3' });

    act(() =>
      dispatchServerEvent({
        type: 'vault.changed',
        structure: true,
        notes: [
          {
            kind: 'deleted',
            id: ID as NoteDetail['id'],
            path: 'A.md',
            from: null,
            hash: null,
            origin: 'external',
          },
        ],
      }),
    );
    expect(hook.result.current.conflict).toEqual({ kind: 'deleted' });
  });

  it('ignores the announcement of its own save', async () => {
    const { hook, editor } = setUp(detail('one', 'h1'));
    act(() => editor.type('two'));
    await flush();
    act(() =>
      dispatchServerEvent({
        type: 'vault.changed',
        structure: false,
        notes: [
          {
            kind: 'updated',
            id: ID as NoteDetail['id'],
            path: 'A.md',
            from: null,
            hash: 'hash:two',
            origin: 'app',
          },
        ],
      }),
    );
    expect(hook.result.current.conflict).toBeNull();
    expect(editor.text()).toBe('two');
  });

  it('applies text the server added (an id) on top of the editor', async () => {
    const { server, hook, editor } = setUp(detail('Body', 'h1'));
    server.reply(200, detail('---\nid: note_X\n---\nBody!', 'h2'));
    act(() => editor.type('Body!'));
    await flush();
    expect(editor.text()).toBe('---\nid: note_X\n---\nBody!');
    expect(hook.result.current.status).toBe('saved');
  });

  it('keeps a byte-order mark the editor never shows', async () => {
    const { server, hook, editor } = setUp(detail('﻿Hello', 'h1'));
    expect(hook.result.current.editorText).toBe('Hello');
    act(() => editor.type('Hello there'));
    await flush();
    expect(server.requests[0]?.body?.content).toBe('﻿Hello there');
  });

  it('does not save read-only notes', async () => {
    const { server, hook, editor } = setUp(
      detail('caf�', 'h1', { warnings: [{ code: 'not-utf8', message: 'Not UTF-8' }] }),
    );
    expect(hook.result.current.readOnly).toBe(true);
    act(() => editor.type('changed'));
    await flush();
    expect(server.requests).toHaveLength(0);
  });
});
