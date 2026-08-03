/**
 * Object / file storage admin settings (disk vs S3).
 */

export const STORAGE_SETTING_DEFAULTS = Object.freeze([
  ['STORAGE_BACKEND', 'disk'], // disk | s3
  ['STORAGE_MANAGED', 'false'],
  ['S3_ENDPOINT', ''],
  ['S3_REGION', ''],
  ['S3_BUCKET', ''],
  ['S3_ACCESS_KEY_ID', ''],
  ['S3_SECRET_ACCESS_KEY', ''],
  ['S3_FORCE_PATH_STYLE', 'false'],
  ['S3_KEY_PREFIX', ''],
  ['STORAGE_MIGRATION_STATUS', 'idle'], // idle | running | completed | failed
  ['STORAGE_MIGRATION_DETAIL', ''],
  ['STORAGE_TEST_OK', 'false']
]);

/** S3 credential fields hidden when STORAGE_MANAGED=true (like SMTP when MAIL_MANAGED). */
export const STORAGE_MANAGED_HIDDEN_KEYS = Object.freeze([
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_FORCE_PATH_STYLE',
  'S3_KEY_PREFIX'
]);

export const STORAGE_S3_CONFIG_KEYS = Object.freeze([
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_FORCE_PATH_STYLE',
  'S3_KEY_PREFIX'
]);
