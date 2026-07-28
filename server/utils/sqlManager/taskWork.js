/**
 * Task work key-value store for agent automation (flexible keys, no schema migrations per key).
 */

import { wrapQuery } from '../queryLogger.js';
import { AGENT_MEMBER_ID } from '../../constants/agentIdentity.js';

/**
 * @param {object} db
 * @param {string} taskId
 * @returns {Promise<Record<string, string|null>>}
 */
export async function getWorkMapByTaskId(db, taskId) {
  const stmt = wrapQuery(
    db.prepare('SELECT key, value FROM task_work WHERE task_id = $1'),
    'SELECT'
  );
  const rows = await stmt.all(taskId);
  const map = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * @param {object} db
 * @param {string} taskId
 * @param {string} key
 */
export async function getWorkEntry(db, taskId, key) {
  const stmt = wrapQuery(
    db.prepare('SELECT key, value, updated_at FROM task_work WHERE task_id = $1 AND key = $2'),
    'SELECT'
  );
  return await stmt.get(taskId, key);
}

/**
 * @param {object} db
 * @param {string} taskId
 * @param {string} key
 * @param {string|null} value
 */
export async function upsertWorkEntry(db, taskId, key, value) {
  const stmt = wrapQuery(
    db.prepare(`
      INSERT INTO task_work (task_id, key, value, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (task_id, key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
    `),
    'INSERT'
  );
  return await stmt.run(taskId, key, value);
}

/**
 * Upsert multiple keys for a task.
 * @param {object} db
 * @param {string} taskId
 * @param {Record<string, string|null>} entries
 */
export async function upsertWorkEntries(db, taskId, entries) {
  for (const [key, value] of Object.entries(entries)) {
    await upsertWorkEntry(db, taskId, key, value);
  }
}

/**
 * Append a line to the log key (creates if missing).
 * @param {object} db
 * @param {string} taskId
 * @param {string} line
 */
export async function appendWorkLog(db, taskId, line) {
  const existing = await getWorkEntry(db, taskId, 'log');
  const prev = existing?.value || '';
  const next = prev ? `${prev}\n${line}` : line;
  return await upsertWorkEntry(db, taskId, 'log', next);
}

/**
 * @param {object} db
 * @param {string} taskId
 * @param {string} key
 */
export async function deleteWorkEntry(db, taskId, key) {
  const stmt = wrapQuery(
    db.prepare('DELETE FROM task_work WHERE task_id = $1 AND key = $2'),
    'DELETE'
  );
  return await stmt.run(taskId, key);
}

/**
 * Pending agent tasks: assigned to Agent with status queued (or resume-ready waiting/paused with control=resume handled by claim).
 * @param {object} db
 * @param {string[]} statuses
 */
export async function getPendingAgentTasks(db, statuses = ['queued']) {
  if (!statuses.length) return [];
  const placeholders = statuses.map((_, i) => `$${i + 2}`).join(', ');
  const query = `
    SELECT t.*, tw_status.value AS work_status
    FROM tasks t
    INNER JOIN task_work tw_status
      ON tw_status.task_id = t.id AND tw_status.key = 'status'
    WHERE t.memberid = $1
      AND tw_status.value IN (${placeholders})
    ORDER BY t.updated_at ASC NULLS LAST, t.created_at ASC
  `;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(AGENT_MEMBER_ID, ...statuses);
}

/**
 * Atomically claim a queued task (status queued → running).
 * Uses a single conditional UPDATE to avoid double-claim across pods.
 */
export async function claimAgentTask(db, taskId, claimedBy) {
  // Conditional UPDATE … RETURNING for multi-pod atomic claim
  const claimStmt = wrapQuery(
    db.prepare(`
      UPDATE task_work
      SET value = 'running', updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $1 AND key = 'status' AND value = 'queued'
      RETURNING task_id
    `),
    'UPDATE'
  );
  const claimed = await claimStmt.get(taskId);
  if (!claimed) {
    return null;
  }
  await upsertWorkEntry(db, taskId, 'claimed_by', claimedBy || '');
  await upsertWorkEntry(db, taskId, 'claimed_at', new Date().toISOString());
  await upsertWorkEntry(db, taskId, 'control', 'none');
  return await getWorkMapByTaskId(db, taskId);
}

/**
 * Count Agent-assigned tasks currently in a given work status (e.g. running).
 * @param {object} db
 * @param {string} status
 * @returns {Promise<number>}
 */
export async function countAgentTasksByStatus(db, status) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT COUNT(*)::int AS cnt
      FROM tasks t
      INNER JOIN task_work tw
        ON tw.task_id = t.id AND tw.key = 'status' AND tw.value = $2
      WHERE t.memberid = $1
    `),
    'SELECT'
  );
  const row = await stmt.get(AGENT_MEMBER_ID, status);
  return row?.cnt ?? 0;
}
