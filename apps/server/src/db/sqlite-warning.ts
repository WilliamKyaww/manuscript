let installed = false;

/**
 * Node 24 marks `node:sqlite` as experimental and prints a warning when it loads. We filter exactly
 * that warning (ADR-0006); every other warning, experimental or not, is still emitted.
 */
export function installSqliteWarningFilter(): void {
  if (installed) return;
  installed = true;
  const original = process.emitWarning.bind(process) as (...args: unknown[]) => void;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const message = typeof warning === 'string' ? warning : warning.message;
    if (warningType(warning, rest[0]) === 'ExperimentalWarning' && /\bSQLite\b/i.test(message))
      return;
    original(warning, ...rest);
  }) as typeof process.emitWarning;
}

function warningType(warning: string | Error, options: unknown): unknown {
  if (typeof options === 'string') return options;
  if (typeof options === 'object' && options !== null) return (options as { type?: unknown }).type;
  return warning instanceof Error ? warning.name : undefined;
}
