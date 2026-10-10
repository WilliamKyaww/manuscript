import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Each test file gets its own temporary vault/database; files can safely run in parallel.
    pool: 'forks',
    // Timings on a laptop vary two- to three-fold with load and battery (AGENTS.md): the default
    // 5 s fails tests that take 2 s alone when the whole suite runs at once. A real hang still fails.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
