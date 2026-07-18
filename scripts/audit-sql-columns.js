#!/usr/bin/env node
/**
 * Audit SQL identifiers against CREATE_SCHEMA_SQL physical column names.
 *
 * Checks server JS for:
 *  - Unquoted camelCase column refs in SQL (rely on PG folding — style debt)
 *  - Quoted "camelCase" column refs that are not AS aliases (runtime failures)
 *  - Boolean columns compared/assigned as 0/1
 *  - SQLite leftovers (JSON_GROUP_ARRAY, INSERT OR REPLACE, etc.)
 *
 * Optionally compares DDL to a live Postgres database when POSTGRES_* env is set.
 *
 * Usage: node scripts/audit-sql-columns.js
 * Exit 1 if blocking issues found.
 */

import { readFile, readdir } from 'fs/promises';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATABASE_JS = join(ROOT, 'server/config/database.js');
const SERVER_DIR = join(ROOT, 'server');

const CAMEL_TOKENS = [
  'boardId', 'columnId', 'taskId', 'memberId', 'userId', 'tagId', 'authorId',
  'requesterId', 'startDate', 'dueDate', 'createdAt', 'updatedAt', 'priorityId',
  'sprintId', 'commentId', 'pre_boardId', 'pre_columnId', 'roleId', 'filterName',
];

const SQLITE_RE = /JSON_GROUP_ARRAY|json_group_array|INSERT OR REPLACE|datetime\('now'\)|AUTOINCREMENT/;
const BOOL_INT_RE = /\b(is_active|is_finished|is_archived|shared|is_completed)\s*=\s*[01]\b/i;
const CAMEL_RE = new RegExp(`\\b(${CAMEL_TOKENS.join('|')})\\b`);

const EXCLUDE = [/node_modules/, /\.test\.js$/, /scripts\/generate-qa/];

async function walkJs(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (EXCLUDE.some((r) => r.test(p))) continue;
    if (e.isDirectory()) await walkJs(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function extractSchema(ddlSource) {
  const m = ddlSource.match(/CREATE_SCHEMA_SQL\s*=\s*`([\s\S]*?)`;/);
  if (!m) throw new Error('CREATE_SCHEMA_SQL not found in database.js');
  const ddl = m[1];
  const tables = {};
  for (const tm of ddl.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\);/gi)) {
    const name = tm[1].toLowerCase();
    const cols = [];
    for (const line of tm[2].split('\n')) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed || /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(trimmed)) continue;
      const cm = trimmed.match(/^"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+/);
      if (cm) cols.push(cm[1].toLowerCase());
    }
    tables[name] = cols;
  }
  return tables;
}

