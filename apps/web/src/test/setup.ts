import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The first render of a lazily loaded route also transforms and imports its module, which can take
// longer than Testing Library's default one second (or even five) on a busy machine. Queries still finish as soon
// as the element appears; this only stops a cold start from failing a test.
configure({ asyncUtilTimeout: 15_000 });

afterEach(() => {
  cleanup();
});
