import { materials } from './materials.js';
const encoder = new TextEncoder();
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function key(env) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(env.MAIC_MASTER),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function ticket(env, kind, owner) {
  const mac = await crypto.subtle.sign('HMAC', await key(env), encoder.encode(kind + ':' + owner));
  return Array.from(new Uint8Array(mac), (v) => v.toString(16).padStart(2, '0')).join('');
}
async function authorized(req, env, kind, owner) {
  const hex = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!uuid.test(owner) || !/^[0-9a-f]{64}$/.test(hex)) return false;
  return crypto.subtle.verify(
    'HMAC',
    await key(env),
    Uint8Array.from(hex.match(/../g), (v) => parseInt(v, 16)),
    encoder.encode(kind + ':' + owner),
  );
}
export async function rpc(env, name, body) {
  const r = await fetch(env.SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE,
      Authorization: 'Bearer ' + env.SUPABASE_SERVICE,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    console.error('database operation', name, r.status);
    throw Error('Database temporarily unavailable');
  }
  return r.status === 204 ? null : r.json();
}
const models = {
  'chat/completions': [
    'anthropic/claude-haiku-5.5',
    'anthropic/claude-sonnet-5.5',
    'anthropic/claude-sonnet-4.6',
  ],
  images: ['google/gemini-3.1-flash-lite-image', 'google/gemini-nano-banana-2.1'],
  'audio/speech': ['google/gemini-3.8-flash-lite-tts', 'elevenlabs/eleven-multilingual-v2'],
  'audio/transcriptions': ['openai/gpt-4o-transcribe'],
};
export async function bridge(req, env) {
  const [, , kind, owner, ...segments] = new URL(req.url).pathname.split('/');
  if (!['assets', 'ai'].includes(kind) || !(await authorized(req, env, kind, owner)))
    return new Response(null, { status: 403 });
  if (kind === 'assets' && segments.length === 1 && segments[0] === 'materials')
    return materials(req, env, owner);
  if (kind === 'assets') {
    if (
      segments.length !== 2 ||
      !/^sha256-[a-f0-9]{64}$/.test(segments[1]) ||
      !/^[\w%-]{1,192}$/.test(segments[0])
    )
      return new Response(null, { status: 400 });
    const objectKey = owner + '/' + segments.join('/');
    if (req.method === 'GET') {
      const item = await env.FILES.get(objectKey);
      return new Response(item?.body || null, {
        status: item ? 200 : 404,
        headers: { 'cache-control': 'no-store', 'content-type': 'application/octet-stream' },
      });
    }
    if (req.method === 'DELETE') {
      await env.FILES.delete(objectKey);
      return new Response(null, { status: 204 });
    }
    if (req.method !== 'PUT') return new Response(null, { status: 405 });
    const len = Number(req.headers.get('content-length') ?? Infinity);
    if (len > 32 * 1024 * 1024) return new Response(null, { status: 413 });
    const bytes = await req.arrayBuffer();
    const sum = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
      v.toString(16).padStart(2, '0'),
    ).join('');
    if ('sha256-' + sum !== segments[1]) return new Response(null, { status: 422 });
    await env.FILES.put(objectKey, bytes);
    return new Response(null, { status: 204 });
  }
  const path = segments.join('/');
  if (req.method !== 'POST' || !Object.hasOwn(models, path))
    return new Response(null, { status: 404 });
  if (Number(req.headers.get('content-length') ?? 0) > 20 * 1024 * 1024)
    return new Response(null, { status: 413 });
  let body;
  if (
    path === 'audio/transcriptions' &&
    req.headers.get('content-type')?.includes('multipart/form-data')
  ) {
    const f = await req.formData(),
      file = f.get('file');
    if (!file || file.size > 12 * 1024 * 1024) return new Response(null, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    // The upstream OpenAI-compatible adapter names every non-WAV file audio.webm.
    // OpenRouter requires the actual encoding alongside the base64 data.
    const magic = String.fromCharCode(...bytes.subarray(0, 12));
    let format;
    if (magic.startsWith('RIFF') && magic.endsWith('WAVE')) format = 'wav';
    else if (magic.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224))
      format = 'mp3';
    else if (bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163)
      format = 'webm';
    else if (magic.startsWith('OggS')) format = 'ogg';
    else if (magic.slice(4, 8) === 'ftyp') format = 'mp4';
    else if (magic.startsWith('fLaC')) format = 'flac';
    else
      return Response.json({ error: { message: 'Unrecognized audio encoding' } }, { status: 415 });
    body = {
      model: f.get('model'),
      input_audio: { data: btoa(binary), format },
      ...(f.get('language') ? { language: f.get('language') } : {}),
    };
  } else body = await req.json();
  if (!models[path].includes(body.model)) return new Response(null, { status: 403 });
  // Translate requests from containers and preferences created before the model migration.
  body.model = models[path][0];
  const apiKey = owner === env.QA_MODEL_OWNER ? env.QA_OPENROUTER_KEY : env.OPENROUTER_API_KEY;
  if (!apiKey) return new Response(null, { status: 503 });
  if (path === 'chat/completions') {
    body.max_tokens = Math.min(
      Math.max(1, Number(body.max_tokens || body.max_completion_tokens || 8192)),
      12000,
    );
    delete body.max_completion_tokens;
    delete body.models;
    delete body.plugins;
    delete body.provider;
    body.n = 1;
  }
  if (path === 'images') body.n = 1;
  if (path === 'audio/speech' && (typeof body.input !== 'string' || body.input.length > 8000))
    return new Response(null, { status: 413 });
  if (path === 'audio/speech') {
    const voice = ['puck', 'george'].includes(String(body.voice).toLowerCase()) ? 'Puck' : 'Kore';
    body = { model: body.model, input: body.input, voice, response_format: 'pcm' };
  }
  const permit = await rpc(env, 'maic_admit', {
    p_owner: owner,
    p_task: path,
    p_model: body.model,
    p_max: Number(path === 'audio/speech' ? env.DAILY_SPEECH_CALLS : env.DAILY_CALLS),
    p_global: Number(env.GLOBAL_DAILY_CALLS),
  });
  if (!permit)
    return Response.json(
      { error: { message: 'Daily AI limit reached', code: 'insufficient_quota' } },
      { status: 429 },
    );
  const r = await fetch('https://openrouter.ai/api/v1/' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  if (path === 'audio/speech' && r.ok) return speechResponse(r);
  if (r.status === 402) {
    const error = (
      await r
        .clone()
        .json()
        .catch(() => null)
    )?.error;
    if (error?.metadata?.reason === 'in_flight_budget_exhausted') {
      const wait = r.headers.get('retry-after') || error.metadata.headers?.['Retry-After'] || '120';
      return Response.json(
        {
          error: { code: 'rate_limited', message: 'Waiting for previous model requests to settle' },
        },
        { status: 429, headers: { 'retry-after': wait, 'cache-control': 'no-store' } },
      );
    }
  }
  return new Response(r.body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') || 'application/json',
      ...(r.headers.has('retry-after') ? { 'retry-after': r.headers.get('retry-after') } : {}),
      'cache-control': 'no-store',
    },
  });
}

