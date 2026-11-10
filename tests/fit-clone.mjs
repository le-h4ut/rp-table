import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const openLibrary = () => page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click();
const close = () => page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
async function dimensions(cols, rows) { await page.getByRole('button', { name: 'Настроить поле', exact: true }).click(); await page.getByLabel('Ширина, клеток').fill(String(cols)); await page.getByLabel('Высота, клеток').fill(String(rows)); await page.getByRole('button', { name: 'Применить', exact: true }).click(); }
async function fit() {
  await page.getByRole('button', { name: 'Показать всё поле', exact: true }).click();
  await page.waitForFunction(() => { const s = document.querySelector('.arena-scroll'), g = document.querySelector('.board-grid'), last = g.querySelector('.grid-row:last-child .cell:last-child').getBoundingClientRect(); return s.clientHeight > 0 && s.scrollWidth <= s.clientWidth + 1 && s.scrollHeight <= s.clientHeight + 1 && last.bottom <= innerHeight + 1; });
  return page.evaluate(() => { const s = document.querySelector('.arena-scroll'); return { width: s.clientWidth, height: s.clientHeight, cell: Number(document.querySelector('.board-grid').dataset.cellSize), pageHeight: document.documentElement.scrollHeight, viewport: innerHeight }; });
}
try {
  await page.goto(base); await page.getByRole('button', { name: 'Войти', exact: true }).first().waitFor();
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [768, 1024], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    for (const [cols, rows] of [[10, 10], [50, 50], [1, 50], [50, 1]]) { await dimensions(cols, rows); const size = await fit(); assert.ok(size.pageHeight <= size.viewport + 1, JSON.stringify({ width, height, cols, rows, size })); }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await dimensions(10, 10);
  for (let i = 0; i < 15 && await page.getByRole('button', { name: 'Увеличить клетки', exact: true }).isEnabled(); i++) await page.getByRole('button', { name: 'Увеличить клетки', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Показать всё поле', exact: true }).innerText(), '800%');
  await page.locator('.arena-scroll').evaluate(el => { el.scrollLeft = 500; el.scrollTop = 500; }); await fit();
  assert.deepEqual(await page.locator('.arena-scroll').evaluate(el => [el.scrollLeft, el.scrollTop]), [0, 0]);
  await openLibrary(); await page.getByRole('button', { name: 'Карточка', exact: true }).click(); await page.getByLabel('Имя персонажа').fill('Слизь'); await page.getByRole('button', { name: 'Создать персонажа', exact: true }).click();
  await openLibrary(); await page.getByRole('button', { name: 'На поле: Слизь', exact: true }).click(); await page.getByRole('button', { name: 'A1, свободно', exact: true }).click();
  await openLibrary(); await page.getByRole('button', { name: 'На поле: Слизь', exact: true }).click(); await page.getByRole('button', { name: 'B1, свободно', exact: true }).click(); await page.getByRole('button', { name: 'B1, Слизь №2', exact: true }).waitFor(); await page.getByRole('button', { name: 'A1, Слизь', exact: true }).waitFor();
  await page.getByRole('button', { name: 'B1, Слизь №2', exact: true }).click(); await page.getByLabel('HP текущее', { exact: true }).fill('123'); await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.getByRole('button', { name: 'A1, Слизь', exact: true }).click(); assert.equal(await page.getByLabel('HP текущее', { exact: true }).inputValue(), '2000'); await close();
  await openLibrary(); await page.getByRole('button', { name: 'Клонировать: Слизь', exact: true }).click(); await page.getByRole('button', { name: 'На поле: Слизь №3', exact: true }).waitFor(); assert.equal(await page.getByRole('dialog').getAttribute('aria-label'), 'Библиотека');
  await page.getByRole('button', { name: 'На поле: Слизь', exact: true }).click(); await page.getByRole('button', { name: 'Отмена', exact: true }).click(); await openLibrary(); await page.getByRole('button', { name: 'На поле: Слизь №4', exact: true }).waitFor();
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Удалить: Слизь №2', exact: true }).click(); await close(); assert.equal(await page.getByRole('button', { name: 'B1, Слизь №2', exact: true }).count(), 0); await page.getByRole('button', { name: 'A1, Слизь', exact: true }).waitFor();
  await page.reload(); await page.getByRole('button', { name: 'A1, Слизь', exact: true }).waitFor(); await fit(); assert.deepEqual(errors, []);
  console.log('PASS: 20 viewport/board fit combinations, 800% zoom/reset, automatic/explicit independent clones, cancel reserve, delete token, reload.');
} finally { await browser.close(); }
