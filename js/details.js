/**
 * Venue detail shards — the full field evidence of each qualified venue, kept out of the
 * first load so the page stays fast with the whole registry. scripts/build-data.py writes
 * data/details/NN.json where NN = FNV-1a 32-bit hash of the UTF-8 venue id modulo the shard
 * count (meta.detail.shards), two digits. Loaded once per shard, cached for the session.
 */
const cache = new Map(), resolved = new Map();

export function shardOf(id, shards = 32) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(String(id))) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % shards;
}

export function shardPath(id, shards = 32) {
  return `data/details/${String(shardOf(id, shards)).padStart(2, '0')}.json`;
}

/** Resolve the detail record of one venue (null when the shard has no entry). */
export async function loadDetail(id, {shards = 32, fetchImpl = (...a) => fetch(...a)} = {}) {
  const path = shardPath(id, shards);
  if (!cache.has(path)) {
    cache.set(path, fetchImpl(path, {cache: 'no-cache'}).then(r => {
      if (!r.ok) throw new Error(`detail shard ${path}: ${r.status}`);
      return r.json();
    }).then(json => { resolved.set(path, json); return json; }).catch(e => { cache.delete(path); throw e; }));
  }
  const shard = await cache.get(path);
  return shard?.venues?.[id] || null;
}

/** The detail record if its shard is already loaded, else null (synchronous, for re-renders). */
export function cachedDetail(id, shards = 32) {
  return resolved.get(shardPath(id, shards))?.venues?.[id] || null;
}
