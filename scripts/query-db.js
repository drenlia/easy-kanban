#!/usr/bin/env node
/**
 * Query SQLite database from pod without copying
 * Usage: kubectl exec -n easy-kanban <pod> -- node /app/scripts/query-db.js "SELECT * FROM users LIMIT 5;"
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get tenant ID from environment or command line
const tenantId = process.argv[2] || process.env.TENANT_ID || null;
const query = process.argv[3] || process.argv[2]; // Support both: node script.js tenant query OR node script.js query

// Determine database path
const basePath = process.env.DOCKER_ENV === 'true'
  ? '/app/server/data'
  : join(__dirname, '..');

const dbPath = tenantId
  ? join(basePath, 'tenants', tenantId, 'kanban.db')
  : join(basePath, 'kanban.db');

if (!query || query === tenantId) {
  console.error('Usage: node query-db.js [tenantId] "SQL_QUERY"');
  console.error('Example: node query-db.js drenlia "SELECT * FROM users LIMIT 5;"');
  console.error('Example: node query-db.js "SELECT * FROM users LIMIT 5;"');
  process.exit(1);
}

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Execute query
  if (query.trim().toUpperCase().startsWith('SELECT')) {
    const results = db.prepare(query).all();
    console.log(JSON.stringify(results, null, 2));
  } else {
    console.error('⚠️  Only SELECT queries are allowed in readonly mode');
    console.error('For write operations, use the application API or copy the database');
    process.exit(1);
  }
  
  db.close();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

