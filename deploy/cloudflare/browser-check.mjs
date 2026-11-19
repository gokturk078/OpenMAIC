import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const qa = JSON.parse(fs.readFileSync(new URL('.secrets.qa.json', import.meta.url)))[0];
const base = JSON.parse(fs.readFileSync(new URL('wrangler.jsonc', import.meta.url))).vars
  .PUBLIC_ORIGIN;
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const [locale, width] of [
    ['tr-TR', 390],
    ['en-US', 1400],
  ]) {
    const ctx = await browser.newContext({ locale, viewport: { width, height: 850 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(90000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 100)));
    await page.goto(base + '/account/login?lang=' + (locale === 'tr-TR' ? 'tr' : 'en'));
    await page.locator('[name=email]').fill(qa.email);
    await page.locator('[name=password]').fill(qa.password);
    await page.getByRole('button').click();
    await page.waitForURL(base + '/');
    await page.waitForFunction(() => document.querySelectorAll('button').length > 3);
    const view = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      text: document.body.innerText,
    }));
    assert.equal(view.lang, locale);
    assert.equal(view.overflow, false);
    assert.doesNotMatch(view.text, /Enter Access Code/);
    assert.deepEqual(errors, []);
    console.log('PASS home', locale, width);
    await page.goto(base + '/account');
    await page.locator('form[action*="logout"] button').click();
    await page.waitForURL(/account\/login/);
    assert.equal((await ctx.request.get(base + '/api/stages')).status(), 401);
    console.log('PASS logout', locale);
    await ctx.close();
  }
} catch (e) {
  console.error(e.name, String(e.message).split('Call log:')[0].slice(0, 220));
  process.exitCode = 1;
} finally {
  await browser.close();
}
