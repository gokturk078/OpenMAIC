import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (n) => JSON.parse(fs.readFileSync(new URL(n, import.meta.url)));
const base = read('wrangler.jsonc').vars.PUBLIC_ORIGIN;
const account = read('.secrets.qa.json')[1];
const form = (path, fields, cookie = '') =>
  fetch(base + path, {
    method: 'POST',
    redirect: 'manual',
    headers: { origin: base, cookie },
    body: new URLSearchParams(fields),
  });
const login = await form('/account/login', { email: account.email, password: account.password });
assert.equal(login.status, 303);
const cookies = (r) =>
  r.headers
    .getSetCookie()
    .filter((c) => !c.includes('Max-Age=0'))
    .map((c) => c.split(';')[0]);
const refresh = cookies(login).find((s) => s.startsWith('__Host-maic-refresh='));
assert.ok(refresh);
const renewed = await fetch(base + '/account', {
  headers: { cookie: refresh },
  redirect: 'manual',
});
assert.equal(renewed.status, 200);
const session = cookies(renewed).join('; ');
assert.ok(session.includes('__Host-maic-session='));
console.log('PASS refresh with access cookie removed');
const edit = await form('/account/profile', { name: 'Test Öğrenci' }, session);
assert.equal(edit.status, 200);
assert.ok((await edit.text()).includes('Test Öğrenci'));
console.log('PASS profile saved through Supabase Auth');
const logout = await fetch(base + '/account/logout', {
  method: 'POST',
  headers: { cookie: session, origin: base },
  redirect: 'manual',
});
assert.equal(logout.status, 303);
assert.ok(logout.headers.getSetCookie().some((c) => c.includes('Max-Age=0')));
console.log('PASS logout clears credentials');
