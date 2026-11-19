import { Container } from '@cloudflare/containers';
import { account, session, cookie } from './account.js';
import { bridge, rpc, ticket, uuid } from './bridge.js';

export class Classroom extends Container {
  defaultPort = 3000;
  sleepAfter = '20m';
  async configure(owner) {
    if (!uuid.test(owner) || !this.ctx.id.equals(this.env.ROOMS.idFromName(owner)))
      throw Error('Invalid account binding');
    const dbPassword = await ticket(this.env, 'database', owner);
    if (!(await this.ctx.storage.get('provisioned'))) {
      await rpc(this.env, 'maic_provision', { p_owner: owner, p_password: dbPassword });
      await this.ctx.storage.put('provisioned', true);
    }
    const url = new URL(this.env.POOL_URL);
    url.username =
      'maic_' +
      owner.replaceAll('-', '') +
      '.' +
      new URL(this.env.SUPABASE_URL).hostname.split('.')[0];
    url.password = dbPassword;
    url.searchParams.set('sslmode', 'verify-full');
    this.envVars = {
      DATABASE_URL: url.href,
      OPENMAIC_HOSTED: 'true',
      MAIC_OWNER: owner,
      MAIC_ORIGIN_TICKET: await ticket(this.env, 'origin', owner),
      MAIC_R2_ENDPOINT: this.env.PUBLIC_ORIGIN + '/_host/assets/' + owner,
      MAIC_ASSET_TICKET: await ticket(this.env, 'assets', owner),
      MAIC_AI_ENDPOINT: this.env.PUBLIC_ORIGIN + '/_host/ai/' + owner,
      MAIC_AI_TICKET: await ticket(this.env, 'ai', owner),
      OPENMAIC_SECRET_KEY: await ticket(this.env, 'settings', owner),
      OPENMAIC_CONFIG: '/app/product-models.yml',
      OWNER_ANONYMOUS_PREMINT: 'false',
      OWNER_SINGLE_USER: 'false',
      OPENMAIC_AGENT_RUNTIME_ENABLED: 'true',
      NEXT_PUBLIC_PRO_WORKBENCH_ENABLED: 'true',
      OPENMAIC_MAX_ACTIVE_RUNS_PER_OWNER: '1',
      OPENMAIC_AGENT_RUNTIME_MAX_CONCURRENT: '1',
      OPENMAIC_GENERATION_RUN_MAX_CONCURRENT: '1',
      OPENMAIC_AGENT_MAX_UPLOAD_BYTES: '33554432',
      MATERIALS_MAX_DOCUMENT_BYTES: '33554432',
      ASSET_QUOTA_BYTES: '268435456',
      HOSTNAME: '0.0.0.0',
      PORT: '3000',
    };
  }
  async fetch(req) {
    const owner = req.headers.get('x-maic-account');
    await this.configure(owner);
    const hdr = new Headers(req.headers);
    hdr.delete('x-maic-account');
    const locale = cookie(req, 'locale');
    hdr.set(
      'cookie',
      'maic_origin=' +
        this.envVars.MAIC_ORIGIN_TICKET +
        (locale && /^[A-Za-z-]{2,10}$/.test(locale) ? '; locale=' + locale : ''),
    );
    const res = await this.containerFetch(new Request(req, { headers: hdr }), 3000);
    return res;
  }
}

export default {
  async fetch(req, env) {
    try {
      const u = new URL(req.url);
      if (u.origin !== env.PUBLIC_ORIGIN) return new Response(null, { status: 404 });
      if (u.pathname.startsWith('/_host/')) return await bridge(req, env);
      if (u.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n');
      if (u.pathname === '/account' || u.pathname.startsWith('/account/'))
        return await account(req, env);
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.get('origin') !== u.origin)
        return Response.json({ error: 'Origin required' }, { status: 403 });
      const s = await session(req, env);
      if (!s.user)
        return u.pathname.startsWith('/api/')
          ? Response.json({ error: 'Sign in required' }, { status: 401 })
          : new Response(null, {
              status: 302,
              headers: { location: '/account/login', 'cache-control': 'no-store' },
            });
      if (!uuid.test(s.user.id)) return new Response(null, { status: 401 });
      if (req.method !== 'GET' && !(await env.APP_LIMIT.limit({ key: s.user.id })).success)
        return Response.json({ error: 'Too many requests' }, { status: 429 });
      if (
        /^\/api\/(?:identity\/claim|access-code|verify-|sandbox\/preview\/resolve)/.test(u.pathname)
      )
        return new Response(null, { status: 403 });
      const h = new Headers();
      for (const name of [
        'accept',
        'accept-language',
        'content-type',
        'content-length',
        'x-material-filename',
        'x-request-id',
        'sec-fetch-dest',
        'sec-fetch-site',
        'user-agent',
        'range',
        'origin',
        'rsc',
        'next-url',
        'next-action',
        'next-router-state-tree',
        'next-router-prefetch',
        'last-event-id',
      ])
        if (req.headers.has(name)) h.set(name, req.headers.get(name));
      const locale = cookie(req, 'locale');
      if (locale && /^[A-Za-z-]{2,10}$/.test(locale)) h.set('cookie', 'locale=' + locale);
      h.set('x-maic-account', s.user.id);
      const target = env.ROOMS.getByName(s.user.id);
      const upstream = await target.fetch(new Request(req, { headers: h }));
      let result = new Response(upstream.body, upstream);
      result.headers.delete('set-cookie');
      result.headers.set('cache-control', 'private, no-store');
      result.headers.set('X-Robots-Tag', 'noindex, nofollow');
      result.headers.set('X-Content-Type-Options', 'nosniff');
      if (result.headers.get('content-type')?.includes('text/html') && u.pathname === '/') {
        const l = (h.get('accept-language') || '').startsWith('tr') ? 'Hesabım' : 'My account';
        result = new HTMLRewriter()
          .on('body', {
            element(el) {
              el.append(
                '<a href="/account" style="position:fixed;bottom:16px;left:16px;z-index:60;background:#fff;color:#254a42;border:1px solid #bccdc5;border-radius:24px;padding:8px 16px;font:600 14px system-ui">' +
                  l +
                  '</a>',
                { html: true },
              );
            },
          })
          .transform(result);
      }
      s.renew?.(result);
      return result;
    } catch (error) {
      console.error(
        'Classroom gateway error',
        error.name,
        String(error.message)
          .replace(/https?:\/\/[^\s]+|[a-zA-Z0-9._-]{40,}/g, '[redacted]')
          .slice(0, 200),
      );
      return Response.json(
        { error: 'Classroom temporarily unavailable' },
        { status: 503, headers: { 'retry-after': '10' } },
      );
    }
  },
};
