import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'server',
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Each test file gets its own temporary vault/database; files can safely run in parallel.
    pool: 'forks',
  },
});
