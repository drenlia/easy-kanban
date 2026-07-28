/**
 * Per-user dedicated SSH keypairs for agent / GitHub work.
 */

import { wrapQuery } from '../queryLogger.js';

export async function getSshKeyMeta(db, userId) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT user_id, public_key, fingerprint, created_at, updated_at
      FROM user_ssh_keys
      WHERE user_id = $1
    `),
    'SELECT'
  );
  return await stmt.get(userId);
}

export async function getSshKeyWithPrivate(db, userId) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT user_id, public_key, private_key_encrypted, fingerprint, created_at, updated_at
      FROM user_ssh_keys
      WHERE user_id = $1
    `),
    'SELECT'
  );
  return await stmt.get(userId);
}

export async function upsertSshKey(db, { userId, publicKey, privateKeyEncrypted, fingerprint }) {
  const stmt = wrapQuery(
    db.prepare(`
      INSERT INTO user_ssh_keys (user_id, public_key, private_key_encrypted, fingerprint, created_at, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id)
      DO UPDATE SET
        public_key = EXCLUDED.public_key,
        private_key_encrypted = EXCLUDED.private_key_encrypted,
        fingerprint = EXCLUDED.fingerprint,
        updated_at = CURRENT_TIMESTAMP
    `),
    'INSERT'
  );
  await stmt.run(userId, publicKey, privateKeyEncrypted, fingerprint);
  return await getSshKeyMeta(db, userId);
}

export async function deleteSshKey(db, userId) {
  const stmt = wrapQuery(
    db.prepare('DELETE FROM user_ssh_keys WHERE user_id = $1'),
    'DELETE'
  );
  return await stmt.run(userId);
}
