/**
 * Load and validate storage backend settings from the tenant DB.
 */
import { getDecryptedSetting } from '../../utils/settingsSecrets.js';
import { helpers } from '../../utils/sqlManager/index.js';

/**
 * @typedef {'disk' | 's3'} StorageBackend
 * @typedef {'attachments' | 'avatars'} StorageCategory
 *
 * @typedef {Object} StorageConfig
 * @property {StorageBackend} backend
 * @property {boolean} managed
 * @property {string} endpoint
 * @property {string} region
 * @property {string} bucket
 * @property {string} accessKeyId
 * @property {string} secretAccessKey
 * @property {boolean} forcePathStyle
 * @property {string} keyPrefix
 * @property {boolean} testOk
 */

/**
 * @param {string} prefix
 * @returns {string}
 */
export function normalizeKeyPrefix(prefix) {
  let p = String(prefix || '').trim().replace(/^\/+/, '');
  if (p && !p.endsWith('/')) p += '/';
  return p;
}

/**
 * @param {import('express').Request | null} req
 * @param {string | null} tenantId
 * @returns {string}
 */
export function defaultTenantKeyPrefix(tenantId) {
  if (tenantId && process.env.MULTI_TENANT === 'true') {
    return normalizeKeyPrefix(`tenants/${tenantId}`);
  }
  return '';
}

/**
 * @param {*} db
 * @returns {Promise<StorageConfig>}
 */
export async function loadStorageConfig(db) {
  const get = async (key, fallback = '') => {
    try {
      if (key === 'S3_SECRET_ACCESS_KEY') {
        return (await getDecryptedSetting(db, key)) || fallback;
      }
      const v = await helpers.getSetting(db, key);
      return v != null && v !== '' ? String(v) : fallback;
    } catch {
      return fallback;
    }
  };

  const backendRaw = (await get('STORAGE_BACKEND', 'disk')).toLowerCase();
  const backend = backendRaw === 's3' ? 's3' : 'disk';

  return {
    backend,
    managed: (await get('STORAGE_MANAGED', 'false')) === 'true',
    endpoint: await get('S3_ENDPOINT', ''),
    region: await get('S3_REGION', ''),
    bucket: await get('S3_BUCKET', ''),
    accessKeyId: await get('S3_ACCESS_KEY_ID', ''),
    secretAccessKey: await get('S3_SECRET_ACCESS_KEY', ''),
    forcePathStyle: (await get('S3_FORCE_PATH_STYLE', 'false')) === 'true',
    keyPrefix: normalizeKeyPrefix(await get('S3_KEY_PREFIX', '')),
    testOk: (await get('STORAGE_TEST_OK', 'false')) === 'true'
  };
}

/**
 * Build config from a plain object (e.g. admin test with draft values).
 * @param {Record<string, string | undefined>} overrides
 * @param {StorageConfig} [base]
 * @returns {StorageConfig}
 */
export function storageConfigFromOverrides(overrides, base = null) {
  const b = base || {
    backend: 's3',
    managed: false,
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
    keyPrefix: '',
    testOk: false
  };

  const pick = (key, fallback) => {
    const v = overrides[key];
    if (v === undefined || v === null) return fallback;
    return String(v);
  };

  const secret = pick('S3_SECRET_ACCESS_KEY', b.secretAccessKey);
  // Ignore masked placeholder from admin UI
  const secretFinal =
    secret && !/^•+$/.test(secret) && secret !== '••••••••' ? secret : b.secretAccessKey;

  return {
    backend: 's3',
    managed: b.managed,
    endpoint: pick('S3_ENDPOINT', b.endpoint),
    region: pick('S3_REGION', b.region),
    bucket: pick('S3_BUCKET', b.bucket),
    accessKeyId: pick('S3_ACCESS_KEY_ID', b.accessKeyId),
    secretAccessKey: secretFinal,
    forcePathStyle:
      pick('S3_FORCE_PATH_STYLE', b.forcePathStyle ? 'true' : 'false') === 'true',
    keyPrefix: normalizeKeyPrefix(pick('S3_KEY_PREFIX', b.keyPrefix)),
    testOk: b.testOk
  };
}

/**
 * @param {StorageConfig} config
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateS3Config(config) {
  if (!config.bucket?.trim()) {
    return { ok: false, error: 'S3_BUCKET is required' };
  }
  if (!config.region?.trim() && !config.endpoint?.trim()) {
    return { ok: false, error: 'S3_REGION or S3_ENDPOINT is required' };
  }
  if (!config.accessKeyId?.trim()) {
    return { ok: false, error: 'S3_ACCESS_KEY_ID is required' };
  }
  if (!config.secretAccessKey?.trim()) {
    return { ok: false, error: 'S3_SECRET_ACCESS_KEY is required' };
  }
  return { ok: true };
}

/**
 * @param {StorageConfig} config
 * @param {StorageCategory} category
 * @param {string} filename
 * @returns {string}
 */
export function buildObjectKey(config, category, filename) {
  const safe = String(filename || '').replace(/^\/+/, '').replace(/\.\./g, '');
  return `${config.keyPrefix}${category}/${safe}`;
}

/**
 * Extract filename from stored attachment/avatar URL.
 * @param {string} url
 * @param {StorageCategory} category
 * @returns {string | null}
 */
export function filenameFromPublicUrl(url, category) {
  if (!url) return null;
  const s = String(url);
  const patterns =
    category === 'avatars'
      ? ['/avatars/', '/api/files/avatars/']
      : ['/attachments/', '/api/files/attachments/'];
  for (const p of patterns) {
    if (s.includes(p)) {
      const part = s.split(p).pop() || '';
      return part.split('?')[0].replace(/^.*\//, '') || null;
    }
  }
  // Bare filename
  if (!s.includes('/') && !s.includes('http')) return s;
  return null;
}
