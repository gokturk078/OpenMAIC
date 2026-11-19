import fs from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const secrets = JSON.parse(fs.readFileSync(new URL('.secrets.json', import.meta.url)));
const project = process.env.SUPABASE_PROJECT_REF;
const origin = 'https://' + project + '.supabase.co';
const service = {
  apikey: secrets.SUPABASE_SERVICE,
  Authorization: 'Bearer ' + secrets.SUPABASE_SERVICE,
  'Content-Type': 'application/json',
};
const trialFile = new URL('.secrets.qa.json', import.meta.url);
const trials = fs.existsSync(trialFile) ? JSON.parse(fs.readFileSync(trialFile)) : [];
while (trials.length < 2) {
  const seed = randomBytes(8).toString('hex');
  const email = 'maic-qa-' + seed + '@example.com',
    password = randomBytes(28).toString('hex');
  const r = await fetch(origin + '/auth/v1/admin/users', {
    method: 'POST',
    headers: service,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await r.json();
  if (!r.ok) throw Error('test account HTTP ' + r.status + ' ' + data.code);
  trials.push({ email, password, id: data.id });
  fs.writeFileSync(trialFile, JSON.stringify(trials), { mode: 0o600 });
}
function sql(user, statement) {
  const u = new URL(fs.readFileSync('supabase/.temp/pooler-url', 'utf8').trim());
  u.username = 'maic_' + user.id.replaceAll('-', '') + '.' + project;
  const pass = createHmac('sha256', secrets.MAIC_MASTER)
    .update('database:' + user.id)
    .digest('hex');
  return spawnSync('psql', [u.href, '-XAt', '-v', 'ON_ERROR_STOP=1', '-c', statement], {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: pass, PGSSLMODE: 'require' },
  });
}
for (const u of trials) {
  const r = await fetch(origin + '/rest/v1/rpc/maic_provision', {
    method: 'POST',
    headers: service,
    body: JSON.stringify({
      p_owner: u.id,
      p_password: createHmac('sha256', secrets.MAIC_MASTER)
        .update('database:' + u.id)
        .digest('hex'),
    }),
  });
  if (!r.ok) throw Error('provision ' + r.status + ' ' + (await r.json()).message);
  const login = await fetch(origin + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: secrets.SUPABASE_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: u.password }),
  });
  if (!login.ok) throw Error('login ' + login.status);
  console.log('PASS password login');
  const schema = 'maic_' + u.id.replaceAll('-', '');
  const result = sql(
    u,
    'select current_schema,rolbypassrls from pg_roles where rolname=current_user',
  );
  if (result.stdout.trim() !== schema + '|f')
    throw Error('tenant role/namespace check: ' + result.stdout + ' ' + result.stderr);
  const own = sql(
    u,
    'create table if not exists qa_isolation (id int primary key);insert into qa_isolation values(1) on conflict do nothing;select count(*) from qa_isolation',
  );
  if (own.status !== 0) throw Error(own.stderr);
  console.log('PASS direct SQL scoped login and write');
}
const foreign = sql(
  trials[0],
  'select count(*) from maic_' + trials[1].id.replaceAll('-', '') + '.qa_isolation',
);
if (foreign.status === 0 || !foreign.stderr.includes('permission denied'))
  throw Error('foreign data was not refused as expected');
console.log('PASS PostgreSQL denies cross-account read');
for (const u of trials) sql(u, 'drop table qa_isolation');
