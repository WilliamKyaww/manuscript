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
  },
});
