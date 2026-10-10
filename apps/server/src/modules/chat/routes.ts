import {
  type ChatEvent,
  createThreadEndpoint,
  DecideApprovalsSchema,
  decideApprovalsPath,
  deleteThreadEndpoint,
  getThreadEndpoint,
  issuesFromZod,
  listThreadsEndpoint,
  SendMessageSchema,
  sendMessagePath,
  updateThreadEndpoint,
  ValidationError,
} from '@skb/core';
import type { Context } from 'hono';
import { stream } from 'hono/streaming';
import type { z } from 'zod';
import { type ApiRegistry, registerEndpoint } from '../../http/endpoint';
import type { Logger } from '../../shared/logger';
import type { ChatService } from './service';

const ok = { ok: true as const };

/** Reads and validates a JSON body that a streaming route takes (the endpoint helper does not). */
async function bodyOf<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ValidationError('The request body must be valid JSON.');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError('Invalid request body.', issuesFromZod(parsed.error));
  return parsed.data;
}

export function registerChatRoutes(registry: ApiRegistry, chat: ChatService, logger: Logger): void {
  registerEndpoint(registry, listThreadsEndpoint, ({ query }) => ({
    threads: chat.listThreads(query.q),
  }));
  registerEndpoint(registry, createThreadEndpoint, ({ body }) => chat.createThread(body));
  registerEndpoint(registry, getThreadEndpoint, ({ params }) => chat.getThread(params.id));
  registerEndpoint(registry, updateThreadEndpoint, ({ params, body }) =>
    chat.updateThread(params.id, body),
  );
  registerEndpoint(registry, deleteThreadEndpoint, ({ params }) => {
    chat.deleteThread(params.id);
    return ok;
  });

  // Both routes stream one JSON event per line (application/x-ndjson), like Ask.
  const streamEvents = (c: Context, events: (signal: AbortSignal) => AsyncGenerator<ChatEvent>) => {
    c.header('Content-Type', 'application/x-ndjson; charset=utf-8');
    c.header('Cache-Control', 'no-store');
    return stream(c, async (out) => {
      const stop = new AbortController();
      out.onAbort(() => stop.abort());
      const send = (event: ChatEvent) => out.write(`${JSON.stringify(event)}\n`);
      try {
        for await (const event of events(stop.signal)) await send(event);
      } catch (error) {
        if (stop.signal.aborted) return;
        logger.error('chat.stream.crashed', { error });
        await send({
          type: 'error',
          code: 'failed',
          message: 'Something went wrong while answering.',
        });
      }
    });
  };

  registry.app.post(sendMessagePath(':id'), async (c) => {
    const id = c.req.param('id') ?? '';
    const body = await bodyOf(c, SendMessageSchema);
    chat.assertCanSend(id); // a missing or busy thread is a normal problem response, not a stream
    return streamEvents(c, (signal) => chat.send(id, body, signal));
  });
  registry.app.post(decideApprovalsPath(':id'), async (c) => {
    const id = c.req.param('id') ?? '';
    const body = await bodyOf(c, DecideApprovalsSchema);
    chat.assertCanDecide(id);
    return streamEvents(c, (signal) => chat.decide(id, body, signal));
  });
}
