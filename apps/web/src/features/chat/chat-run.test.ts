import type { ChatEvent, ChatMessage, ToolPart } from '@skb/core';
import { describe, expect, it } from 'vitest';
import { applyChatEvent, type LiveRun, newRun, withRun } from './chat-run';

const NOW = '2026-10-10T09:00:00.000Z';
const ASSISTANT = 'msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M2' as ChatMessage['id'];

const call = (state: ToolPart['state'], extra: Partial<ToolPart> = {}): ToolPart => ({
  type: 'tool',
  callId: 'call_1',
  tool: 'list_notes',
  state,
  summary: 'Listing notes',
  risk: 'read',
  actionId: null,
  reason: null,
  input: {},
  output: null,
  approvalId: null,
  canAllowForChat: false,
  ...extra,
});

const play = (events: ChatEvent[], from: LiveRun = newRun()) => events.reduce(applyChatEvent, from);

describe('applying the stream', () => {
  it('builds the assistant message from text, passages and tool states', () => {
    const run = play([
      { type: 'assistant', id: ASSISTANT, createdAt: NOW },
      { type: 'tool', part: call('running') },
      { type: 'tool', part: call('ok', { summary: 'Listed 3 notes' }) },
      { type: 'text', delta: 'Found ' },
      { type: 'text', delta: 'three.' },
      { type: 'passages', passages: [] },
    ]);
    expect(run.assistant?.parts.map((part) => part.type)).toEqual(['passages', 'tool', 'text']);
    const tool = run.assistant?.parts.find((part) => part.type === 'tool');
    // A later state of the same call replaces the earlier one.
    expect(tool).toMatchObject({ state: 'ok', summary: 'Listed 3 notes' });
    const text = run.assistant?.parts.find((part) => part.type === 'text');
    expect(text).toMatchObject({ text: 'Found three.' });
  });

  it('starts a new text part after a tool, so the order of events is kept', () => {
    const run = play([
      { type: 'assistant', id: ASSISTANT, createdAt: NOW },
      { type: 'text', delta: 'Let me look.' },
      { type: 'tool', part: call('ok') },
      { type: 'text', delta: 'Done.' },
    ]);
    expect(run.assistant?.parts.map((part) => part.type)).toEqual(['text', 'tool', 'text']);
  });

  it('carries on in the message a paused run stopped in', () => {
    const paused = newRun({
      id: ASSISTANT,
      createdAt: NOW,
      parts: [call('running', { callId: 'call_2' })],
    });
    const run = play(
      [
        { type: 'assistant', id: ASSISTANT, createdAt: NOW },
        { type: 'tool', part: call('declined', { callId: 'call_2' }) },
      ],
      paused,
    );
    expect(run.assistant?.parts).toHaveLength(1);
    expect(run.assistant?.parts[0]).toMatchObject({ state: 'declined' });
  });

  it('tells a stop from a failure', () => {
    expect(play([{ type: 'error', code: 'cancelled', message: 'Stopped.' }]).phase).toBe('stopped');
    expect(play([{ type: 'error', code: 'provider', message: 'Down.' }])).toMatchObject({
      phase: 'failed',
      error: { code: 'provider', message: 'Down.' },
    });
  });
});

describe('showing a run over the saved messages', () => {
  const saved: ChatMessage[] = [
    {
      id: 'msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M0' as ChatMessage['id'],
      role: 'user',
      parts: [{ type: 'text', text: 'Earlier' }],
      mentions: [],
      createdAt: NOW,
    },
  ];

  it('appends the new messages, and replaces the one a run resumes', () => {
    const run = play([
      {
        type: 'user',
        message: { ...saved[0], id: 'msg_01J9Z3K4M2Q8R5T7V9X1Y3Z5M1' } as ChatMessage,
      },
      { type: 'assistant', id: ASSISTANT, createdAt: NOW },
      { type: 'text', delta: 'Hello' },
    ]);
    const shown = withRun(saved, run);
    expect(shown.map((message) => message.role)).toEqual(['user', 'user', 'assistant']);

    const savedWithAssistant: ChatMessage[] = [
      ...saved,
      {
        ...saved[0],
        id: ASSISTANT,
        role: 'assistant',
        parts: [call('awaiting_approval')],
      } as ChatMessage,
    ];
    const resumed = play(
      [
        { type: 'assistant', id: ASSISTANT, createdAt: NOW },
        { type: 'tool', part: call('ok') },
      ],
      newRun({ id: ASSISTANT, createdAt: NOW, parts: [call('running')] }),
    );
    const merged = withRun(savedWithAssistant, resumed);
    expect(merged).toHaveLength(2);
    expect(merged[1]?.parts[0]).toMatchObject({ state: 'ok' });
  });
});
