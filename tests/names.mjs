import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext({ viewport: { width: 320, height: 720 }, hasTouch: true });
const page = await context.newPage(); const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const library = () => page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click();
async function create(name, cell) {
  await library(); await page.getByRole('button', { name: 'Карточка', exact: true }).click(); await page.getByLabel('Имя персонажа').fill(name); await page.getByRole('button', { name: 'Создать персонажа', exact: true }).click();
  await library(); await page.getByRole('button', { name: `На поле: ${name}`, exact: true }).click(); await page.getByRole('button', { name: `${cell}, свободно`, exact: true }).click();
}
async function check(cell, name, label) {
  const token = page.getByRole('button', { name: `${cell}, ${name}`, exact: true }).locator('.token-label text');
  assert.equal(await token.textContent(), label);
  const bbox = await token.evaluate(el => { const b = el.getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  for (const x of [bbox.x, bbox.x + bbox.width]) for (const y of [bbox.y, bbox.y + bbox.height]) assert.ok(Math.hypot(x - 50, y - 50) < 50, `${label}: text clipped by circle ${JSON.stringify(bbox)}`);
}
try {
  await page.goto(base); await page.getByRole('button', { name: 'Войти', exact: true }).first().waitFor();
  await create('Фиолетовая слизь', 'A1'); await check('A1', 'Фиолетовая слизь', 'ФС');
  await library(); await page.getByRole('button', { name: 'На поле: Фиолетовая слизь', exact: true }).click(); await page.getByRole('button', { name: 'B1, свободно', exact: true }).click(); await check('B1', 'Фиолетовая слизь №2', 'ФС 2');
  await create('Фиолетовая слизь №546', 'C1'); await check('C1', 'Фиолетовая слизь №546', 'ФС 546');
  await create('Прототип «№6»', 'D1'); await check('D1', 'Прототип «№6»', 'П№6');
  await library(); await page.getByRole('button', { name: 'На поле: Прототип «№6»', exact: true }).click(); await page.getByRole('button', { name: 'E1, свободно', exact: true }).click(); await check('E1', 'Прототип «№6» №2', 'П№6 2');
  await create('Прототип «№6» №546', 'F1'); await check('F1', 'Прототип «№6» №546', 'П№6 546');
  await library(); await page.getByRole('button', { name: 'Клонировать: Фиолетовая слизь №2', exact: true }).click(); await page.getByRole('button', { name: 'На поле: Фиолетовая слизь №547', exact: true }).waitFor(); await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Увеличить клетки', exact: true }).click(); await check('F1', 'Прототип «№6» №546', 'П№6 546');
  await page.reload(); await check('B1', 'Фиолетовая слизь №2', 'ФС 2'); await check('E1', 'Прототип «№6» №2', 'П№6 2');
  console.log('PASS: №2 clone names, max family numbering, all requested token labels, full SVG glyph bounds at phone/zoom, reload.');
} finally { await browser.close(); }
