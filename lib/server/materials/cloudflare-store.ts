import { buffer } from 'node:stream/consumers';
import { Readable } from 'node:stream';
import type { MaterialByteStore } from './bytes';

export function hostedMaterialStore(endpoint: string, ticket: string): MaterialByteStore {
  async function request(method: string, key: string, body?: Buffer, prefix = false) {
    const url = new URL(endpoint + '/materials');
    url.searchParams.set(prefix ? 'prefix' : 'key', key);
    const res = await fetch(url, {
      method,
      headers: { authorization: 'Bearer ' + ticket },
      body: body ? new Uint8Array(body) : undefined,
      cache: 'no-store',
      redirect: 'error',
    });
    if (!res.ok) throw new Error('Private material storage returned ' + res.status);
    return res;
  }
  return {
    async put(key, body) {
      const bytes =
        body instanceof Uint8Array
          ? Buffer.from(body)
          : await buffer(body instanceof Readable ? body : Readable.fromWeb(body as never));
      await request('PUT', key, bytes);
    },
    async get(key) {
      return Buffer.from(await (await request('GET', key)).arrayBuffer());
    },
    async delete(key) {
      await request('DELETE', key);
    },
    async deletePrefix(prefix) {
      await request('DELETE', prefix, undefined, true);
    },
    async list(prefix) {
      return (await request('GET', prefix, undefined, true)).json();
    },
  };
}
