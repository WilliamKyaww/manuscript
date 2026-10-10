import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'happy-dom',
    // Embedded PDFs are iframes; the test DOM must not try to fetch them.
    environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // CSS is empty in tests, except the tokens, which the design-system test reads as text.
    css: { include: [/styles\/tokens\.css/] },
    // Timings on a laptop vary two- to three-fold with load and battery (AGENTS.md): the default
    // 5 s fails tests that take 2 s alone when the whole suite runs at once. A real hang still fails.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
