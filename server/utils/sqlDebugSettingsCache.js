/**
 * Cached read of SERVER_DEBUG_SQL from settings without using wrapQuery (avoids recursion).
 * TTL prevents per-query DB round-trips when SQL logging is off.
 */

const CACHE_TTL_MS = 15_000;
const KEY = 'SERVER_DEBUG_SQL';

/** @type {Map<string, { value: boolean, expiresAt: number }>} */
const cache = new Map();

function settingsTableRef(db) {
  if (db?.schema && typeof db.schema === 'string' && db.schema !== 'public') {
    return `"${db.schema.replace(/"/g, '""')}".settings`;
  }
  return 'settings';
}

/**
 * @param {object} db
 * @returns {string}
 */
export function getSqlDebugCacheKey(db) {
  if (!db) return 'unknown';
  return `pg:${db.schema ?? 'public'}:${db.tenantId ?? ''}`;
}

/**
 * Read setting value as boolean; must not go through wrapQuery.
 * @param {object} db
 * @returns {Promise<boolean>}
 */
async function readServerDebugSqlRaw(db) {
  if (!db) return false;
  try {
    const table = settingsTableRef(db);
    const sql = `SELECT value FROM ${table} WHERE key = $1`;
    const client = await db.getClient();
    try {
      const result = await client.query(sql, [KEY]);
      return result.rows[0]?.value === 'true';
    } finally {
      db.releaseClient(client);
    }
  } catch {
    return false;
  }
}

/**
 * @param {object} db
 * @returns {Promise<boolean>}
 */
export async function isServerDebugSqlEnabled(db) {
  const cacheKey = getSqlDebugCacheKey(db);
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await readServerDebugSqlRaw(db);
  cache.set(cacheKey, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/** For tests or after admin toggles SQL debug (optional). */
export function clearSqlDebugSettingsCache() {
  cache.clear();
}
