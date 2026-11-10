import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, hasTouch: true, isMobile: true });
const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const area = page.locator('.arena-scroll'), zoom = () => page.locator('.board-grid').getAttribute('data-zoom').then(Number);
async function world(point) { return page.evaluate(p => { const r = document.querySelector('[data-cell="0-0"]').getBoundingClientRect(); return { x: (p.x - r.left) / r.width, y: (p.y - r.top) / r.height }; }, point); }
async function center() { const r = await area.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
async function checkAnchor(before, point, label) { const after = await world(point); assert.ok(Math.abs(before.x - after.x) < .05 && Math.abs(before.y - after.y) < .05, `${label}: ${JSON.stringify({ before, after })}`); }
async function middle() { await area.evaluate(el => { el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; el.scrollTop = (el.scrollHeight - el.clientHeight) / 2; }); }
async function waitZoom(old) { await page.waitForFunction(value => Number(document.querySelector('.board-grid').dataset.zoom) !== value, old); }
try {
  await page.goto(base); await page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).waitFor();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Увеличить клетки', exact: true }).click();
  await middle(); let point = await center(), before = await world(point), previous = await zoom();
  await page.getByRole('button', { name: 'Увеличить клетки', exact: true }).click(); await waitZoom(previous); await checkAnchor(before, point, 'toolbar center');
  const bounds = await area.boundingBox(); point = { x: bounds.x + bounds.width * .6, y: bounds.y + bounds.height * .55 }; before = await world(point); previous = await zoom();
  await page.mouse.move(point.x, point.y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.keyboard.up('Control'); await waitZoom(previous); await checkAnchor(before, point, 'Ctrl wheel cursor');
  assert.equal(await page.evaluate(() => visualViewport.scale), 1);
  point = await center(); before = await world(point); previous = await zoom(); await page.mouse.move(point.x, point.y); await page.keyboard.press('Control+-'); await waitZoom(previous); await checkAnchor(before, point, 'Ctrl minus center');
  await page.getByRole('button', { name: 'Настроить поле', exact: true }).click(); await page.getByLabel('Название поля').focus(); previous = await zoom(); await page.keyboard.press('Control+='); assert.equal(await zoom(), previous, 'form must not zoom map'); await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await middle(); const cdp = await context.newCDPSession(page); point = await center(); before = await world(point); previous = await zoom();
  const touch = (x, y, id) => ({ x, y, id });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(point.x - 25, point.y, 1), touch(point.x + 25, point.y, 2)] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(point.x + i - 25 - i * 1.5, point.y - i, 1), touch(point.x + i + 25 + i * 1.5, point.y - i, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await waitZoom(previous); await checkAnchor(before, { x: point.x + 8, y: point.y - 8 }, 'pinch moving center'); assert.equal(await page.evaluate(() => visualViewport.scale), 1); assert.equal(await page.getByRole('dialog').count(), 0);
  // At a fixed distance and at the upper zoom limit, centroid motion must still pan.
  for (let i = 0; i < 8 && await zoom() < 800; i++) await page.getByRole('button', { name: 'Увеличить клетки', exact: true }).click();
  await middle(); point = await center(); before = await world(point);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(point.x - 25, point.y, 3), touch(point.x + 25, point.y, 4)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(point.x - 5, point.y + 10, 3), touch(point.x + 45, point.y + 10, 4)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await checkAnchor(before, { x: point.x + 20, y: point.y + 10 }, 'constant zoom pinch pan');
  // One-finger native pan is still available on empty cells.
  const oldScroll = await area.evaluate(el => [el.scrollLeft, el.scrollTop]); point = await center();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(point.x, point.y, 5)] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(point.x - i * 6, point.y - i * 3, 5)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForFunction(old => { const el = document.querySelector('.arena-scroll'); return el.scrollLeft !== old[0] || el.scrollTop !== old[1]; }, oldScroll);
  await page.getByRole('button', { name: 'Показать всё поле', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click(); await page.getByRole('button', { name: 'Карточка', exact: true }).click(); const longName = 'Очень длинное имя персонажа '.repeat(2).slice(0, 70); await page.getByLabel('Имя персонажа').fill(longName); await page.getByRole('button', { name: 'Создать персонажа', exact: true }).click(); await page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click();
  const row = page.locator('.tree-unit'); const geometry = await row.evaluate(el => { const row = el.getBoundingClientRect(), name = el.querySelector('.tree-unit-name'), n = name.getBoundingClientRect(); return { height: row.height, overflow: name.scrollWidth > name.clientWidth, nowrap: getComputedStyle(name).whiteSpace, actions: Array.from(el.querySelectorAll('.tree-unit-actions button')).every(b => { const r = b.getBoundingClientRect(); return r.top >= row.top && r.bottom <= row.bottom && r.left >= n.right - 1; }) }; });
  assert.ok(geometry.height <= 53 && geometry.overflow && geometry.nowrap === 'nowrap' && geometry.actions, JSON.stringify(geometry)); assert.deepEqual(errors, []);
  console.log('PASS: center/cursor anchors, Ctrl controls/form scope, moving pinch, constant-zoom pinch pan, native one-finger pan, browser scale, compact inline library.');
} finally { await browser.close(); }
