/**
 * Mutation journal for automation apply/undo.
 */

import { wrapQuery } from '../queryLogger.js';

export async function appendEntry(db, row) {
  const stmt = wrapQuery(
    db.prepare(`
      INSERT INTO agent_automation_journal (
        id, job_id, task_id, seq, op, entity_type, entity_id, before_json, after_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `),
    'INSERT'
  );
  await stmt.run(
    row.id,
    row.jobId,
    row.taskId,
    row.seq,
    row.op,
    row.entityType,
    row.entityId,
    row.beforeJson ?? null,
    row.afterJson ?? null
  );
}

export async function getNextSeq(db, jobId) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT COALESCE(MAX(seq), 0)::int AS max_seq
      FROM agent_automation_journal
      WHERE job_id = $1
    `),
    'SELECT'
  );
  const row = await stmt.get(jobId);
  return (row?.max_seq ?? 0) + 1;
}

export async function listByJobId(db, jobId) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT id, job_id, task_id, seq, op, entity_type, entity_id,
             before_json, after_json, created_at, undone_at
      FROM agent_automation_journal
      WHERE job_id = $1
      ORDER BY seq ASC
    `),
    'SELECT'
  );
  return await stmt.all(jobId);
}

export async function listUndoableByJobId(db, jobId) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT id, job_id, task_id, seq, op, entity_type, entity_id,
             before_json, after_json, created_at, undone_at
      FROM agent_automation_journal
      WHERE job_id = $1 AND undone_at IS NULL
      ORDER BY seq DESC
    `),
    'SELECT'
  );
  return await stmt.all(jobId);
}

export async function markUndone(db, id) {
  const stmt = wrapQuery(
    db.prepare(`
      UPDATE agent_automation_journal
      SET undone_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND undone_at IS NULL
    `),
    'UPDATE'
  );
  return await stmt.run(id);
}

export async function countUndoable(db, jobId) {
  const stmt = wrapQuery(
    db.prepare(`
      SELECT COUNT(*)::int AS cnt
      FROM agent_automation_journal
      WHERE job_id = $1 AND undone_at IS NULL
    `),
    'SELECT'
  );
  const row = await stmt.get(jobId);
  return row?.cnt ?? 0;
}
