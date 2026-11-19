import fs from 'node:fs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const read = (n) => JSON.parse(fs.readFileSync(new URL(n, import.meta.url)));
const base = read('wrangler.jsonc').vars.PUBLIC_ORIGIN;
const cookie = read('.secrets.session-0.json').cookie;
const br = await chromium.launch({ channel: 'chrome' });
try {
  const ctx = await br.newContext({ locale: 'en-US', viewport: { width: 1400, height: 850 } });
  await ctx.addCookies(
    cookie.split('; ').map((c) => ({ url: base, name: c.split('=')[0], value: c.split('=')[1] })),
  );
  ctx.setDefaultTimeout(90000);
  const run = (
    await (
      await ctx.request.get(
        base + '/api/generation-runs/' + read('.secrets.runs.json').technical.id,
      )
    ).json()
  ).run;
  await ctx.route(/\/api\/(?:generate\/|chat\/pi|transcription|quiz-grade)/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('script error', e.message.slice(0, 150)));
  await p.goto(base + '/classroom/' + run.stageId);
  const frame = p.frameLocator('iframe[title^="Interactive Scene"]').first();
  const btn = frame.locator('button:visible');
  await btn.first().waitFor({ timeout: 60000 });
  console.log('interactive controls', await btn.allTextContents());
  const scripts = await frame
    .locator('script')
    .evaluateAll((nodes) => nodes.map((n) => ({ type: n.type, src: n.src, text: n.textContent })));
  for (const script of scripts) {
    if (script.src) {
      console.log('script src', new URL(script.src).pathname.slice(0, 120));
      continue;
    }
    if (script.type && !['text/javascript', 'application/javascript'].includes(script.type))
      continue;
    try {
      new vm.Script(script.text);
    } catch (e) {
      console.log(
        'parse error',
        e.stack
          .split('\n')
          .slice(0, 4)
          .map((l) => l.slice(0, 200))
          .join(' '),
      );
    }
  }
  const old = await frame.locator('body').innerText();
  const preset = btn.filter({ hasText: /Find 20/i });
  if (await preset.count()) await preset.first().click();
  const next = btn.filter({ hasText: /step|start|next|search/i }).first();
  await next.click();
  await p.waitForTimeout(700);
  const after = await frame.locator('body').innerText();
  console.log('changed', after !== old, after.slice(-520));
  assert.notEqual(after, old, 'interactive search must change the displayed state');
} catch (e) {
  console.error(e.name, String(e.message).split('Call log:')[0].slice(0, 220));
  process.exitCode = 1;
} finally {
  await br.close();
}
