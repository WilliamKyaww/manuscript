import { useEffect, useRef, useSyncExternalStore } from 'react';
import { isApplePlatform } from '../../lib/platform';
import { type ShortcutDefinition, shortcutRegistry } from './registry';

/** Installs the single window-level keydown listener that dispatches to the registry. */
export function useShortcutDispatcher(): void {
  useEffect(() => {
    const apple = isApplePlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      shortcutRegistry.handle(event, apple);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

/**
 * Registers a shortcut for the lifetime of the calling component. The handler may change between
 * renders without re-registering.
 */
export function useShortcut(definition: ShortcutDefinition): void {
  const handlerRef = useRef(definition.handler);
  handlerRef.current = definition.handler;
  const { id, keys, description, group, allowInInputs } = definition;

  useEffect(() => {
    const unregister = shortcutRegistry.register({
      id,
      keys,
      description,
      group,
      ...(allowInInputs === undefined ? {} : { allowInInputs }),
      handler: (event) => handlerRef.current(event),
    });
    notify();
    return () => {
      unregister();
      notify();
    };
  }, [id, keys, description, group, allowInInputs]);
}

// Tiny subscription so the cheat sheet re-renders when shortcuts come and go.
const listeners = new Set<() => void>();
let version = 0;
function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function useRegisteredShortcuts(): ShortcutDefinition[] {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return shortcutRegistry.list();
}
