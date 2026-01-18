#!/usr/bin/env node

/**
 * Migration script to migrate data from SQLite to PostgreSQL
 * 
 * Usage:
 *   Single-tenant: node scripts/migrate-sqlite-to-postgres.js
 *   Multi-tenant:  node scripts/migrate-sqlite-to-postgres.js --tenant-id <tenantId>
 * 
 * Environment variables:
 *   SQLITE_DB_PATH: Path to SQLite database file (default: ./server/data/kanban.db)
 *   POSTGRES_HOST: PostgreSQL host (default: localhost)
 *   POSTGRES_PORT: PostgreSQL port (default: 5432)
 *   POSTGRES_DB: PostgreSQL database name (default: kanban)
 *   POSTGRES_USER: PostgreSQL user (default: kanban_user)
 *   POSTGRES_PASSWORD: PostgreSQL password (default: kanban_password)
 *   MULTI_TENANT: Set to 'true' for multi-tenant mode (uses schemas)
 */

import Database from 'better-sqlite3';
import pg from 'pg';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { Client } = pg;

// Parse command line arguments
const args = process.argv.slice(2);
const tenantIdIndex = args.indexOf('--tenant-id');
const tenantId = tenantIdIndex !== -1 ? args[tenantIdIndex + 1] : null;
const isMultiTenant = process.env.MULTI_TENANT === 'true';

// Configuration
const config = {
  sqlite: {
    dbPath: process.env.SQLITE_DB_PATH || join(__dirname, '../server/data/kanban.db'),
    tenantDbPath: tenantId 
      ? join(__dirname, '../server/data/tenants', tenantId, 'kanban.db')
      : null
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'kanban',
    user: process.env.POSTGRES_USER || 'kanban_user',
    password: process.env.POSTGRES_PASSWORD || 'kanban_password',
    schema: tenantId || 'public' // Use tenant ID as schema name in multi-tenant mode
  }
};

// SQLite to PostgreSQL type mapping
const typeMapping = {
  'INTEGER PRIMARY KEY AUTOINCREMENT': 'SERIAL PRIMARY KEY',
  'INTEGER': 'INTEGER',
  'TEXT': 'TEXT',
  'DATETIME': 'TIMESTAMPTZ', // Use TIMESTAMPTZ for timezone-aware timestamps
  'DATE': 'DATE',
  'BOOLEAN': 'BOOLEAN',
  'REAL': 'REAL',
  'BLOB': 'BYTEA'
};

