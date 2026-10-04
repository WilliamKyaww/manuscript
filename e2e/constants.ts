/** Fixed values shared by the Playwright configuration and the end-to-end tests. */
export const E2E_PORT = 4399;
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;
/** Passed to the server as SKB_AUTH_TOKEN; never used outside tests. */
export const E2E_TOKEN = 'e2e-token-0123456789abcdefghijklmnopqrstuvwxyz';
