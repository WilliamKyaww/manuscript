import { defineConfig } from 'vitest/config';

// One Vitest project per workspace package; each package owns its own config.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'],
  },
});
