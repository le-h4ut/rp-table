import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const openLibrary = () => page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click();
const dialog = () => page.getByRole('dialog');
const cell = name => page.getByRole('button', { name, exact: true });
async function dragMouse(from, to) {
  await from.scrollIntoViewIfNeeded(); const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 }); await page.mouse.up();
}
try {
  await page.goto(base); await page.getByRole('button', { name: 'Войти', exact: true }).first().waitFor();
  await openLibrary(); await dialog().getByRole('button', { name: 'Папка', exact: true }).click();
  await page.getByLabel('Название папки').fill('Персонажи'); await page.getByRole('button', { name: 'Сохранить папку', exact: true }).click();
  await dialog().getByRole('button', { name: 'Папка', exact: true }).click(); await page.getByLabel('Название папки').fill('Игровые'); await page.getByRole('button', { name: 'Сохранить папку', exact: true }).click();
  await dialog().getByRole('button', { name: 'Карточка', exact: true }).click();
  assert.equal(await page.getByLabel('Тип карточки').inputValue(), 'character');
  await page.getByLabel('Имя персонажа').fill('Теодор'); await page.getByLabel('OH текущее', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Создать персонажа', exact: true }).click();
  await openLibrary(); await dialog().getByRole('button', { name: /Теодор.*Персонаж/ }).click();
  await page.getByRole('button', { name: 'Поставить на поле', exact: true }).click(); await cell('A1, свободно').click();
  await dragMouse(cell('A1, Теодор'), cell('B2, свободно')); await cell('B2, Теодор').waitFor();
  assert.equal(await dialog().count(), 0, 'drag must not open a card');
  const circle = await cell('B2, Теодор').locator('.token').boundingBox();
  for (const kind of ['hp', 'oh']) { const bar = await cell('B2, Теодор').locator(`.token-stat.${kind}`).boundingBox(); assert.ok(bar.y >= circle.y + circle.height, 'bar must sit outside the circle'); }
  await cell('B2, Теодор').click(); const hpInput = page.getByLabel('HP текущее', { exact: true });
  await hpInput.fill('-300'); await hpInput.press('Enter'); assert.equal(await hpInput.inputValue(), '1700'); assert.ok(await dialog().isVisible(), 'Enter must keep card open');
  await hpInput.fill('+100'); await hpInput.press('Enter'); assert.equal(await hpInput.inputValue(), '1800', 'successive delta uses preview');
  await page.getByLabel('OH текущее', { exact: true }).fill('+5'); await page.getByLabel('OH текущее', { exact: true }).press('Enter'); assert.equal(await page.getByLabel('OH текущее', { exact: true }).inputValue(), '15'); await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await cell('B2, Теодор').click(); assert.equal(await hpInput.inputValue(), '1800'); assert.equal(await page.getByLabel('OH текущее', { exact: true }).inputValue(), '15');
  await hpInput.fill('+1000'); await hpInput.press('Enter'); assert.equal(await hpInput.inputValue(), '2000'); assert.ok(await dialog().isVisible());
  await page.getByLabel('OH текущее', { exact: true }).fill('99999'); await page.getByLabel('OH текущее', { exact: true }).press('Enter'); assert.equal(await page.getByLabel('OH текущее', { exact: true }).inputValue(), '10909');
  await dialog().getByRole('button', { name: 'Закрыть', exact: true }).click();
  const cdp = await context.newCDPSession(page); const a = await cell('B2, Теодор').boundingBox(), b = await cell('C3, свободно').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }] });
  for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + a.width / 2 + (b.x - a.x) * i / 12, y: a.y + a.height / 2 + (b.y - a.y) * i / 12 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cell('C3, Теодор').waitFor();
  await page.reload(); await cell('C3, Теодор').waitFor(); await openLibrary(); await dialog().getByRole('button', { name: /Теодор.*Персонаж/ }).waitFor();
  assert.match(await dialog().innerText(), /Игровые/); await dialog().getByRole('button', { name: 'Закрыть', exact: true }).click();
  for (const [width, height] of [[320, 720], [390, 844], [844, 390], [768, 1024], [1440, 1000]]) {
    await page.setViewportSize({ width, height }); const size = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth })); assert.ok(size.page <= size.viewport, `page overflow at ${width}`);
    await openLibrary(); assert.ok(await dialog().isVisible()); await dialog().getByRole('button', { name: 'Закрыть', exact: true }).click();
  }
  assert.deepEqual(errors, []); console.log('PASS: folders, typed card, external HP/OH, relative input, mouse drag, touch drag, reload, 5 screen sizes.');
} finally { await browser.close(); }