// Gemini returns mono signed 16-bit, 24 kHz PCM. Browsers require its WAV container.
export async function speechResponse(response) {
  const type = response.headers.get('content-type') || '';
  if (!/^(audio\/|application\/octet-stream)/i.test(type))
    return new Response(null, { status: 502 });
  const pcm = new Uint8Array(await response.arrayBuffer());
  if (!pcm.length || pcm.length > 32 * 1024 * 1024 - 44 || pcm.length % 2)
    return new Response(null, { status: 502 });
  const headers = { 'content-type': 'audio/wav', 'cache-control': 'no-store' };
  const signature = String.fromCharCode(...pcm.subarray(0, 12));
  if (signature.startsWith('RIFF') && signature.endsWith('WAVE'))
    return new Response(pcm, { headers });
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  for (const [offset, label] of [
    [0, 'RIFF'],
    [8, 'WAVEfmt '],
    [36, 'data'],
  ])
    header.set(encoder.encode(label), offset);
  for (const [offset, value] of [
    [4, pcm.length + 36],
    [16, 16],
    [24, 24000],
    [28, 48000],
    [40, pcm.length],
  ])
    view.setUint32(offset, value, true);
  for (const [offset, value] of [
    [20, 1],
    [22, 1],
    [32, 2],
    [34, 16],
  ])
    view.setUint16(offset, value, true);
  return new Response(new Blob([header, pcm]), { headers });
}
