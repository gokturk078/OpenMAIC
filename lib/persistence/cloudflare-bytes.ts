import type { AssetByteStore } from '@openmaic/storage/asset/pg';

export function cloudflareBytes(endpoint: string, ticket: string, prefix = 'assets'): AssetByteStore {
  async function request(method: string, hash: string, bytes?: Uint8Array, signal?: AbortSignal) {
    const response = await fetch(endpoint + '/' + encodeURIComponent(prefix) + '/' + encodeURIComponent(hash), {
      method, signal, redirect: 'error', cache: 'no-store', headers: { authorization: 'Bearer ' + ticket },
      body: bytes ? Buffer.from(bytes) : undefined,
    });
    if (!response.ok && !(method === 'GET' && response.status === 404)) throw new Error('Private object store returned ' + response.status);
    return response;
  }
  return {
    writesOutsideRegistryDatabase: true,
    withPrefix: name => cloudflareBytes(endpoint, ticket, name),
    async write(hash, bytes, options) { await request('PUT', hash, bytes, options?.signal); },
    async read(hash) {
      const response = await request('GET', hash);
      return response.status === 404 ? null : new Uint8Array(await response.arrayBuffer());
    },
    async delete(hash) { await request('DELETE', hash); },
  };
}
