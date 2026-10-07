import { EVENTS_PATH, type ServerEvent } from '@skb/core';
import { streamSSE } from 'hono/streaming';
import type { AppContext } from '../../context';
import type { ApiRegistry } from '../../http/endpoint';

const KEEP_ALIVE_MS = 25_000;

/**
 * Server-sent events (`GET /api/events`): vault changes and index progress, so open editors learn
 * about external edits and lists refresh themselves. Authenticated like every other API route.
 */
export function registerEventRoutes(registry: ApiRegistry, ctx: AppContext): void {
  registry.app.get(EVENTS_PATH, (c) =>
    streamSSE(c, async (stream) => {
      // Writes are chained so events reach the browser in the order they were published.
      let chain = Promise.resolve();
      const send = (event: ServerEvent) => {
        chain = chain
          .then(() => stream.writeSSE({ event: event.type, data: JSON.stringify(event) }))
          .catch(() => undefined);
        return chain;
      };
      const unsubscribe = ctx.events.subscribe((event) => {
        void send(event);
      });
      const keepAlive = setInterval(() => {
        chain = chain
          .then(() => stream.write(': keep-alive\n\n'))
          .then(
            () => undefined,
            () => undefined,
          );
      }, KEEP_ALIVE_MS);
      const closed = new Promise<void>((resolve) => stream.onAbort(resolve));
      try {
        await send({ type: 'hello', startedAt: ctx.startedAt.toISOString() });
        await closed;
      } finally {
        clearInterval(keepAlive);
        unsubscribe();
      }
    }),
  );
}
