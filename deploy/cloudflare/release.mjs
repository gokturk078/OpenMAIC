import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('.', import.meta.url));
const [commit] = process.argv.slice(2);
if (!/^[a-f0-9]{40}$/.test(commit || ''))
  throw Error('Pass the full commit of a successful Product container build.');
const configFile = new URL('wrangler.jsonc', import.meta.url);
const config = JSON.parse(fs.readFileSync(configFile));
const current = config.containers[0].image;
const registry = current.split('/').slice(0, -1).join('/');
const account = registry.split('/')[1];
if (!/^registry\.cloudflare\.com\/[0-9a-f]{32}$/.test(registry))
  throw Error('Expected a Cloudflare image registry.');
const tag = 'openmaic-product:' + commit.slice(0, 16);
const source = 'ghcr.io/gokturk078/openmaic:product-' + commit;
function run(cmd, args) {
  execFileSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
  });
}
run('docker', ['pull', '--platform', 'linux/amd64', source]);
run('docker', ['tag', source, tag]);
run('./node_modules/.bin/wrangler', ['containers', 'push', tag]);
const file = fs.readFileSync(configFile, 'utf8');
fs.writeFileSync(configFile, file.replace(current, registry + '/' + tag));
run('./node_modules/.bin/wrangler', ['deploy', '--dry-run']);
run('./node_modules/.bin/wrangler', ['deploy', '--containers-rollout', 'immediate']);