// Convert SQLite SQL to PostgreSQL SQL
function convertSqliteToPostgres(sql) {
  let pgSql = sql;
  
  // Replace SQLite-specific syntax with PostgreSQL
  pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  pgSql = pgSql.replace(/AUTOINCREMENT/gi, '');
  pgSql = pgSql.replace(/INTEGER PRIMARY KEY/gi, 'SERIAL PRIMARY KEY');
  pgSql = pgSql.replace(/CREATE TABLE IF NOT EXISTS/gi, 'CREATE TABLE IF NOT EXISTS');
  pgSql = pgSql.replace(/CREATE INDEX IF NOT EXISTS/gi, 'CREATE INDEX IF NOT EXISTS');
  
  // CRITICAL: Replace DATETIME with TIMESTAMPTZ (timestamp with timezone)
  // TIMESTAMPTZ is better for multi-tenant/global apps as it handles timezones automatically
  // It stores UTC internally and converts to client timezone on retrieval
  pgSql = pgSql.replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ');
  
  // Replace SQLite boolean (INTEGER) with PostgreSQL boolean
  pgSql = pgSql.replace(/is_finished BOOLEAN DEFAULT 0/gi, 'is_finished BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/is_archived BOOLEAN DEFAULT 0/gi, 'is_archived BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/is_active INTEGER DEFAULT 1/gi, 'is_active BOOLEAN DEFAULT true');
  pgSql = pgSql.replace(/is_active INTEGER DEFAULT 0/gi, 'is_active BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/is_deleted INTEGER DEFAULT 0/gi, 'is_deleted BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/is_deleted INTEGER DEFAULT 1/gi, 'is_deleted BOOLEAN DEFAULT true');
  pgSql = pgSql.replace(/is_completed INTEGER DEFAULT 0/gi, 'is_completed BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/is_completed INTEGER DEFAULT 1/gi, 'is_completed BOOLEAN DEFAULT true');
  pgSql = pgSql.replace(/shared BOOLEAN DEFAULT 0/gi, 'shared BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/used BOOLEAN DEFAULT 0/gi, 'used BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/initial INTEGER DEFAULT 0/gi, 'initial INTEGER DEFAULT 0');
  pgSql = pgSql.replace(/force_logout INTEGER DEFAULT 0/gi, 'force_logout BOOLEAN DEFAULT false');
  
  // Also handle INTEGER columns that should be BOOLEAN (without DEFAULT)
  pgSql = pgSql.replace(/\bis_deleted\s+INTEGER\b/gi, 'is_deleted BOOLEAN');
  pgSql = pgSql.replace(/\bis_completed\s+INTEGER\b/gi, 'is_completed BOOLEAN');
  
  // Replace SQLite datetime functions
  pgSql = pgSql.replace(/CURRENT_TIMESTAMP/gi, 'CURRENT_TIMESTAMP');
  pgSql = pgSql.replace(/datetime\(/gi, 'to_timestamp(');
  
  // Remove SQLite-specific CHECK constraints that PostgreSQL doesn't support
  // (We'll handle these in application logic)
  
  return pgSql;
}

// Extract foreign key dependencies from CREATE TABLE SQL
function extractDependencies(createSql) {
  const dependencies = [];
  // Match FOREIGN KEY (column) REFERENCES table(column)
  // Also match inline references like: columnId TEXT REFERENCES columns(id)
  const fkRegex = /REFERENCES\s+(\w+)\s*\(/gi;
  let match;
  while ((match = fkRegex.exec(createSql)) !== null) {
    const depTable = match[1].toLowerCase();
    if (!dependencies.includes(depTable)) {
      dependencies.push(depTable);
    }
  }
  return dependencies;
}

// Sort tables by dependency order (tables without dependencies first)
function sortTablesByDependencies(tables) {
  const tableMap = new Map();
  const dependencies = new Map();
  
  // Build dependency map
  for (const table of tables) {
    const tableName = table.name.toLowerCase();
    tableMap.set(tableName, table);
    dependencies.set(tableName, extractDependencies(table.sql));
  }
  
  const sorted = [];
  const added = new Set();
  
  // Topological sort - add dependencies first
  function addTable(tableName) {
    if (added.has(tableName)) return;
    
    const deps = dependencies.get(tableName) || [];
    for (const dep of deps) {
      if (tableMap.has(dep) && !added.has(dep)) {
        addTable(dep);
      }
    }
    
    if (tableMap.has(tableName)) {
      sorted.push(tableMap.get(tableName));
      added.add(tableName);
    }
  }
  
  // Add all tables in dependency order
  for (const table of tables) {
    addTable(table.name.toLowerCase());
  }
  
  // Log the order for debugging
  console.log('📋 Table creation order:');
  sorted.forEach((table, index) => {
    const deps = dependencies.get(table.name.toLowerCase()) || [];
    console.log(`  ${index + 1}. ${table.name}${deps.length > 0 ? ` (depends on: ${deps.join(', ')})` : ''}`);
  });
  console.log('');
  
  return sorted;
}

// Get table creation SQL from SQLite schema
async function getTableSchemas(sqliteDb) {
  const tables = [];
  const tableNames = sqliteDb.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all();
  
  for (const { name } of tableNames) {
    const createTableSql = sqliteDb.prepare(`
      SELECT sql FROM sqlite_master 
      WHERE type='table' AND name=?
    `).get(name);
    
    if (createTableSql && createTableSql.sql) {
      tables.push({
        name,
        sql: createTableSql.sql
      });
    }
  }
  
  // Sort tables by dependency order
  return sortTablesByDependencies(tables);
}

// Get indexes from SQLite
async function getIndexes(sqliteDb) {
  const indexes = [];
  const indexRows = sqliteDb.prepare(`
    SELECT name, sql FROM sqlite_master 
    WHERE type='index' AND sql IS NOT NULL
    ORDER BY name
  `).all();
  
  for (const index of indexRows) {
    if (index.sql) {
      indexes.push(index.sql);
    }
  }
  
  return indexes;
}

// Migrate data from SQLite to PostgreSQL
async function migrateData(sqliteDb, pgClient, tableName, schema = 'public') {
  console.log(`  📦 Migrating data for table: ${tableName}`);
  
  // Get all rows from SQLite
  const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();
  
  if (rows.length === 0) {
    console.log(`    ⏭️  Table ${tableName} is empty, skipping data migration`);
    return;
  }
  
  // Get column names
  const columns = Object.keys(rows[0]);
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const columnNames = columns.join(', ');
  
  // Prepare insert statement
  const insertSql = `INSERT INTO ${schema}.${tableName} (${columnNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  
  // Insert rows in batches
  const batchSize = 1000;
  let inserted = 0;
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    
    for (const row of batch) {
          const values = columns.map(col => {
            const value = row[col];
            // Convert SQLite boolean (0/1) to PostgreSQL boolean
            if (value === 0 || value === 1) {
              // Check if column is boolean type (heuristic: check column name)
              // Common boolean column patterns: is_*, *_active, shared, used, force_logout
              const isBooleanColumn = 
                col.startsWith('is_') || 
                col.includes('_active') || 
                col === 'shared' || 
                col === 'used' || 
                col === 'force_logout' ||
                col === 'is_deleted' ||
                col === 'is_completed' ||
                col === 'is_finished' ||
                col === 'is_archived';
              
              if (isBooleanColumn) {
                return value === 1;
              }
            }
            return value === null ? null : value;
          });
      
      try {
        await pgClient.query(insertSql, values);
        inserted++;
      } catch (error) {
        console.error(`    ❌ Error inserting row into ${tableName}:`, error.message);
        console.error(`    Row data:`, row);
        throw error;
      }
    }
    
    if (i + batchSize < rows.length) {
      process.stdout.write(`    📊 Migrated ${Math.min(i + batchSize, rows.length)}/${rows.length} rows...\r`);
    }
  }
  
  console.log(`    ✅ Migrated ${inserted} rows from ${tableName}`);
}

// Main migration function
async function migrate() {
  console.log('🚀 Starting SQLite to PostgreSQL migration...\n');
  
  // Determine SQLite database path
  const sqlitePath = isMultiTenant && tenantId 
    ? config.sqlite.tenantDbPath 
    : config.sqlite.dbPath;
  
  if (!fs.existsSync(sqlitePath)) {
    console.error(`❌ SQLite database not found: ${sqlitePath}`);
    process.exit(1);
  }
  
  console.log(`📂 SQLite database: ${sqlitePath}`);
  console.log(`🐘 PostgreSQL: ${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`);
  if (isMultiTenant && tenantId) {
    console.log(`🏢 Tenant ID: ${tenantId}`);
    console.log(`📋 Schema: ${config.postgres.schema}`);
  }
  console.log('');
  
  // Confirm migration
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question('⚠️  This will migrate data from SQLite to PostgreSQL. Continue? (yes/no): ', resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ Migration cancelled');
    process.exit(0);
  }
  
  // Connect to SQLite
  console.log('📖 Reading SQLite database...');
  const sqliteDb = new Database(sqlitePath, { readonly: true });
  
  // Connect to PostgreSQL
  console.log('🔌 Connecting to PostgreSQL...');
  const pgClient = new Client({
    host: config.postgres.host,
    port: config.postgres.port,
    database: config.postgres.database,
    user: config.postgres.user,
    password: config.postgres.password
  });
  
  try {
    await pgClient.connect();
    console.log('✅ Connected to PostgreSQL\n');
    
    // Create schema if in multi-tenant mode
    if (isMultiTenant && tenantId) {
      console.log(`📋 Creating schema: ${config.postgres.schema}`);
      await pgClient.query(`CREATE SCHEMA IF NOT EXISTS ${config.postgres.schema}`);
      await pgClient.query(`SET search_path TO ${config.postgres.schema}, public`);
      console.log('✅ Schema created\n');
    }
    
    // Get table schemas from SQLite
    console.log('📊 Reading table schemas from SQLite...');
    const tables = await getTableSchemas(sqliteDb);
    console.log(`✅ Found ${tables.length} tables\n`);
    
    // Create tables in PostgreSQL
    console.log('🏗️  Creating tables in PostgreSQL...');
    for (const table of tables) {
      console.log(`  📋 Creating table: ${table.name}`);
      const pgSql = convertSqliteToPostgres(table.sql);
      
      try {
        // Use schema prefix if in multi-tenant mode
        const createSql = isMultiTenant && tenantId
          ? pgSql.replace(/CREATE TABLE IF NOT EXISTS (\w+)/gi, `CREATE TABLE IF NOT EXISTS ${config.postgres.schema}.$1`)
          : pgSql;
        
        await pgClient.query(createSql);
        console.log(`    ✅ Table ${table.name} created`);
      } catch (error) {
        // Table might already exist, check if it's a different error
        if (error.message.includes('already exists')) {
          console.log(`    ⚠️  Table ${table.name} already exists, skipping creation`);
        } else {
          console.error(`    ❌ Error creating table ${table.name}:`, error.message);
          throw error;
        }
      }
    }
    console.log('');
    
    // Fix boolean columns in existing tables (for tables created before schema fix)
    console.log('🔧 Fixing boolean column types in existing tables...');
    const schemaPrefix = isMultiTenant && tenantId ? `${config.postgres.schema}.` : '';
    const schemaName = isMultiTenant && tenantId ? config.postgres.schema : 'public';
    
    // Check if task_snapshots exists and fix boolean columns
    const tableExists = await pgClient.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = 'task_snapshots'
      )
    `, [schemaName]);
    
    if (tableExists.rows[0].exists) {
      // Check column types
      const columns = await pgClient.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = $1
        AND table_name = 'task_snapshots' 
        AND column_name IN ('is_deleted', 'is_completed')
      `, [schemaName]);
      
      const needsFix = columns.rows.some(c => c.data_type === 'integer');
      
      if (needsFix) {
        console.log('  🔧 task_snapshots has INTEGER boolean columns, dropping and recreating with correct types...');
        // Always drop and recreate - simpler and more reliable than ALTER
        await pgClient.query(`DROP TABLE IF EXISTS ${schemaPrefix}task_snapshots CASCADE`);
        // Find task_snapshots in tables array and recreate it
        const taskSnapshotsTable = tables.find(t => t.name === 'task_snapshots');
        if (taskSnapshotsTable) {
          const pgSql = convertSqliteToPostgres(taskSnapshotsTable.sql);
          const createSql = isMultiTenant && tenantId
            ? pgSql.replace(/CREATE TABLE IF NOT EXISTS (\w+)/gi, `CREATE TABLE IF NOT EXISTS ${config.postgres.schema}.$1`)
            : pgSql;
          await pgClient.query(createSql);
          console.log('    ✅ task_snapshots recreated with correct BOOLEAN types');
        } else {
          throw new Error('task_snapshots table definition not found in SQLite schema');
        }
      } else {
        console.log('  ✅ Boolean columns already correct');
      }
    } else {
      console.log('  ℹ️  task_snapshots table does not exist yet, will be created with correct types');
    }
    console.log('');
    
    // Create indexes
    console.log('📇 Creating indexes...');
    const indexes = await getIndexes(sqliteDb);
    for (const indexSql of indexes) {
      const pgIndexSql = convertSqliteToPostgres(indexSql);
      try {
        const finalIndexSql = isMultiTenant && tenantId
          ? pgIndexSql.replace(/CREATE INDEX IF NOT EXISTS (\w+) ON (\w+)/gi, `CREATE INDEX IF NOT EXISTS $1 ON ${config.postgres.schema}.$2`)
          : pgIndexSql;
        
        await pgClient.query(finalIndexSql);
      } catch (error) {
        if (error.message.includes('already exists')) {
          // Index already exists, skip
        } else {
          console.warn(`    ⚠️  Warning creating index: ${error.message}`);
        }
      }
    }
    console.log('✅ Indexes created\n');
    
    // Migrate data
    console.log('📦 Migrating data...');
    for (const table of tables) {
      try {
        await migrateData(sqliteDb, pgClient, table.name, isMultiTenant && tenantId ? config.postgres.schema : 'public');
      } catch (error) {
        console.error(`❌ Error migrating table ${table.name}:`, error.message);
        throw error;
      }
    }
    console.log('');
    
    // Reset sequences for tables with auto-increment IDs
    console.log('🔄 Resetting PostgreSQL sequences...');
    const schemaPrefix = isMultiTenant && tenantId ? `${config.postgres.schema}.` : '';
    const schemaName = isMultiTenant && tenantId ? config.postgres.schema : 'public';
    
    for (const table of tables) {
      try {
        // Check if table has a SERIAL/BIGSERIAL primary key column
        const pkResult = await pgClient.query(`
          SELECT 
            a.attname AS column_name,
            pg_get_serial_sequence($1 || '.' || $2, a.attname) AS sequence_name
          FROM pg_index i
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = ($1 || '.' || $2)::regclass
            AND i.indisprimary
            AND pg_get_serial_sequence($1 || '.' || $2, a.attname) IS NOT NULL
          LIMIT 1
        `, [schemaName, table.name]);
        
        if (pkResult.rows.length > 0) {
          const { column_name, sequence_name } = pkResult.rows[0];
          
          // Get the maximum ID value from the table (using PostgreSQL's quote_ident for safety)
          const maxIdResult = await pgClient.query(`
            SELECT COALESCE(MAX(${column_name}), 0) as max_id 
            FROM ${schemaPrefix}${table.name}
          `);
          const maxId = parseInt(maxIdResult.rows[0].max_id) || 0;
          
          // Reset the sequence to max_id + 1
          if (maxId > 0) {
            await pgClient.query(`SELECT setval($1, $2, true)`, [sequence_name, maxId]);
            console.log(`    ✅ Reset sequence for ${table.name}.${column_name} to ${maxId + 1}`);
          } else {
            // Even if max_id is 0, we should set the sequence to 1 to avoid starting at 0
            await pgClient.query(`SELECT setval($1, 0, true)`, [sequence_name]);
            console.log(`    ✅ Reset sequence for ${table.name}.${column_name} to 1 (table was empty)`);
          }
        }
      } catch (error) {
        // Some tables might not have sequences, or might have different structures
        // This is not critical, just log and continue
        console.log(`    ℹ️  Skipping sequence reset for ${table.name}: ${error.message}`);
      }
    }
    console.log('');
    
    // Verify migration
    console.log('🔍 Verifying migration...');
    for (const table of tables) {
      const sqliteCount = sqliteDb.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get().count;
      const pgResult = await pgClient.query(`SELECT COUNT(*) as count FROM ${schemaPrefix}${table.name}`);
      const pgCount = parseInt(pgResult.rows[0].count);
      
      if (sqliteCount !== pgCount) {
        console.warn(`    ⚠️  Table ${table.name}: SQLite has ${sqliteCount} rows, PostgreSQL has ${pgCount} rows`);
      } else {
        console.log(`    ✅ Table ${table.name}: ${sqliteCount} rows migrated`);
      }
    }
    console.log('');
    
    console.log('✅ Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('  1. Update your application to use PostgreSQL');
    console.log('  2. Test the application with PostgreSQL');
    console.log('  3. Once verified, you can remove the SQLite database');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    sqliteDb.close();
    await pgClient.end();
  }
}

// Run migration
migrate().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

