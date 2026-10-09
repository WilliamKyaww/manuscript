import {
  ASK_PATH,
  type AskEvent,
  AskEventSchema,
  type AskInput,
  CITATION,
  type Passage,
} from '@skb/core';
import { create } from 'zustand';
import type { ApiClient } from '../../lib/api/client';
import { describeError } from '../../lib/notify';
import { locatorHref } from '../library/links';

/**
 * The Ask panel's state (task 10.10), kept outside the panel so that the last answer is still
 * there when it is opened again — after following a citation, for instance.
 */

export type AskPhase = 'idle' | 'streaming' | 'done' | 'stopped' | 'failed';

interface AskState {
  open: boolean;
  phase: AskPhase;
  question: string;
  passages: Passage[];
  text: string;
  done: Extract<AskEvent, { type: 'done' }> | null;
  error: { code: string; message: string } | null;
  setOpen(open: boolean): void;
  ask(api: ApiClient, input: AskInput): Promise<void>;
  stop(): void;
}

let controller: AbortController | null = null;

export const useAsk = create<AskState>((set, get) => ({
  open: false,
  phase: 'idle',
  question: '',
  passages: [],
  text: '',
  done: null,
  error: null,
  setOpen: (open) => set({ open }),
  stop: () => controller?.abort(),
  async ask(api, input) {
    controller?.abort();
    const current = new AbortController();
    controller = current;
    set({
      phase: 'streaming',
      question: input.question,
      passages: [],
      text: '',
      done: null,
      error: null,
    });
    const apply = (event: AskEvent) => {
      if (controller !== current) return;
      if (event.type === 'passages') set({ passages: event.passages });
      else if (event.type === 'text') set({ text: get().text + event.delta });
      else if (event.type === 'done') set({ done: event, text: event.text, phase: 'done' });
      else set({ error: { code: event.code, message: event.message }, phase: 'failed' });
    };
    try {
      await api.stream(ASK_PATH, input, AskEventSchema, apply, current.signal);
      if (controller === current && get().phase === 'streaming') set({ phase: 'done' });
    } catch (reason) {
      if (controller !== current) return;
      if (current.signal.aborted) set({ phase: 'stopped' });
      else
        set({
          phase: 'failed',
          error: { code: 'request', message: describeError(reason).description },
        });
    }
  },
}));

const escapeTitle = (text: string) => text.replaceAll('"', "'").replace(/\s+/gu, ' ');

/** Turns `[S1, S3]` into links that open each passage where it is (a page, slide or line). */
export function withCitationLinks(text: string, passages: readonly Passage[]): string {
  const byKey = new Map(passages.map((passage) => [passage.key, passage]));
  return text.replace(CITATION, (match, inner: string) => {
    const links = inner.split(/\s*[,;]\s*/u).map((key) => {
      const passage = byKey.get(key);
      if (!passage) return `\\[${key}\\]`;
      const title = escapeTitle(`${passage.title}${passage.label ? ` · ${passage.label}` : ''}`);
      return `[\\[${key}\\]](${locatorHref(passage.locator)} "${title}")`;
    });
    return links.length ? links.join(' ') : match;
  });
}
