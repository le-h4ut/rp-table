// Explicit live integration test. Creates and deletes one disposable Firebase account.
// Run only against the local Vite dev server: LIVE_QA=1 node tests/cloud-smoke.mjs
import { chromium } from 'playwright';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
if (process.env.LIVE_QA !== '1') throw new Error('Set LIVE_QA=1 to run the disposable live Firebase test.');
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
const context = await browser.newContext(); const secondContext = await browser.newContext(); const anonymousContext = await browser.newContext();
const page = await context.newPage(), second = await secondContext.newPage(), anonymous = await anonymousContext.newPage();
const credentials = { email: `rp-table-qa-${Date.now()}@example.com`, password: randomBytes(24).toString('base64url') };
let created = false;
try {
  for (const p of [page, second, anonymous]) {
    await p.addInitScript(() => { window.qaSdk = async kind => { const source = await (await fetch(kind === 'auth' ? '/src/App.tsx' : '/src/firebase.ts')).text(); const path = source.match(new RegExp('from "([^"]*firebase_' + kind + '\\.js[^"]*)"'))?.[1]; if (!path) throw new Error('Cannot find Vite SDK import'); return import(path); }; });
    await p.goto('http://127.0.0.1:5173/');
  }
  await page.evaluate(async ({ email, password }) => { const { auth, authReady } = await import('/src/firebase.ts'); const { createUserWithEmailAndPassword } = await window.qaSdk('auth'); await authReady; await createUserWithEmailAndPassword(auth, email, password); }, credentials); created = true;
  await page.getByText('На устройстве', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click(); await page.getByRole('button', { name: 'Карточка', exact: true }).click();
  await page.getByLabel('Имя персонажа').fill('Cloud QA'); await page.getByRole('button', { name: 'Создать персонажа', exact: true }).click(); await page.getByText('В облаке', { exact: true }).waitFor({ timeout: 30000 });
  const uid = await page.evaluate(async () => (await import('/src/firebase.ts')).auth.currentUser.uid);
  await second.evaluate(async ({ email, password }) => { const { auth, authReady } = await import('/src/firebase.ts'); const { signInWithEmailAndPassword } = await window.qaSdk('auth'); await authReady; await signInWithEmailAndPassword(auth, email, password); }, credentials);
  await second.getByText('В облаке', { exact: true }).waitFor({ timeout: 30000 }); await second.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click(); await second.getByRole('button', { name: /Cloud QA.*Персонаж/ }).click();
  assert.equal(await second.getByLabel('HP текущее', { exact: true }).inputValue(), '2000');
  // A concurrent edit must not be overwritten by the already open form.
  await page.getByRole('button', { name: 'Открыть библиотеку', exact: true }).click(); await page.getByRole('button', { name: /Cloud QA.*Персонаж/ }).click(); await page.getByLabel('OH текущее', { exact: true }).fill('+5'); await page.getByRole('button', { name: 'Сохранить', exact: true }).click(); await page.getByText('В облаке', { exact: true }).waitFor({ timeout: 30000 });
  await second.getByLabel('HP текущее', { exact: true }).fill('-100'); await second.getByRole('button', { name: 'Сохранить', exact: true }).click(); await second.getByRole('alert').filter({ hasText: 'Карточка изменилась' }).waitFor();
  const security = await page.evaluate(async () => {
    const { db, auth } = await import('/src/firebase.ts'); const { doc, getDoc, setDoc, serverTimestamp } = await window.qaSdk('firestore');
    const ref = doc(db, 'users', auth.currentUser.uid, 'boards', 'main'); const current = (await getDoc(ref)).data();
    async function denied(fn) { try { await fn(); return false; } catch (e) { return e.code === 'permission-denied'; } }
    const bad = { ...current, revision: current.revision + 1, updatedAt: serverTimestamp() };
    return {
      unknownField: await denied(() => setDoc(ref, { ...bad, isAdmin: true })),
      oversized: await denied(() => setDoc(ref, { ...bad, boardJson: 'x'.repeat(160001) })),
      wrongType: await denied(() => setDoc(ref, { ...bad, boardJson: 3 })),
      staleRevision: await denied(() => setDoc(ref, { ...bad, revision: current.revision })),
      siblingDocument: await denied(() => setDoc(doc(db, 'users', auth.currentUser.uid, 'boards', 'unlimited'), bad)),
      otherOwner: await denied(() => getDoc(doc(db, 'users', 'not-this-qa-user', 'boards', 'main'))),
    };
  }); assert.ok(Object.values(security).every(Boolean), JSON.stringify(security));
  const deniedAnonymous = await anonymous.evaluate(async uid => { const { db } = await import('/src/firebase.ts'); const { doc, getDoc } = await window.qaSdk('firestore'); try { await getDoc(doc(db, 'users', uid, 'boards', 'main')); return false; } catch (e) { return e.code === 'permission-denied'; } }, uid); assert.ok(deniedAnonymous);
  await page.reload(); await page.getByText('В облаке', { exact: true }).waitFor({ timeout: 30000 }); console.log('PASS: email registration, cloud save, separate browser login/load, stale form rejection, persistent login, 7 security restrictions.');
} finally {
  if (created) await page.evaluate(async () => { const { db, auth } = await import('/src/firebase.ts'); const { doc, deleteDoc } = await window.qaSdk('firestore'); const { deleteUser } = await window.qaSdk('auth'); if (auth.currentUser) { await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'boards', 'main')); await deleteUser(auth.currentUser); } });
  await browser.close();
}
