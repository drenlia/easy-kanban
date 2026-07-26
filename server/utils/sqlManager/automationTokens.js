/**
 * Job-scoped automation tokens (short-lived; sha256 hashed).
 */

import crypto from 'crypto';
import { wrapQuery } from '../queryLogger.js';

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

export async function createToken(db, row) {
  const stmt = wrapQuery(
    db.prepare(`
      INSERT INTO agent_automation_tokens (
        id, task_id, token_hash, owner_user_id, scope_type, scope_board_ids, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `),
    'INSERT'
  );
  await stmt.run(
    row.id,
    row.taskId,
    row.tokenHash,
    row.ownerUserId,
    row.scopeType,
    row.scopeBoardIds || '[]',
    row.expiresAt
  );
  return row;
}

export async function getTokenById(db, id) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT id, task_id, token_hash, owner_user_id, scope_type, scope_board_ids,
             expires_at, revoked_at, apply_plan_hash, created_at
      FROM agent_automation_tokens
      WHERE id = $1
    `),
    'SELECT'
  );
  return await stmt.get(id);
}

export async function findActiveByTokenHash(db, tokenHash) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT id, task_id, token_hash, owner_user_id, scope_type, scope_board_ids,
             expires_at, revoked_at, apply_plan_hash, created_at
      FROM agent_automation_tokens
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > CURRENT_TIMESTAMP
    `),
    'SELECT'
  );
  return await stmt.get(tokenHash);
}

export async function revokeToken(db, id) {
  const stmt = wrapQuery(
    db.prepare(`
      UPDATE agent_automation_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND revoked_at IS NULL
    `),
    'UPDATE'
  );
  return await stmt.run(id);
}

export async function revokeTokensForTask(db, taskId) {
  const stmt = wrapQuery(
    db.prepare(`
      UPDATE agent_automation_tokens
      SET revoked_at = CURRENT_TIMESTAMP
      WHERE task_id = $1 AND revoked_at IS NULL
    `),
    'UPDATE'
  );
  return await stmt.run(taskId);
}

export async function setApplyPlanHash(db, id, planHash) {
  const stmt = wrapQuery(
    db.prepare(`
      UPDATE agent_automation_tokens
      SET apply_plan_hash = $2
      WHERE id = $1
    `),
    'UPDATE'
  );
  return await stmt.run(id, planHash);
}
