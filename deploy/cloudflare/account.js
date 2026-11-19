import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = new Map();
const tokenCookie = '__Host-maic-session',
  refreshCookie = '__Host-maic-refresh',
  flowCookie = '__Host-maic-flow';
export const escape = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const cookie = (req, key) =>
  (req.headers.get('cookie') || '')
    .split(/;\s*/)
    .find((v) => v.startsWith(key + '='))
    ?.slice(key.length + 1);
const set = (key, value, age) =>
  key + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + age;
function redirect(path) {
  return new Response(null, {
    status: 303,
    headers: { location: path, 'Cache-Control': 'no-store' },
  });
}
function putSession(res, j) {
  res.headers.append('Set-Cookie', set(tokenCookie, j.access_token, Math.max(60, j.expires_in)));
  res.headers.append('Set-Cookie', set(refreshCookie, j.refresh_token, 60 * 60 * 24 * 30));
}
function signedIn(j, path) {
  const res = redirect(path);
  res.headers.set('Clear-Site-Data', '"cache", "storage"');
  putSession(res, j);
  res.headers.append('Set-Cookie', set(flowCookie, '', 0));
  return res;
}
export async function authFetch(env, path, body, token, method) {
  const r = await fetch(env.SUPABASE_URL + '/auth/v1/' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: {
      apikey: env.SUPABASE_ANON,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, data };
}
async function verify(env, token, immutableAsset) {
  const issuer = env.SUPABASE_URL + '/auth/v1';
  if (!keys.has(issuer))
    keys.set(issuer, createRemoteJWKSet(new URL(issuer + '/.well-known/jwks.json')));
  try {
    const { payload } = await jwtVerify(token, keys.get(issuer), {
      issuer,
      audience: 'authenticated',
      algorithms: ['ES256', 'RS256'],
    });
    if (
      payload.role === 'authenticated' &&
      payload.email &&
      !payload.is_anonymous &&
      /^[a-f\d-]{36}$/i.test(payload.sub)
    ) {
      if (immutableAsset) return { id: payload.sub, email: payload.email };
      // GoTrue also checks whether the session is still active after logout.
      const r = await authFetch(env, 'user', undefined, token);
      if (r.ok && r.data.id === payload.sub && r.data.email_confirmed_at) return r.data;
    }
  } catch {
    // Older projects may still sign in GoTrue with HS256.
    const r = await authFetch(env, 'user', undefined, token);
    if (r.ok && r.data.email_confirmed_at && !r.data.is_anonymous) return r.data;
  }
}
export async function session(req, env) {
  const token = cookie(req, tokenCookie);
  if (token) {
    const user = await verify(env, token, new URL(req.url).pathname.startsWith('/_next/static/'));
    if (user) return { user, token };
  }
  const refresh = cookie(req, refreshCookie);
  if (refresh) {
    const r = await authFetch(env, 'token?grant_type=refresh_token', { refresh_token: refresh });
    if (r.ok && r.data.user?.email_confirmed_at)
      return {
        user: r.data.user,
        token: r.data.access_token,
        renew: (res) => putSession(res, r.data),
      };
  }
  return {};
}
const copy = {
  tr: {
    login: 'Giriş yap',
    signup: 'Hesap oluştur',
    forgot: 'Parolamı unuttum',
    reset: 'Yeni parola belirle',
    account: 'Hesabım',
    logout: 'Çıkış yap',
    email: 'E-posta',
    password: 'Parola',
    newPassword: 'Yeni parola',
    submitReset: 'Sıfırlama bağlantısı gönder',
    classroom: 'Derslerime dön',
    name: 'Adınız',
    save: 'Profili kaydet',
    sent: 'E-postanıza gelen bağlantıyı açın. Ardından hesabınıza giriş yapabilirsiniz.',
    failed: 'İşlem tamamlanamadı. Bilgilerinizi kontrol edip tekrar deneyin.',
    limit: 'Çok fazla deneme yapıldı. Bir dakika sonra tekrar deneyin.',
    title: 'Kendi hızında öğren.',
    description: 'Bir konuyu keşfet, belgeni derse dönüştür ve AI öğretmeninle çalış.',
    link: 'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin.',
    saved: 'Profil güncellendi.',
    passHelp: 'En az 10 karakter kullanın.',
  },
  en: {
    login: 'Sign in',
    signup: 'Create account',
    forgot: 'Forgot password',
    reset: 'Set a new password',
    account: 'My account',
    logout: 'Sign out',
    email: 'Email',
    password: 'Password',
    newPassword: 'New password',
    submitReset: 'Send reset link',
    classroom: 'Back to my lessons',
    name: 'Your name',
    save: 'Save profile',
    sent: 'Open the link in your email. You can then sign in to your account.',
    failed: 'The request could not be completed. Check your details and try again.',
    limit: 'Too many attempts. Try again in a minute.',
    title: 'Learn at your own pace.',
    description: 'Explore a topic, turn a document into a lesson, and study with your AI teacher.',
    link: 'This link is invalid or has expired. Request a new one.',
    saved: 'Profile updated.',
    passHelp: 'Use at least 10 characters.',
  },
};
function lang(req) {
  return new URL(req.url).searchParams.get('lang') === 'en'
    ? 'en'
    : new URL(req.url).searchParams.get('lang') === 'tr'
      ? 'tr'
      : (req.headers.get('accept-language') || 'tr').startsWith('en')
        ? 'en'
        : 'tr';
}
function page(req, env, view, notice = '', status = 200, user) {
  const l = lang(req),
    c = copy[l],
    base = '/account/',
    query = '?lang=' + l;
  const a = (path, label) => '<a href="' + base + path + query + '">' + escape(label) + '</a>';
  const field = (key, type, ac, value = '', min = 0) =>
    '<label>' +
    escape(c[key]) +
    '<input required name="' +
    key +
    '" type="' +
    type +
    '" autocomplete="' +
    ac +
    '" value="' +
    escape(value) +
    '" ' +
    (min ? 'minlength="' + min + '" ' : '') +
    'maxlength="' +
    (type === 'password' ? 128 : 254) +
    '"></label>';
  const form = (act, content, label) =>
    '<form method="post" action="' +
    base +
    act +
    query +
    '">' +
    content +
    '<button>' +
    escape(label) +
    '</button></form>';
  let body = '';
  if (view === 'account')
    body =
      '<p>' +
      escape(user?.email) +
      '</p>' +
      form('profile', field('name', 'text', 'name', user?.user_metadata?.display_name), c.save) +
      '<p><a href="/">' +
      c.classroom +
      '</a> · ' +
      a('forgot', c.forgot) +
      '</p>' +
      form('logout', '', c.logout);
  else if (view === 'reset')
    body = form('reset', field('newPassword', 'password', 'new-password', '', 10), c.reset);
  else {
    const email = field('email', 'email', 'email');
    body =
      form(
        view,
        email +
          (view === 'forgot'
            ? ''
            : field(
                'password',
                'password',
                view === 'login' ? 'current-password' : 'new-password',
                '',
                view === 'signup' ? 10 : 0,
              )) +
          (view === 'signup' ? '<small>' + c.passHelp + '</small>' : ''),
        view === 'forgot' ? c.submitReset : c[view],
      ) +
      '<nav>' +
      ['login', 'signup', 'forgot']
        .filter((x) => x !== view)
        .map((x) => a(x, c[x]))
        .join(' · ') +
      '</nav>';
  }
  const html =
    '<!doctype html><html lang="' +
    l +
    '"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' +
    c[view] +
    ' · ' +
    escape(env.PRODUCT_NAME) +
    '</title><style>*{box-sizing:border-box}body{margin:0;min-height:100svh;color:#172d2c;background:#f6f5f0;font:16px/1.55 system-ui,sans-serif}header{padding:24px clamp(20px,6vw,90px);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #cbd4cd}header b{letter-spacing:-.055em;font-size:24px}a{color:#225951;text-underline-offset:3px}main{width:min(980px,92vw);margin:clamp(35px,10vh,100px) auto;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:7vw}.intro h1{font:500 clamp(42px,6vw,82px)/1.02 Georgia,serif;letter-spacing:-.055em;margin:0 0 22px}.intro p{max-width:34ch}.card{background:white;border:1px solid #cdd7cf;border-radius:18px;padding:clamp(24px,4vw,48px)}h2{font-size:26px;margin:0 0 20px}form{display:grid;gap:14px}label{font-size:14px;font-weight:600}input,button{font:inherit;width:100%;padding:12px;border-radius:8px}input{margin-top:4px;border:1px solid #a4b3ac}button{background:#214f46;color:white;border:0;cursor:pointer;font-weight:650}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #e29652;outline-offset:2px}nav{margin-top:20px;font-size:14px}.notice{border-left:3px solid #bb763e;padding:7px 12px;background:#fbf6eb}small{color:#445c55}@media(max-width:680px){main{grid-template-columns:1fr;gap:20px;margin:30px auto}.intro h1{font-size:44px}.intro p{margin:0}}</style><header><b>' +
    escape(env.PRODUCT_NAME) +
    '</b><span><a href="?lang=tr">Türkçe</a> · <a href="?lang=en">English</a></span></header><main><section class="intro"><h1>' +
    c.title +
    '</h1><p>' +
    c.description +
    '</p></section><section class="card"><h2>' +
    escape(c[view]) +
    '</h2>' +
    (notice ? '<p role="status" class="notice">' + escape(c[notice]) + '</p>' : '') +
    body +
    '</section></main></html>';
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html;charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'Referrer-Policy': 'same-origin',
    },
  });
}
export async function account(req, env) {
  const u = new URL(req.url),
    act = u.pathname.split('/')[2] || 'account';
  if (act === 'callback' && req.method === 'GET') {
    const flow = cookie(req, flowCookie) || '',
      [kind, verifier] = flow.split('.');
    const code = u.searchParams.get('code');
    if (code && verifier) {
      const r = await authFetch(env, 'token?grant_type=pkce', {
        auth_code: code,
        code_verifier: verifier,
      });
      if (r.ok && r.data.access_token)
        return signedIn(r.data, kind === 'recover' ? '/account/reset' : '/');
    }
    return page(req, env, 'login', 'link', 400);
  }
  const protectedAct = ['account', 'reset', 'logout', 'profile'].includes(act);
  const s = protectedAct ? await session(req, env) : {};
  if (protectedAct && !s.user) return redirect('/account/login');
  if (req.method === 'GET') {
    if (!['login', 'signup', 'forgot', 'account', 'reset'].includes(act))
      return new Response(null, { status: 404 });
    let user = s.user;
    if (act === 'account') {
      const r = await authFetch(env, 'user', undefined, s.token);
      if (r.ok) user = r.data;
    }
    const res = page(req, env, act, '', 200, user);
    s.renew?.(res);
    return res;
  }
  if (req.method !== 'POST' || req.headers.get('origin') !== u.origin)
    return new Response(null, { status: 403 });
  if (
    !(await env.AUTH_LIMIT.limit({ key: req.headers.get('cf-connecting-ip') || 'local' })).success
  )
    return page(req, env, 'login', 'limit', 429);
  if (act === 'logout') {
    await authFetch(env, 'logout?scope=local', {}, s.token);
    const res = redirect('/account/login');
    for (const key of [tokenCookie, refreshCookie, flowCookie])
      res.headers.append('Set-Cookie', set(key, '', 0));
    res.headers.set('Clear-Site-Data', '"cache", "storage"');
    return res;
  }
  if (
    !req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') ||
    Number(req.headers.get('content-length') || 0) > 4096
  )
    return new Response(null, { status: 415 });
  const f = new URLSearchParams(await req.text()),
    email = (f.get('email') || '').trim(),
    password = f.get('password') || '';
  if (act === 'profile' || act === 'reset') {
    const data =
      act === 'profile'
        ? { data: { display_name: (f.get('name') || '').trim().slice(0, 100) } }
        : { password: f.get('newPassword') || '' };
    if (act === 'reset' && data.password.length < 10)
      return page(req, env, 'reset', 'passHelp', 400);
    const r = await authFetch(env, 'user', data, s.token, 'PUT');
    const res = page(
      req,
      env,
      'account',
      r.ok ? 'saved' : 'failed',
      r.ok ? 200 : 400,
      r.ok ? r.data : s.user,
    );
    s.renew?.(res);
    return res;
  }
  if (act === 'login') {
    const r = await authFetch(env, 'token?grant_type=password', { email, password });
    if (r.ok && r.data.access_token) {
      const res = signedIn(r.data, '/');
      if (u.searchParams.has('lang'))
        res.headers.append(
          'Set-Cookie',
          'locale=' +
            (lang(req) === 'tr' ? 'tr-TR' : 'en-US') +
            '; Path=/; Max-Age=31536000; Secure; SameSite=Lax',
        );
      return res;
    }
    return page(req, env, act, 'failed', 401);
  }
  if (!['signup', 'forgot'].includes(act)) return new Response(null, { status: 404 });
  if (act === 'signup' && password.length < 10) return page(req, env, act, 'passHelp', 400);
  const verifier = crypto.randomUUID() + crypto.randomUUID();
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const code_challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  const path = act === 'signup' ? 'signup' : 'recover';
  const r = await authFetch(
    env,
    path + '?redirect_to=' + encodeURIComponent(env.PUBLIC_ORIGIN + '/account/callback'),
    {
      email,
      ...(act === 'signup' ? { password } : {}),
      code_challenge,
      code_challenge_method: 's256',
    },
  );
  if (!r.ok) console.warn('auth mail request', path, r.status, r.data.error_code);
  const res = page(
    req,
    env,
    r.ok ? 'login' : act,
    r.ok ? 'sent' : r.status === 429 ? 'limit' : 'failed',
    r.ok ? 200 : r.status,
  );
  if (r.ok) res.headers.append('Set-Cookie', set(flowCookie, path + '.' + verifier, 3600));
  return res;
}
