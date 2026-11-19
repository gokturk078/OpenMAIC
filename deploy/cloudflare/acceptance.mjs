import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = JSON.parse(fs.readFileSync(new URL('wrangler.jsonc', import.meta.url))).vars
  .PUBLIC_ORIGIN;
const qa = JSON.parse(fs.readFileSync(new URL('.secrets.qa.json', import.meta.url)));
const runFile = new URL('.secrets.runs.json', import.meta.url);
const runs = fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile)) : {};
async function login(i) {
  const cache = new URL('.secrets.session-' + i + '.json', import.meta.url);
  if (fs.existsSync(cache)) {
    const saved = JSON.parse(fs.readFileSync(cache));
    if (Date.now() - saved.time < 30 * 60 * 1000) return saved.cookie;
  }
  const { email, password } = qa[i];
  const r = await fetch(base + '/account/login', {
    method: 'POST',
    headers: { origin: base },
    body: new URLSearchParams({ email, password }),
    redirect: 'manual',
  });
  assert.equal(r.status, 303, 'password login');
  const cookie = r.headers
    .getSetCookie()
    .filter((x) => !x.includes('Max-Age=0'))
    .map((x) => x.split(';')[0])
    .join('; ');
  fs.writeFileSync(cache, JSON.stringify({ time: Date.now(), cookie }), { mode: 0o600 });
  return cookie;
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
    interactive: label === 'technical',
    ...(label === 'pdf'
      ? { materialIds: [fs.readFileSync(new URL('.secrets.pdf-id', import.meta.url), 'utf8')] }
      : {}),
  });
  console.log('start', r.status, r.j.error || r.j.message || '', Object.keys(r.j));
  if (r.status === 202) {
    const run = r.j.run || r.j.data?.run;
    console.log('run', run.id || run.runId, run.status || run.state);
    runs[label] = { i, id: run.id || run.runId };
    fs.writeFileSync(runFile, JSON.stringify(runs), { mode: 0o600 });
  } else console.log(JSON.stringify(r.j).slice(0, 350));
} else if (mode === 'pdf') {
  const a = await login(1),
    b = await login(0);
  const bytes = fs.readFileSync(process.argv[3]);
  const scope = process.argv[4] === 'classic' ? 'extract=true' : 'scope=library';
  const up = await fetch(base + '/api/materials?' + scope, {
    method: 'POST',
    headers: {
      cookie: a,
      origin: base,
      'content-type': 'application/pdf',
      'x-material-filename': 'Solar-cycle.pdf',
    },
    body: bytes,
  });
  const data = await up.json();
  console.log('PDF upload', up.status, data.materialId || data.error || data.message);
  assert.equal(up.status, 201);
  fs.writeFileSync(new URL('.secrets.pdf-id', import.meta.url), data.materialId, { mode: 0o600 });
  const path = '/api/materials/' + data.materialId + '/original';
  const own = await fetch(base + path, { headers: { cookie: a } });
  assert.equal(own.status, 200);
  assert.deepEqual(Buffer.from(await own.arrayBuffer()), bytes);
  const other = await fetch(base + path, { headers: { cookie: b } });
  console.log('PASS exact PDF bytes; other account status', other.status);
  assert.ok([403, 404].includes(other.status));
} else if (mode === 'poll') {
  for (const [label, v] of Object.entries(runs)) {
    const c = await login(v.i);
    const r = await endpoint(c, '/api/generation-runs/' + v.id);
    const a = r.j.run || r.j.data?.run || r.j;
    console.log(
      label,
      r.status,
      a.state,
      a.step,
      a.stageId,
      a.error || '',
      a.outline?.outlines?.length,
      a.seq,
    );
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
