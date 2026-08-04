/**
 * CSP violation report storage (tenant-scoped).
 */

import { wrapQuery } from '../queryLogger.js';

const KEEP_MAX = 500;

/**
 * @param {object} db
 * @param {object} row
 */
export async function insertCspReport(db, row) {
  const query = `
    INSERT INTO csp_reports (
      document_uri, violated_directive, blocked_uri, source_file, line_number, user_agent, raw
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING id
  `;
  const stmt = wrapQuery(db.prepare(query), 'INSERT');
  return await stmt.get(
    row.documentUri ?? null,
    row.violatedDirective ?? null,
    row.blockedUri ?? null,
    row.sourceFile ?? null,
    row.lineNumber ?? null,
    row.userAgent ?? null,
    JSON.stringify(row.raw ?? {})
  );
}

/**
 * Keep only the newest KEEP_MAX rows (run after insert).
 * @param {object} db
 */
export async function pruneCspReports(db) {
  const query = `
    DELETE FROM csp_reports
    WHERE id NOT IN (
      SELECT id FROM csp_reports ORDER BY created_at DESC, id DESC LIMIT $1
    )
  `;
  const stmt = wrapQuery(db.prepare(query), 'DELETE');
  return await stmt.run(KEEP_MAX);
}

/**
 * @param {object} db
 * @param {number} [limit=100]
 */
export async function listCspReports(db, limit = 100) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const query = `
    SELECT
      id,
      created_at AS "createdAt",
      document_uri AS "documentUri",
      violated_directive AS "violatedDirective",
      blocked_uri AS "blockedUri",
      source_file AS "sourceFile",
      line_number AS "lineNumber",
      user_agent AS "userAgent",
      raw
    FROM csp_reports
    ORDER BY created_at DESC, id DESC
    LIMIT $1
  `;
  const stmt = wrapQuery(db.prepare(query), 'SELECT');
  return await stmt.all(safeLimit);
}

/**
 * @param {object} db
 */
export async function clearCspReports(db) {
  const stmt = wrapQuery(db.prepare('DELETE FROM csp_reports'), 'DELETE');
  return await stmt.run();
}

/**
 * @param {object} db
 */
export async function countCspReports(db) {
  const stmt = wrapQuery(db.prepare('SELECT COUNT(*)::int AS count FROM csp_reports'), 'SELECT');
  const row = await stmt.get();
  return row?.count ?? 0;
}
