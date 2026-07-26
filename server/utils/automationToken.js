/**
 * Mint / validate / revoke short-lived automation job tokens.
 */

import crypto from 'crypto';
import {
  automationTokens as tokenQueries,
  taskWork as taskWorkQueries
} from './sqlManager/index.js';
import {
  AUTOMATION_SCOPE,
  AUTOMATION_TOKEN_TTL_MS
} from '../constants/automation.js';

export function mintRawAutomationToken() {
  return `ea_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * @param {object} db
 * @param {{
 *   jobId: string,
 *   taskId: string,
 *   ownerUserId: string,
 *   scopeType: string,
 *   boardIds?: string[],
 *   launchBoardId?: string
 * }} opts
 */
export async function mintAutomationToken(db, opts) {
  const rawToken = mintRawAutomationToken();
  const tokenHash = tokenQueries.hashToken(rawToken);
  const scopeType = opts.scopeType || AUTOMATION_SCOPE.THIS_BOARD;
  let boardIds = Array.isArray(opts.boardIds) ? opts.boardIds.filter(Boolean) : [];
  if (scopeType === AUTOMATION_SCOPE.THIS_BOARD && opts.launchBoardId) {
    boardIds = [opts.launchBoardId];
  }

  const expiresAt = new Date(Date.now() + AUTOMATION_TOKEN_TTL_MS).toISOString();
  await tokenQueries.revokeTokensForTask(db, opts.taskId);
  await tokenQueries.createToken(db, {
    id: opts.jobId,
    taskId: opts.taskId,
    tokenHash,
    ownerUserId: opts.ownerUserId,
    scopeType,
    scopeBoardIds: JSON.stringify(boardIds),
    expiresAt
  });

  await taskWorkQueries.upsertWorkEntries(db, opts.taskId, {
    automation_token_id: opts.jobId,
    agent_mode: 'automation'
  });

  return {
    rawToken,
    tokenId: opts.jobId,
    expiresAt,
    scopeType,
    boardIds
  };
}

/**
 * @param {object} db
 * @param {string} rawToken
 */
export async function validateAutomationToken(db, rawToken) {
  if (!rawToken || !String(rawToken).startsWith('ea_')) {
    return null;
  }
  const row = await tokenQueries.findActiveByTokenHash(
    db,
    tokenQueries.hashToken(rawToken)
  );
  if (!row) return null;

  let boardIds = [];
  try {
    boardIds = JSON.parse(row.scope_board_ids || '[]');
  } catch {
    boardIds = [];
  }

  return {
    jobId: row.id,
    taskId: row.task_id,
    ownerUserId: row.owner_user_id,
    scopeType: row.scope_type,
    boardIds,
    applyPlanHash: row.apply_plan_hash || null,
    expiresAt: row.expires_at
  };
}

export async function revokeAutomationToken(db, jobId) {
  return tokenQueries.revokeToken(db, jobId);
}

export function parseScopeBoardIds(work) {
  try {
    const raw = work?.automation_board_ids;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}
