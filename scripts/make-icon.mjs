// Renders the application icon (apps/desktop/build/icon.png, 512 x 512) from the favicon, so that the
// installer, the executable and the window share one mark. Needs Playwright's Chromium.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const svg = readFileSync(path.join(root, 'apps', 'web', 'public', 'favicon.svg'), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img width="512" height="512" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`,
  );
  const png = await page.screenshot({
    omitBackground: true,
    clip: { x: 0, y: 0, width: 512, height: 512 },
  });
  const target = path.join(root, 'apps', 'desktop', 'build', 'icon.png');
  writeFileSync(target, png);
  console.log(`Icon written: ${path.relative(root, target)} (${png.length} bytes)`);
} finally {
  await browser.close();
}
