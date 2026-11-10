import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
try {
  const page = await browser.newPage(); const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
  await page.goto(base); const session = await page.context().newCDPSession(page); const result = await session.send('Page.getAppManifest');
  assert.deepEqual(result.errors, []); const manifest = JSON.parse(result.data); assert.equal(manifest.display, 'standalone');
  const scope = new URL(manifest.scope, result.url), start = new URL(manifest.start_url, result.url);
  assert.equal(scope.href, new URL('./', base).href); assert.ok(start.href.startsWith(scope.href)); assert.equal(new URL(manifest.id, result.url).href, scope.href);
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(i => i.sizes === `${size}x${size}`); assert.ok(icon);
    const url = new URL(icon.src, result.url).href; assert.ok(url.startsWith(scope.href));
    const actual = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); return [image.naturalWidth, image.naturalHeight]; }, url); assert.deepEqual(actual, [size, size]);
  }
  const install = await session.send('Page.getInstallabilityErrors');
  // Playwright's isolated context is private; installation is intentionally disabled there.
  assert.deepEqual(install.installabilityErrors.filter(e => e.errorId !== 'in-incognito'), []);
  console.log('PASS: standalone PWA manifest, scope/start/id and real 192/512px icons; no installability errors except private-context restriction.');
} finally { await browser.close(); }