function extractSqlChunks(text) {
  const chunks = [];
  for (const m of text.matchAll(/`([^`]*)`/g)) {
    const sql = m[1];
    if (!/\b(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP)\b/i.test(sql)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    chunks.push({ sql, line });
  }
  return chunks;
}

function cleanSql(sql) {
  let s = sql.replace(/\$\{[^}]*\}/g, ' ');
  s = s.replace(/\bas\s+"[^"]+"/gi, ' ');
  s = s.replace(/\bas\s+'[^']+'/gi, ' ');
  s = s.replace(/'(?:\\.|[^'\\])*'/g, " '' ");
  return s;
}

async function auditFiles() {
  const files = await walkJs(SERVER_DIR);
  const blocking = [];
  const style = [];
  const sqlite = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const rel = relative(ROOT, file);
    const lines = text.split('\n');

    lines.forEach((line, i) => {
      const n = i + 1;
      const stripped = line.trim();
      if (stripped.startsWith('//') || stripped.startsWith('*')) return;
      if (SQLITE_RE.test(line)) sqlite.push({ file: rel, line: n, snippet: stripped.slice(0, 120) });
      if (BOOL_INT_RE.test(line)) blocking.push({ file: rel, line: n, kind: 'bool_int', snippet: stripped.slice(0, 120) });
    });

    for (const { sql, line } of extractSqlChunks(text)) {
      for (const cm of sql.matchAll(/(?<!\bas\s)"([a-z]+[A-Z][a-zA-Z0-9]*)"/g)) {
        const before = sql.slice(Math.max(0, cm.index - 8), cm.index).toLowerCase();
        if (/\bas\s*$/.test(before)) continue;
        blocking.push({ file: rel, line, kind: 'quoted_camel', token: cm[1] });
      }
      const cleaned = cleanSql(sql);
      for (const tm of cleaned.matchAll(new RegExp(CAMEL_RE, 'g'))) {
        style.push({ file: rel, line, token: tm[1] });
      }
    }
  }

  const seen = new Set();
  const styleDedup = [];
  for (const s of style) {
    const k = `${s.file}:${s.line}:${s.token}`;
    if (seen.has(k)) continue;
    seen.add(k);
    styleDedup.push(s);
  }

  return { blocking, style: styleDedup, sqlite };
}

async function compareLive(schema) {
  const host = process.env.POSTGRES_HOST;
  if (!host) return null;
  const pool = new pg.Pool({
    host,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
  });
  try {
    const { rows } = await pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `);
    const live = {};
    for (const r of rows) {
      (live[r.table_name] ||= []).push(r.column_name);
    }
    const onlyDdl = Object.keys(schema).filter((t) => !live[t]).sort();
    const onlyLive = Object.keys(live).filter((t) => !schema[t]).sort();
    const mismatches = [];
    for (const t of Object.keys(schema)) {
      if (!live[t]) continue;
      const a = new Set(schema[t]);
      const b = new Set(live[t]);
      const ddlOnly = [...a].filter((c) => !b.has(c)).sort();
      const liveOnly = [...b].filter((c) => !a.has(c)).sort();
      if (ddlOnly.length || liveOnly.length) mismatches.push({ table: t, ddlOnly, liveOnly });
    }
    return { onlyDdl, onlyLive, mismatches, liveTables: Object.keys(live).length, liveColumns: rows.length };
  } finally {
    await pool.end();
  }
}

async function main() {
  const dbSource = await readFile(DATABASE_JS, 'utf8');
  const schema = extractSchema(dbSource);
  const tableCount = Object.keys(schema).length;
  const colCount = Object.values(schema).reduce((n, c) => n + c.length, 0);

  console.log(`Schema from CREATE_SCHEMA_SQL: ${tableCount} tables, ${colCount} columns`);

  const { blocking, style, sqlite } = await auditFiles();
  const live = await compareLive(schema);

  if (live) {
    console.log(`Live Postgres: ${live.liveTables} tables, ${live.liveColumns} columns`);
    if (live.onlyDdl.length || live.onlyLive.length || live.mismatches.length) {
      console.log('DDL vs live mismatches:');
      if (live.onlyDdl.length) console.log('  only in DDL:', live.onlyDdl.join(', '));
      if (live.onlyLive.length) console.log('  only in live:', live.onlyLive.join(', '));
      for (const m of live.mismatches) {
        console.log(`  ${m.table}: ddl_only=${m.ddlOnly} live_only=${m.liveOnly}`);
      }
    } else {
      console.log('DDL matches live information_schema (column sets).');
    }
  } else {
    console.log('Skipping live DB compare (set POSTGRES_HOST to enable).');
  }

  console.log(`\nBlocking: ${blocking.length}`);
  for (const e of blocking) console.log(`  ${e.file}:${e.line} [${e.kind}] ${e.token || e.snippet || ''}`);

  console.log(`SQLite remnants: ${sqlite.length}`);
  for (const e of sqlite) console.log(`  ${e.file}:${e.line} ${e.snippet}`);

  console.log(`Style (unquoted camelCase in SQL): ${style.length}`);
  for (const e of style.slice(0, 40)) console.log(`  ${e.file}:${e.line} ${e.token}`);
  if (style.length > 40) console.log(`  ... and ${style.length - 40} more`);

  const liveFail = live && (live.onlyDdl.length || live.onlyLive.length || live.mismatches.length);
  const fail = blocking.length > 0 || sqlite.length > 0 || liveFail;

  if (fail) {
    console.log('\nFAIL');
    process.exit(1);
  }
  if (style.length) {
    console.log('\nPASS (with style warnings — unquoted camelCase folds in Postgres but prefer lowercase)');
  } else {
    console.log('\nPASS');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
