import type { ServerEvent } from '@skb/core';

/**
 * In-process publish/subscribe for server events, forwarded to browsers over SSE (`/api/events`).
 * Listeners must not throw; a failing listener is isolated so it cannot break the publisher.
 */
export interface EventBus {
  publish(event: ServerEvent): void;
  subscribe(listener: (event: ServerEvent) => void): () => void;
  readonly listenerCount: number;
}

export function createEventBus(onListenerError?: (error: unknown) => void): EventBus {
  const listeners = new Set<(event: ServerEvent) => void>();
  return {
    publish(event) {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (error) {
          onListenerError?.(error);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}
