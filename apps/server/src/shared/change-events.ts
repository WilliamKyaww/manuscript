/**
 * Calls `notify` after each successful call of the named methods (and after their promise settles
 * successfully, for async ones). Used where services are wired up, so writes to data held only in
 * the database announce themselves (`data.changed`) without each service knowing about events.
 */
export function notifyingAfter<S extends object>(
  service: S,
  methods: readonly (keyof S & string)[],
  notify: () => void,
): S {
  const wrapped: S = { ...service };
  for (const name of methods) {
    const method = service[name];
    if (typeof method !== 'function') throw new Error(`${name} is not a method`);
    const call = (...args: unknown[]) => {
      const result = (method as (...values: unknown[]) => unknown)(...args);
      if (result instanceof Promise)
        return result.then((value) => {
          notify();
          return value;
        });
      notify();
      return result;
    };
    wrapped[name] = call as S[typeof name];
  }
  return wrapped;
}
