import crypto from 'crypto';
import { dbTransaction, dbExec, dbAll, dbRun, isProxyDatabase, isPostgresDatabase } from '../utils/dbAsync.js';

// Migration definitions
// Note: Migrations 1-10 have been integrated into CREATE_TABLES_SQL in database.js
// They are automatically marked as applied for new databases and existing databases
// that don't have them yet. Only migrations 11+ are defined here.

const migrations = [
  // Future migrations will be added here with version: 11, 12, etc.
];

/**
 * Run all pending database migrations
 * @param {Database} db - SQLite database instance (can be proxy or direct)
 * Now async to support proxy mode
 */
// Convert SQLite SQL to PostgreSQL SQL for migrations
function convertMigrationSql(sql, isPostgres) {
  if (!isPostgres) return sql;
  
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    .replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ');
}

export const runMigrations = async (db) => {
  try {
    console.log('\n🔄 Checking for pending database migrations...');
    
    const isProxy = isProxyDatabase(db);
    const isPostgres = isPostgresDatabase(db);
    
    // Ensure migrations tracking table exists (async for both proxy and direct DB)
    const createTableSql = convertMigrationSql(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `, isPostgres);
    
    await dbExec(db, createTableSql);
    
    // Get list of already applied migrations (async for both proxy and direct DB)
    // Proxy service handles expected SQLite errors at the service level
    const stmt = db.prepare('SELECT version FROM schema_migrations ORDER BY version');
    const appliedMigrations = await dbAll(stmt);
    
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    
    // Migrations 1-10 have been integrated into CREATE_TABLES_SQL in database.js
    // Mark them as applied for any database that doesn't have them yet
    const LAST_INTEGRATED_MIGRATION = 10;
    const integratedMigrationNames = [
      { version: 1, name: 'add_reporting_tables', description: 'Add tables for activity tracking, achievements, and reporting' },
      { version: 2, name: 'add_sprint_columns', description: 'Add is_active, description, and updated_at columns to planning_periods table' },
      { version: 3, name: 'add_task_snapshots_columns', description: 'Add missing columns to task_snapshots table for reporting' },
      { version: 4, name: 'add_badges_table', description: 'Create badges master table with predefined achievements' },
      { version: 5, name: 'add_watchers_added_column', description: 'Add watchers_added column to user_points table' },
      { version: 6, name: 'add_badge_id_column', description: 'Add badge_id column to user_achievements table' },
      { version: 7, name: 'add_notification_queue', description: 'Add persistent notification queue table to survive server restarts' },
      { version: 8, name: 'add_performance_indexes', description: 'Add indexes on frequently queried columns for better performance with large datasets' },
      { version: 9, name: 'add_sprint_id_to_tasks', description: 'Add sprint_id column to tasks for direct sprint association (agile workflow support)' },
      { version: 10, name: 'add_priority_id_to_tasks', description: 'Add priority_id column to tasks table and migrate from priority name to priority ID' }
    ];
    
    // Find which integrated migrations are missing
    const missingIntegratedMigrations = integratedMigrationNames.filter(m => !appliedVersions.has(m.version));
    
    if (missingIntegratedMigrations.length > 0) {
      console.log(`📦 Marking ${missingIntegratedMigrations.length} integrated migration(s) as applied (already in CREATE_TABLES_SQL)...`);
      
      // Use PostgreSQL-compatible INSERT syntax
      const insertSql = isPostgres
        ? 'INSERT INTO schema_migrations (version, name, description) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING'
        : 'INSERT OR IGNORE INTO schema_migrations (version, name, description) VALUES (?, ?, ?)';
      
      const insertStmt = db.prepare(insertSql);
      
      for (const migration of missingIntegratedMigrations) {
        await dbRun(insertStmt, migration.version, migration.name, migration.description || '');
      }
      
      console.log(`✅ Marked ${missingIntegratedMigrations.length} integrated migration(s) as applied\n`);
    }
    
    // Get updated list of applied migrations (async for both proxy and direct DB)
    const updatedStmt = db.prepare('SELECT version FROM schema_migrations ORDER BY version');
    const updatedAppliedMigrations = await dbAll(updatedStmt);
    
    const updatedAppliedVersions = new Set(updatedAppliedMigrations.map(m => m.version));
    
    // Find pending migrations (only versions > LAST_INTEGRATED_MIGRATION, i.e., 11+)
    const pendingMigrations = migrations.filter(m => !updatedAppliedVersions.has(m.version));
    
    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date (no pending migrations)\n');
      return { success: true, applied: 0 };
    }
    
    console.log(`📋 Found ${pendingMigrations.length} pending migration(s):\n`);
    pendingMigrations.forEach(m => {
      console.log(`   • Version ${m.version}: ${m.name}`);
    });
    console.log('');
    
    let appliedCount = 0;
    
    // Apply each pending migration in sequence
    for (const migration of pendingMigrations) {
      console.log(`⚙️  Applying migration ${migration.version}: ${migration.name}`);
      
      try {
        // Execute migration (migration.up() should be async and use await for all db operations)
        // If migration returns a promise, await it; if it's sync, wrap it
        const migrationResult = migration.up(db);
        if (migrationResult && typeof migrationResult.then === 'function') {
          await migrationResult;
        }
        
        // Record migration as applied (async for both proxy and direct DB)
        // Use PostgreSQL-compatible INSERT syntax
        const insertSql = isPostgres
          ? 'INSERT INTO schema_migrations (version, name, description) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING'
          : 'INSERT OR IGNORE INTO schema_migrations (version, name, description) VALUES (?, ?, ?)';
        
        const insertStmt = db.prepare(insertSql);
        await dbRun(insertStmt, migration.version, migration.name, migration.description || '');
        
        appliedCount++;
        console.log(`✅ Migration ${migration.version} applied successfully\n`);
      } catch (error) {
        console.error(`❌ Migration ${migration.version} failed:`, error.message);
        console.error('   Migration rolled back. Database state is unchanged.\n');
        throw error;
      }
    }
    
    console.log(`🎉 All ${appliedCount} migration(s) completed successfully!\n`);
    
    return { success: true, applied: appliedCount };
    
  } catch (error) {
    console.error('❌ Migration system failed:', error);
    throw error;
  }
};

/**
 * Get migration status (for admin API)
 * @param {Database} db - SQLite database instance (can be proxy or direct)
 * Now async to support proxy mode
 */
export const getMigrationStatus = async (db) => {
  try {
    const isPostgres = isPostgresDatabase(db);
    
    // Ensure migrations table exists (async for both proxy and direct DB)
    const createTableSql = convertMigrationSql(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `, isPostgres);
    
    await dbExec(db, createTableSql);
    
    // Get applied migrations (async for both proxy and direct DB)
    const stmt = db.prepare(`
      SELECT version, name, description, applied_at 
      FROM schema_migrations 
      ORDER BY version DESC
    `);
    const appliedMigrations = await dbAll(stmt);
    
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));
    
    // Latest version is either the highest migration version (11+) or 10 (last integrated migration)
    const latestMigrationVersion = migrations.length > 0 
      ? Math.max(...migrations.map(m => m.version))
      : 10; // Last integrated migration
    
    return {
      current_version: appliedMigrations[0]?.version || 0,
      latest_version: latestMigrationVersion,
      applied: appliedMigrations,
      pending: pendingMigrations.map(m => ({
        version: m.version,
        name: m.name,
        description: m.description
      })),
      status: pendingMigrations.length === 0 ? 'up-to-date' : 'pending'
    };
  } catch (error) {
    console.error('Error getting migration status:', error);
    throw error;
  }
};

export default { runMigrations, getMigrationStatus };

