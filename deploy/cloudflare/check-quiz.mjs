import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const origin = read('wrangler.jsonc').vars.PUBLIC_ORIGIN;
const cookie = read('.secrets.session-0.json').cookie;
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(
    cookie.split('; ').map((c) => ({ url: origin, name: c.split('=')[0], value: c.split('=')[1] })),
  );
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    return route.request().method() === 'GET' ||
      u.pathname.startsWith('/api/persistence/') ||
      u.pathname.endsWith('/position')
      ? route.continue()
      : route.abort();
  });
  const run = (
    await (
      await ctx.request.get(origin + '/api/generation-runs/' + read('.secrets.runs.json').math.id)
    ).json()
  ).run;
  const page = await ctx.newPage();
  await page.goto(origin + '/classroom/' + run.stageId);
  const start = page.getByRole('button', { name: 'Start Quiz', exact: true });
  const submit = page.getByRole('button', { name: /submit answers/i });
  const retry = page.getByRole('button', { name: /retry|try again/i });
  await start.or(retry).first().waitFor({ timeout: 60000 });
  if (await retry.count()) await retry.first().click();
  if (await start.isVisible()) await start.click();
  await submit.waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: /180°/ }).first().click();
  await page.getByRole('button', { name: /70°/ }).last().click();
  await submit.click();
  await retry.first().waitFor({ timeout: 30000 });
  const result = await page.locator('body').innerText();
  assert.ok(/25\s*\/\s*25|100\s*%|2\s*\/\s*2/.test(result), 'expected full score');
  console.log(
    'PASS two multiple-choice answers submitted and graded',
    result.match(/25\s*\/\s*25|100\s*%|2\s*\/\s*2/)[0],
  );
} catch (error) {
  console.error(error.name, error.message.split('Call log:')[0].slice(0, 150));
  process.exitCode = 1;
} finally {
  await browser.close();
}
