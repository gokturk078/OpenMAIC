import { timingSafeEqual, createHash } from 'node:crypto';
import type { OwnerAuthMethod } from '@/lib/server/identity';

export function cloudflareAccount(ownerId: string, ticket: string): OwnerAuthMethod {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  const expected = digest(ticket);
  const roles = new Set<string>();
  return {
    name: 'supabase-cloudflare',
    async authenticate(req) {
      const value = /(?:^|;\s*)maic_origin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.get('cookie') ?? '')?.[1];
      if (!value || !timingSafeEqual(expected, digest(value))) return { status: 'invalid' };
      return { status: 'authenticated', principal: { ownerId, kind: 'user', assurance: 'verified', roles } };
    },
    describeStoredOwner: id => id === ownerId ? { kind: 'user', roles } : undefined,
  };
}
