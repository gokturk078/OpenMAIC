import fs from 'node:fs';
import assert from 'node:assert/strict';
const local = (n) => JSON.parse(fs.readFileSync(new URL(n, import.meta.url)));
const base = local('wrangler.jsonc').vars.PUBLIC_ORIGIN;
const cookie = local('.secrets.session-1.json').cookie;
const upload = (bytes, name) =>
  fetch(base + '/api/materials?extract=false', {
    method: 'POST',
    headers: {
      cookie,
      origin: base,
      'content-type': 'application/pdf',
      'x-material-filename': name,
    },
    body: bytes,
  });
const bad = await upload('This is a plain text worksheet.', 'worksheet.pdf');
assert.equal(bad.status, 415);
console.log('PASS file type mismatch refused');
const bytes = fs.readFileSync(process.argv[2]);
const create = await upload(bytes, 'source-check.pdf');
assert.equal(create.status, 201);
const { materialId } = await create.json();
const path = base + '/api/materials/' + materialId;
const original = await fetch(path + '/original', { headers: { cookie } });
assert.equal(original.status, 200);
assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
const foreign = await fetch(path + '/original', {
  headers: { cookie: local('.secrets.session-0.json').cookie },
});
assert.equal(foreign.status, 404);
const remove = await fetch(path, { method: 'DELETE', headers: { cookie, origin: base } });
assert.ok([200, 204].includes(remove.status));
assert.equal((await fetch(path + '/original', { headers: { cookie } })).status, 404);
console.log('PASS classic R2 original upload, exact download, owner isolation and deletion');
