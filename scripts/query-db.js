#!/usr/bin/env node
/**
 * Run a SQL query against PostgreSQL (Docker / K8s).
 *
 * Usage:
 *   node scripts/query-db.js "SELECT * FROM users LIMIT 5;"
 *   POSTGRES_HOST=localhost POSTGRES_USER=kanban_user POSTGRES_PASSWORD=kanban_password \
 *     POSTGRES_DB=kanban node scripts/query-db.js "SELECT count(*) FROM tasks;"
 *
 * In Docker:
 *   docker exec -it easy-kanban node /app/scripts/query-db.js "SELECT id, email FROM users LIMIT 5;"
 */

import pg from 'pg';

const sql = process.argv.slice(2).join(' ').trim();
if (!sql) {
  console.error('Usage: node scripts/query-db.js "SQL_QUERY"');
  process.exit(1);
}

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'kanban',
  user: process.env.POSTGRES_USER || 'kanban_user',
  password: process.env.POSTGRES_PASSWORD || 'kanban_password',
});

try {
  const result = await pool.query(sql);
  if (result.rows?.length) {
    console.table(result.rows);
  } else {
    console.log(JSON.stringify({ rowCount: result.rowCount, command: result.command }, null, 2));
  }
} catch (err) {
  console.error('Query failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
