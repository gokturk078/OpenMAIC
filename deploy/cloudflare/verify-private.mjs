import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
const local = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)));
const base = local('wrangler.jsonc').vars.PUBLIC_ORIGIN;
const q = local('.secrets.qa.json'),
  s = local('.secrets.json'),
  cookies = [0, 1].map((i) => local('.secrets.session-' + i + '.json').cookie);
const record = local('.secrets.runs.json');
async function get(i, path) {
  return fetch(base + path, { headers: { cookie: cookies[i], origin: base }, redirect: 'manual' });
}
const course = (await (await get(0, '/api/generation-runs/' + record.math.id)).json()).run;
assert.equal(course.state, 'completed');
console.log('PASS math completed', course.stageId);
const manifest = await (await get(0, '/api/stages/' + course.stageId + '/manifest')).json();
for (const route of [
  '/api/stages/' + course.stageId + '/scenes?ids=' + encodeURIComponent(manifest.scenes[0].id),
  '/api/stages/' + course.stageId + '/manifest',
  '/api/generation-runs/' + record.math.id,
]) {
  const a = await get(0, route),
    b = await get(1, route);
  assert.equal(a.status, 200, route);
  assert.ok([403, 404].includes(b.status), route + ' ' + b.status);
  console.log('PASS owner reads and second account denied', route.split('/')[2], b.status);
}
const settings = await (await get(0, '/api/model-config')).text();
for (const value of [
  s.OPENROUTER_API_KEY,
  s.SUPABASE_SERVICE,
  s.MAIC_MASTER,
  ...['assets', 'origin', 'database', 'ai'].map((k) =>
    createHmac('sha256', s.MAIC_MASTER)
      .update(k + ':' + q[0].id)
      .digest('hex'),
  ),
])
  assert.ok(!settings.includes(value), 'credential accidentally returned in model settings');
console.log('PASS model settings omit private credential values');
const api = local('wrangler.jsonc').vars.SUPABASE_URL + '/rest/v1/rpc/maic_admit';
const body = JSON.stringify({
  p_owner: q[0].id,
  p_task: 'acceptance',
  p_model: 'no-charge',
  p_max: 0,
  p_global: 0,
});
for (const [key, name] of [
  [s.SUPABASE_ANON, 'public'],
  [s.SUPABASE_SERVICE, 'service'],
]) {
  const r = await fetch(api, {
    method: 'POST',
    headers: { apikey: key, authorization: 'Bearer ' + key, 'content-type': 'application/json' },
    body,
  });
  if (name === 'public') assert.ok([401, 403, 404].includes(r.status));
  else assert.equal(await r.json(), false);
  console.log('PASS quota RPC', name, name === 'service' ? 'refused exhausted budget' : r.status);
}
const invalid = await fetch(base + '/api/stages', {
  headers: { cookie: '__Host-maic-session=invalid' },
});
assert.equal(invalid.status, 401);
console.log('PASS invalid session refused');
