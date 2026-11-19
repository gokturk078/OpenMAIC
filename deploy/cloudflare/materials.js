export async function materials(req, env, owner) {
  const url = new URL(req.url),
    prefixMode = url.searchParams.has('prefix');
  const key = url.searchParams.get(prefixMode ? 'prefix' : 'key');
  if (
    !key ||
    key.length > 768 ||
    key.startsWith('/') ||
    key.includes('..') ||
    (prefixMode && !key.endsWith('/'))
  )
    return new Response(null, { status: 400 });
  const root = owner + '/source/',
    objectKey = root + key;
  if (prefixMode) {
    if (!['GET', 'DELETE'].includes(req.method)) return new Response(null, { status: 405 });
    const rows = [];
    let cursor;
    do {
      const page = await env.FILES.list({ prefix: objectKey, cursor });
      if (req.method === 'DELETE' && page.objects.length)
        await env.FILES.delete(page.objects.map((o) => o.key));
      else
        for (const o of page.objects) {
          const relative = o.key.slice(root.length);
          if (!relative.slice(key.length).includes('/'))
            rows.push({ key: relative, modifiedAt: o.uploaded.getTime() });
        }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return req.method === 'GET' ? Response.json(rows) : new Response(null, { status: 204 });
  }
  if (req.method === 'GET') {
    const item = await env.FILES.get(objectKey);
    return new Response(item?.body || null, {
      status: item ? 200 : 404,
      headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
    });
  }
  if (req.method === 'DELETE') {
    await env.FILES.delete(objectKey);
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'PUT') return new Response(null, { status: 405 });
  if (Number(req.headers.get('content-length') ?? Infinity) > 32 * 1024 * 1024)
    return new Response(null, { status: 413 });
  await env.FILES.put(objectKey, req.body);
  return new Response(null, { status: 204 });
}
