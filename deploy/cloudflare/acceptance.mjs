import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = JSON.parse(fs.readFileSync(new URL('wrangler.jsonc', import.meta.url))).vars
  .PUBLIC_ORIGIN;
const qa = JSON.parse(fs.readFileSync(new URL('.secrets.qa.json', import.meta.url)));
const runFile = new URL('.secrets.runs.json', import.meta.url);
const runs = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile)) : {};
async function login(i) {
  const { email, password } = qa[i];
  const r = await fetch(base + '/account/login', {
    method: 'POST',
    headers: { origin: base },
    body: new URLSearchParams({ email, password }),
    redirect: 'manual',
  });
  assert.equal(r.status, 303, 'password login');
  return r.headers
    .getSetCookie()
    .filter((x) => !x.includes('Max-Age=0'))
    .map((x) => x.split(';')[0])
    .join('; ');
}
async function endpoint(c, path, body) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: c,
      origin: base,
      'content-type': 'application/json',
      'accept-language': 'tr',
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
const mode = process.argv[2] || 'check';
if (mode === 'start') {
  const i = Number(process.argv[3] || 0),
    label = process.argv[4] || 'math';
  assert.ok(!runs[label], 'previous job already recorded');
  const c = await login(i);
  const r = await endpoint(c, '/api/generation-runs', {
    requirement:
      process.argv[5] ||
      'Türkçe kısa bir ders oluştur. Bir üçgenin iç açılarının toplamını bir örnek üzerinde iki slayt ve bir kısa quiz ile anlat. Sadece bu konuyu işle.',
    outlineReview: 'auto',
    interactive: false,
  });
  console.log('start', r.status, r.j.error || r.j.message || '', Object.keys(r.j));
  if (r.status === 202) {
    const run = r.j.run || r.j.data?.run;
    console.log('run', run.id || run.runId, run.status || run.state);
    runs[label] = { i, id: run.id || run.runId };
    fs.writeFileSync(runFile, JSON.stringify(runs), { mode: 0o600 });
  } else console.log(JSON.stringify(r.j).slice(0, 350));
} else if (mode === 'poll') {
  for (const [label, v] of Object.entries(runs)) {
    const c = await login(v.i);
    const r = await endpoint(c, '/api/generation-runs/' + v.id);
    const a = r.j.run || r.j.data?.run || r.j;
    console.log(label, r.status, JSON.stringify(a).slice(0, 1000));
  }
} else {
  const r = await fetch(base + '/api/stages', { redirect: 'manual' });
  assert.equal(r.status, 401);
  console.log('PASS private API rejects anonymous request');
  for (let i = 0; i < 2; i++) {
    const c = await login(i);
    for (const p of [
      '/api/persistence/learner-key',
      '/api/stages',
      '/api/generation-runs?active=1',
    ]) {
      const a = await endpoint(c, p);
      console.log(i, p, a.status, JSON.stringify(a.j).slice(0, 160));
      assert.equal(a.status, 200);
      if (p.includes('learner-key')) assert.equal(a.j.learnerKey, qa[i].id);
    }
  }
}
