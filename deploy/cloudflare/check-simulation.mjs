import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const base = read('wrangler.jsonc').vars.PUBLIC_ORIGIN;
const cookie = read('.secrets.session-0.json').cookie;
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1400, height: 850 },
  });
  context.setDefaultTimeout(90000);
  await context.addCookies(
    cookie.split('; ').map((c) => ({ url: base, name: c.split('=')[0], value: c.split('=')[1] })),
  );
  const stageId =
    process.argv[2] ||
    fs.readFileSync(new URL('.secrets.simulation-stage', import.meta.url), 'utf8').trim();
  await context.route(/\/api\/(?:generate\/|chat\/pi|transcription|quiz-grade)/, (route) =>
    route.abort(),
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/classroom/' + stageId);
  const host = page.locator('iframe[title^="Interactive Scene"]').first();
  const scene = host.contentFrame();
  const step = scene.locator('#step-btn');
  await step.waitFor();
  // The desktop player scales its sandboxed iframe. Use actual screen pixels
  // to exercise the same pointer path that a learner uses on the presentation.
  async function clickInPlayer(control) {
    const point = await control.evaluate((el) => {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const box = el.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    });
    const rect = await host.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        sx: box.width / el.offsetWidth,
        sy: box.height / el.offsetHeight,
      };
    });
    await page.mouse.click(rect.left + point.x * rect.sx, rect.top + point.y * rect.sy);
  }
  await clickInPlayer(scene.getByRole('button', { name: /Find 20/i }).first());
  await clickInPlayer(step);
  await scene.locator('#stat-step').filter({ hasText: '1' }).waitFor({ timeout: 10000 });
  const text = await scene.locator('body').innerText();
  assert.match(text, /search right half/i);
  assert.deepEqual(errors, []);
  console.log('PASS sandboxed binary search advanced to step 1 and selected the right half');
} catch (error) {
  console.error(error.name, error.message.split('Call log:')[0].slice(0, 180));
  process.exitCode = 1;
} finally {
  await browser.close();
}
