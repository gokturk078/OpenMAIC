/** Device-scoped editor position, separate from the canonical document. */
import { BrowserKVStore, type KVStore } from '@openmaic/storage';

export interface CurrentSceneValue {
  sceneId: string | null;
  updatedAt: string;
}

export interface CurrentSceneDeps {
  kv?: KVStore;
}

const KEY_PREFIX = 'editor-current-scene:';
let defaultKv: KVStore | undefined;

function key(stageId: string): string {
  return `${KEY_PREFIX}${stageId}`;
}

function resolveKv(kv?: KVStore): KVStore {
  if (kv) return kv;
  if (typeof localStorage === 'undefined')
    throw new Error('Current-scene persistence requires localStorage (client-only)');
  return (defaultKv ??= new BrowserKVStore());
}

function isCurrentSceneValue(value: unknown): value is CurrentSceneValue {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CurrentSceneValue>;
  return (
    (candidate.sceneId === null || typeof candidate.sceneId === 'string') &&
    typeof candidate.updatedAt === 'string' &&
    Number.isFinite(Date.parse(candidate.updatedAt))
  );
}

export async function loadCurrentSceneValue(
  stageId: string,
  kv: KVStore,
): Promise<CurrentSceneValue | null> {
  const value = await kv.get<unknown>(key(stageId), 'device');
  return isCurrentSceneValue(value) ? value : null;
}

export function saveCurrentSceneValue(
  stageId: string,
  value: CurrentSceneValue,
  kv: KVStore,
): Promise<void> {
  return kv.set(key(stageId), value, 'device');
}

export async function loadCurrentScene(
  stageId: string,
  deps: CurrentSceneDeps = {},
): Promise<CurrentSceneValue | null> {
  const local = await loadCurrentSceneValue(stageId, resolveKv(deps.kv));
  if (deps.kv || typeof document === 'undefined' || !document.documentElement.dataset.hosted)
    return local;
  const response = await fetch('/api/stages/' + encodeURIComponent(stageId) + '/position', {
    cache: 'no-store',
  }).catch(() => null);
  const remote: unknown = response?.ok ? await response.json() : null;
  return isCurrentSceneValue(remote) &&
    (!local || Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt))
    ? remote
    : local;
}

/** Last-write-wins device position. */
export async function saveCurrentScene(
  stageId: string,
  sceneId: string | null,
  deps: CurrentSceneDeps = {},
): Promise<void> {
  const value = { sceneId, updatedAt: new Date().toISOString() };
  await saveCurrentSceneValue(stageId, value, resolveKv(deps.kv));
  if (!deps.kv && typeof document !== 'undefined' && document.documentElement.dataset.hosted) {
    const response = await fetch('/api/stages/' + encodeURIComponent(stageId) + '/position', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
      keepalive: true,
    });
    if (!response.ok && response.status !== 404) throw new Error('Could not sync lesson position');
  }
}

export function clearCurrentScene(stageId: string, deps: CurrentSceneDeps = {}): Promise<void> {
  return resolveKv(deps.kv).remove(key(stageId), 'device');
}
