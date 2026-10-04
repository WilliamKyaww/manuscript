import { describe, expect, it } from 'vitest';
import { installSqliteWarningFilter } from './sqlite-warning';

describe('installSqliteWarningFilter', () => {
  it('drops only the SQLite experimental warning', async () => {
    installSqliteWarningFilter();
    installSqliteWarningFilter(); // idempotent
    const seen: string[] = [];
    const listener = (warning: Error) => seen.push(warning.message);
    // Temporarily replace Node's default printer so the expected warnings do not clutter test output.
    const defaultListeners = process.listeners('warning');
    process.removeAllListeners('warning');
    process.on('warning', listener);
    try {
      process.emitWarning(
        'SQLite is an experimental feature and might change at any time',
        'ExperimentalWarning',
      );
      process.emitWarning('Some other feature is experimental', 'ExperimentalWarning');
      process.emitWarning('SQLite mentioned in an ordinary warning');
      // Warnings are delivered on the next tick.
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('warning', listener);
      for (const original of defaultListeners) process.on('warning', original);
    }
    expect(seen).toEqual([
      'Some other feature is experimental',
      'SQLite mentioned in an ordinary warning',
    ]);
  });
});
