import { expect, test } from '@playwright/test';
import { E2E_TOKEN } from './constants';

test.describe('foundation', () => {
  test('signs in with the bootstrap link and shows a healthy server', async ({ page }) => {
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));

    await page.goto(`/auth?token=${E2E_TOKEN}`);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Study Knowledge Base' }),
    ).toBeVisible();
    await expect(page.getByText('Healthy')).toBeVisible();
    await expect(page.getByText(/SQLite 3\.\d+\.\d+/)).toBeVisible();
    // No script errors or Content-Security-Policy violations while loading.
    expect(problems).toEqual([]);
  });

  test('explains how to sign in when there is no session', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('alert')).toContainText('Sign-in required');
  });

  test('rejects an invalid sign-in link', async ({ page }) => {
    const response = await page.goto('/auth?token=not-the-token');
    expect(response?.status()).toBe(403);
    await expect(page.getByText('This sign-in link is not valid')).toBeVisible();
  });

  test('protects the API and serves client-side routes', async ({ request }) => {
    expect((await request.get('/api/health')).status()).toBe(401);
    expect((await request.get('/api/ping')).status()).toBe(200);
    const spaRoute = await request.get('/some/client/route');
    expect(spaRoute.status()).toBe(200);
    expect(await spaRoute.text()).toContain('<div id="root"></div>');
    expect(
      (
        await request.get('/api/unknown', { headers: { authorization: `Bearer ${E2E_TOKEN}` } })
      ).status(),
    ).toBe(404);
  });

  test('sends security headers with the page', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();
    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});
