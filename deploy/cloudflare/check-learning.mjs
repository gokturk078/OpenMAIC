import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const local = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const base = local('wrangler.jsonc').vars.PUBLIC_ORIGIN;
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const cookie = local('.secrets.session-0.json').cookie;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const cookies = cookie.split('; ').map((v) => {
    const n = v.indexOf('=');
    return { url: base, name: v.slice(0, n), value: v.slice(n + 1), secure: true, httpOnly: true };
  });
  await ctx.addCookies(cookies);
  ctx.setDefaultTimeout(90000);
  const run = (
    await (
      await ctx.request.get(base + '/api/generation-runs/' + local('.secrets.runs.json').math.id)
    ).json()
  ).run;
  await ctx.route(/\/api\/(?:generate\/|chat\/pi|transcription|quiz-grade)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) =>
    console.log('page error', e.stack?.split('\n').slice(0, 3).join(' ').slice(0, 300)),
  );
  await page.goto(base + '/classroom/' + run.stageId);
  await page
    .getByRole('button', { name: 'Open Whiteboard', exact: true })
    .click({ timeout: 85000 });
  console.log(
    'whiteboard opened',
    await page.locator('canvas').count(),
    (await page.locator('body').innerText()).slice(-180),
  );
  const closeBoard = page.getByRole('button', { name: /minimize whiteboard|close whiteboard/i });
  if (await closeBoard.count()) await closeBoard.first().click();
  else await page.keyboard.press('Escape');
  if (!(await page.getByTestId('scene-item').first().isVisible()))
    await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
  await page.getByTestId('scene-item').first().waitFor({ timeout: 10000 });
  const items = page.getByTestId('scene-item');
  console.log(
    'classroom scenes',
    await items.count(),
    await page.getByTestId('scene-title').allTextContents(),
  );
  assert.ok((await items.count()) >= 3);
  await items.last().click();
  await page.waitForTimeout(1200);
  console.log('quiz view', (await page.locator('body').innerText()).slice(-1400));
  console.log(
    'classroom buttons',
    await page.getByRole('button').evaluateAll((bs) =>
      bs
        .map((b) => b.title || b.getAttribute('aria-label') || b.textContent.trim())
        .filter(Boolean)
        .slice(-55),
    ),
  );
  const posPath = base + '/api/stages/' + run.stageId + '/position';
  let position;
  for (let attempt = 0; attempt < 20; attempt++) {
    position = await ctx.request.get(posPath);
    if (position.ok() && (await position.json())?.sceneId) break;
    await page.waitForTimeout(800);
  }
  console.log(
    'saved position',
    position.status(),
    position.status() === 200 ? await position.text() : '',
  );
  const second = await browser.newContext({
    locale: 'tr-TR',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const active = local('.secrets.qa.json')[0];
  const login = await second.request.post(base + '/account/login?lang=tr', {
    form: { email: active.email, password: active.password },
    headers: { origin: base },
    maxRedirects: 0,
  });
  assert.equal(login.status(), 303);
  const otherPage = await second.newPage();
  await otherPage.goto(base + '/classroom/' + run.stageId);
  await otherPage.waitForFunction(
    () => document.querySelector('button') && document.body.innerText.trim().length > 35,
    {},
    { timeout: 85000 },
  );
  console.log('mobile classroom', (await otherPage.locator('body').innerText()).slice(0, 650));
  const secondPos = await second.request.get(posPath);
  assert.equal(position.status(), 200);
  assert.equal(secondPos.status(), 200);
  const before = await position.json();
  assert.ok(before?.sceneId, 'scene selection was not saved');
  assert.equal((await secondPos.json()).sceneId, before.sceneId);
  console.log('second device position', secondPos.status());
  for (const route of ['/workspace', '/workbench/new']) {
    const response = await page.goto(base + route);
    assert.equal(response.status(), 200);
    await page.waitForFunction(
      () => document.body.innerText.trim().length > 50,
      {},
      { timeout: 60000 },
    );
    console.log(
      route,
      page.url().slice(base.length),
      (await page.locator('body').innerText()).slice(0, 600),
    );
  }
  await ctx.close();
  await second.close();
} catch (e) {
  console.error(e.name, String(e.message).split('Call log:')[0].slice(0, 220));
  process.exitCode = 1;
} finally {
  await browser.close();
}
