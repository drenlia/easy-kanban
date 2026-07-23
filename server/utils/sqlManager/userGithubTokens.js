/**
 * Per-user GitHub personal access tokens (encrypted) for agent clone/push/PR.
 */

import { wrapQuery } from '../queryLogger.js';

export async function getGithubTokenMeta(db, userId) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT user_id, token_hint, created_at, updated_at
      FROM user_github_tokens
      WHERE user_id = $1
    `),
    'SELECT'
  );
  return await stmt.get(userId);
}

export async function getGithubTokenEncrypted(db, userId) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT user_id, token_encrypted, token_hint, created_at, updated_at
      FROM user_github_tokens
      WHERE user_id = $1
    `),
    'SELECT'
  );
  return await stmt.get(userId);
}

export async function upsertGithubToken(db, { userId, tokenEncrypted, tokenHint }) {
  const stmt = wrapQuery(
    db.prepare(`
      INSERT INTO user_github_tokens (user_id, token_encrypted, token_hint, created_at, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id)
      DO UPDATE SET
        token_encrypted = EXCLUDED.token_encrypted,
        token_hint = EXCLUDED.token_hint,
        updated_at = CURRENT_TIMESTAMP
    `),
    'INSERT'
  );
  await stmt.run(userId, tokenEncrypted, tokenHint || '');
  return await getGithubTokenMeta(db, userId);
}

export async function deleteGithubToken(db, userId) {
  const stmt = wrapQuery(
    db.prepare('DELETE FROM user_github_tokens WHERE user_id = $1'),
    'DELETE'
  );
  return await stmt.run(userId);
}
