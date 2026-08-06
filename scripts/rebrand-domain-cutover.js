#!/usr/bin/env node
/**
 * Docru domain / brand cutover for PostgreSQL settings.
 *
 * - SITE_NAME: exact 'Easy Kanban' → 'Docru' (custom names unchanged)
 * - Host rewrite ezkan.cloud → docru.app in:
 *     APP_URL, GOOGLE_CALLBACK_URL, WEBSITE_URL, ADMIN_PORTAL_URL
 * - Does NOT modify any SMTP_* keys (fix those in Admin → Mail)
 *
 * Single-tenant Docker: updates public.settings
 * Multi-tenant: updates every schema matching tenant_% that has a settings table
 *
 * Usage:
 *   node scripts/rebrand-domain-cutover.js              # apply
 *   node scripts/rebrand-domain-cutover.js --dry-run    # report only
 *
 * Env (same defaults as other scripts / docker-compose):
 *   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
 *   OLD_DOMAIN (default: ezkan.cloud)
 *   NEW_DOMAIN (default: docru.app)
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const OLD_DOMAIN = String(process.env.OLD_DOMAIN || 'ezkan.cloud').trim();
const NEW_DOMAIN = String(process.env.NEW_DOMAIN || 'docru.app').trim();

const URL_KEYS = ['APP_URL', 'GOOGLE_CALLBACK_URL', 'WEBSITE_URL', 'ADMIN_PORTAL_URL'];

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  database: process.env.POSTGRES_DB || 'kanban',
  user: process.env.POSTGRES_USER || 'kanban_user',
  password: process.env.POSTGRES_PASSWORD || 'kanban_password',
});

function quoteIdent(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

function rewriteHostValue(value) {
  if (value == null) return null;
  const s = String(value);
  if (!s.includes(OLD_DOMAIN)) return null;
  return s.split(OLD_DOMAIN).join(NEW_DOMAIN);
}

async function listTargetSchemas(client) {
  const schemas = new Set(['public']);
  const { rows } = await client.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
    ORDER BY schema_name
  `);
  for (const row of rows) {
    schemas.add(row.schema_name);
  }
  return [...schemas];
}

async function schemaHasSettings(client, schema) {
  const { rows } = await client.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_name = 'settings'
    LIMIT 1
    `,
    [schema]
  );
  return rows.length > 0;
}

async function cutoverSchema(client, schema) {
  const q = quoteIdent(schema);
  const summary = {
    schema,
    siteNameUpdates: 0,
    urlUpdates: [],
  };

  // SITE_NAME
  const siteSelect = await client.query(
    `SELECT value FROM ${q}.settings WHERE key = 'SITE_NAME' LIMIT 1`
  );
  const currentSite = siteSelect.rows[0]?.value;
  if (currentSite === 'Easy Kanban') {
    summary.siteNameUpdates = 1;
    if (!DRY_RUN) {
      await client.query(
        `UPDATE ${q}.settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'SITE_NAME' AND value = $2`,
        ['Docru', 'Easy Kanban']
      );
    }
  }

  // URL host rewrite (no SMTP_*)
  for (const key of URL_KEYS) {
    const { rows } = await client.query(
      `SELECT value FROM ${q}.settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    const current = rows[0]?.value;
    if (current == null || current === '') continue;
    const next = rewriteHostValue(current);
    if (next == null || next === current) continue;
    summary.urlUpdates.push({ key, from: current, to: next });
    if (!DRY_RUN) {
      await client.query(
        `UPDATE ${q}.settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = $2`,
        [next, key]
      );
    }
  }

  return summary;
}

async function main() {
  console.log(`Docru cutover (${DRY_RUN ? 'DRY RUN' : 'APPLY'})`);
  console.log(`  Domain: ${OLD_DOMAIN} → ${NEW_DOMAIN}`);
  console.log(`  SITE_NAME: 'Easy Kanban' → 'Docru' (exact match only)`);
  console.log(`  URL keys: ${URL_KEYS.join(', ')}`);
  console.log(`  SMTP_*: skipped`);
  console.log('');

  const client = await pool.connect();
  try {
    const schemas = await listTargetSchemas(client);
    let schemasTouched = 0;
    let totalSite = 0;
    let totalUrls = 0;

    for (const schema of schemas) {
      if (!(await schemaHasSettings(client, schema))) {
        console.log(`— ${schema}: no settings table, skip`);
        continue;
      }
      const summary = await cutoverSchema(client, schema);
      const changed = summary.siteNameUpdates > 0 || summary.urlUpdates.length > 0;
      if (!changed) {
        console.log(`— ${schema}: no matching SITE_NAME / URL hosts`);
        continue;
      }
      schemasTouched += 1;
      totalSite += summary.siteNameUpdates;
      totalUrls += summary.urlUpdates.length;
      console.log(`✓ ${schema}:`);
      if (summary.siteNameUpdates) {
        console.log(`    SITE_NAME: Easy Kanban → Docru`);
      }
      for (const u of summary.urlUpdates) {
        console.log(`    ${u.key}:`);
        console.log(`      ${u.from}`);
        console.log(`      → ${u.to}`);
      }
    }

    console.log('');
    console.log(
      `Done. Schemas with changes: ${schemasTouched}; SITE_NAME rows: ${totalSite}; URL rewrites: ${totalUrls}`
    );
    if (DRY_RUN) {
      console.log('Dry run only — re-run without --dry-run to apply.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Cutover failed:', err.message);
  process.exit(1);
});
