import { dbExec, dbAll, dbRun } from '../utils/dbAsync.js';

// Migration definitions
// Note: Migrations 1-10 have been integrated into CREATE_SCHEMA_SQL in database.js
// They are automatically marked as applied for new databases and existing databases
// that don't have them yet. Only migrations 11+ are defined here.

const migrations = [
  {
    version: 11,
    name: 'convert_position_to_numeric',
    description: 'Convert position fields from INTEGER to NUMERIC for tasks, columns, and boards to support fractional positions',
    up: async (db) => {
      // information_schema ignores search_path — always scope to this tenant's schema
      const schema = (db.schema && typeof db.schema === 'string') ? db.schema : 'public';
      const checkTasksSql = `
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_schema = ? AND table_name = 'tasks' AND column_name = 'position'
      `;
      const checkColumnsSql = `
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_schema = ? AND table_name = 'columns' AND column_name = 'position'
      `;
      const checkBoardsSql = `
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_schema = ? AND table_name = 'boards' AND column_name = 'position'
      `;

      const tasksType = await dbAll(db.prepare(checkTasksSql), schema);
      const columnsType = await dbAll(db.prepare(checkColumnsSql), schema);
      const boardsType = await dbAll(db.prepare(checkBoardsSql), schema);

      if (tasksType.length > 0 && tasksType[0].data_type !== 'numeric') {
        await dbExec(db, 'ALTER TABLE tasks ALTER COLUMN position TYPE NUMERIC(10,2) USING position::NUMERIC(10,2)');
        console.log('✅ Converted tasks.position to NUMERIC(10,2)');
      }

      if (columnsType.length > 0 && columnsType[0].data_type !== 'numeric') {
        await dbExec(db, 'ALTER TABLE columns ALTER COLUMN position TYPE NUMERIC(10,2) USING position::NUMERIC(10,2)');
        console.log('✅ Converted columns.position to NUMERIC(10,2)');
      }

      if (boardsType.length > 0 && boardsType[0].data_type !== 'numeric') {
        await dbExec(db, 'ALTER TABLE boards ALTER COLUMN position TYPE NUMERIC(10,2) USING position::NUMERIC(10,2)');
        console.log('✅ Converted boards.position to NUMERIC(10,2)');
      }
    }
  },
  {
    version: 12,
    name: 'add_debug_logging_settings',
    description: 'Insert default FE_DEBUG_* and SERVER_DEBUG_* settings for gated console logs',
    up: async (db) => {
      const { settings: settingsQueries } = await import('../utils/sqlManager/index.js');
      const { DEBUG_SETTING_DEFAULTS } = await import('../constants/debugSettings.js');
      for (const [key, value] of DEBUG_SETTING_DEFAULTS) {
        const existing = await settingsQueries.getSettingByKey(db, key);
        if (!existing) {
          await settingsQueries.createSetting(db, key, value);
        }
      }
    }
  },
  {
    version: 13,
    name: 'add_fe_debug_api_dnd_settings',
    description: 'Insert FE_DEBUG_API and FE_DEBUG_DND if missing (new public debug flags)',
    up: async (db) => {
      const { settings: settingsQueries } = await import('../utils/sqlManager/index.js');
      const extra = [
        ['FE_DEBUG_API', 'false'],
        ['FE_DEBUG_DND', 'false']
      ];
      for (const [key, value] of extra) {
        const existing = await settingsQueries.getSettingByKey(db, key);
        if (!existing) {
          await settingsQueries.createSetting(db, key, value);
        }
      }
    }
  },
  {
    version: 14,
    name: 'add_fe_perf_tests_setting',
    description: 'Insert FE_PERF_TESTS feature flag (default false) for Performance Test Overlay',
    up: async (db) => {
      const { settings: settingsQueries } = await import('../utils/sqlManager/index.js');
      const existing = await settingsQueries.getSettingByKey(db, 'FE_PERF_TESTS');
      if (!existing) {
        await settingsQueries.createSetting(db, 'FE_PERF_TESTS', 'false');
      }
    }
  },
  {
    version: 15,
    name: 'add_ai_agent_platform',
    description: 'task_work KV store, user API tokens, SSH keys, AI settings, and Agent pseudo-user',
    up: async (db) => {
      await dbExec(db, `
        CREATE TABLE IF NOT EXISTS task_work (
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          value TEXT,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (task_id, key)
        );
        CREATE INDEX IF NOT EXISTS idx_task_work_task_id ON task_work(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_work_key_value ON task_work(key, value);

        CREATE TABLE IF NOT EXISTS user_api_tokens (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL DEFAULT 'default',
          token_prefix TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          last_used_at TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS idx_user_api_tokens_user_id ON user_api_tokens(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_api_tokens_prefix ON user_api_tokens(token_prefix);

        CREATE TABLE IF NOT EXISTS user_ssh_keys (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          public_key TEXT NOT NULL,
          private_key_encrypted TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const { settings: settingsQueries } = await import('../utils/sqlManager/index.js');
      const { AI_SETTING_DEFAULTS } = await import('../constants/aiSettings.js');
      for (const [key, value] of AI_SETTING_DEFAULTS) {
        const existing = await settingsQueries.getSettingByKey(db, key);
        if (!existing) {
          await settingsQueries.createSetting(db, key, value);
        }
      }

      const {
        AGENT_USER_ID,
        AGENT_MEMBER_ID,
        AGENT_DEFAULT_NAME,
        AGENT_DEFAULT_COLOR
      } = await import('../constants/agentIdentity.js');
      const crypto = await import('crypto');
      const bcrypt = (await import('bcrypt')).default;

      const existingAgent = await dbAll(
        db.prepare('SELECT id FROM users WHERE id = $1'),
        AGENT_USER_ID
      );
      if (!existingAgent.length) {
        const passwordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
        await dbRun(
          db.prepare(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path, auth_provider, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `),
          AGENT_USER_ID,
          'agent@local',
          passwordHash,
          'AI',
          'Agent',
          null,
          'local',
          false
        );

        const roles = await dbAll(db.prepare("SELECT id FROM roles WHERE name = 'user'"));
        if (roles.length) {
          await dbRun(
            db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING'),
            AGENT_USER_ID,
            roles[0].id
          );
        }

        await dbRun(
          db.prepare('INSERT INTO members (id, name, color, user_id) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING'),
          AGENT_MEMBER_ID,
          AGENT_DEFAULT_NAME,
          AGENT_DEFAULT_COLOR,
          AGENT_USER_ID
        );
        console.log('✅ Migration 15: AI Agent account seeded');
      }

      console.log('✅ Migration 15: AI agent platform tables and settings ready');
    }
  },
  {
    version: 16,
    name: 'add_ai_provider_setting',
    description: 'Add AI_PROVIDER for multi-provider LLM configuration (OpenAI, Anthropic, Ollama, …)',
    up: async (db) => {
      const { settings: settingsQueries } = await import('../utils/sqlManager/index.js');
      const existing = await settingsQueries.getSettingByKey(db, 'AI_PROVIDER');
      if (!existing) {
        await settingsQueries.createSetting(db, 'AI_PROVIDER', 'openai');
      }
      console.log('✅ Migration 16: AI_PROVIDER setting ready');
    }
  },
  {
    version: 17,
    name: 'add_ai_runner_settings',
    description: 'Add push-runner settings: concurrency, runner URL/token, GitHub token',
    up: async (db) => {
      const { settings: settingsQueries } = await import('../utils/sqlManager/index.js');
      const defaults = [
        ['AI_MAX_CONCURRENT', '1'],
        ['AI_RUNNER_URL', process.env.AI_RUNNER_URL || ''],
        ['AI_RUNNER_TOKEN', '']
      ];
      for (const [key, value] of defaults) {
        const existing = await settingsQueries.getSettingByKey(db, key);
        if (!existing) {
          await settingsQueries.createSetting(db, key, value);
        }
      }
      console.log('✅ Migration 17: AI runner settings ready');
    }
  },
  {
    version: 18,
    name: 'user_github_tokens_remove_admin_pat',
    description:
      'Per-user GitHub PATs for agent git auth; clear tenant AI_GITHUB_TOKEN (moved out of admin scope)',
    up: async (db) => {
      await dbExec(
        db,
        `
        CREATE TABLE IF NOT EXISTS user_github_tokens (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          token_encrypted TEXT NOT NULL,
          token_hint TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `
      );

      const { settings: settingsQueries } = await import('../utils/sqlManager/index.js');
      try {
        await settingsQueries.updateSetting(db, 'AI_GITHUB_TOKEN', '');
      } catch {
        /* setting may not exist on all tenants */
      }

      console.log('✅ Migration 18: user_github_tokens ready; AI_GITHUB_TOKEN cleared');
    }
  }
];

const SCHEMA_MIGRATIONS_DDL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    version INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
`;

const INSERT_MIGRATION_SQL =
  'INSERT INTO schema_migrations (version, name, description) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING';

/**
 * Run all pending database migrations
 * @param {import('../config/postgresDatabase.js').default} db
 */
export const runMigrations = async (db) => {
  try {
    console.log('\n🔄 Checking for pending database migrations...');

    await dbExec(db, SCHEMA_MIGRATIONS_DDL);

    const appliedMigrations = await dbAll(db.prepare('SELECT version FROM schema_migrations ORDER BY version'));
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));

    // Migrations 1-10 have been integrated into CREATE_TABLES_SQL in database.js
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

    const missingIntegratedMigrations = integratedMigrationNames.filter(m => !appliedVersions.has(m.version));

    if (missingIntegratedMigrations.length > 0) {
      console.log(`📦 Marking ${missingIntegratedMigrations.length} integrated migration(s) as applied (already in CREATE_TABLES_SQL)...`);

      const insertStmt = db.prepare(INSERT_MIGRATION_SQL);
      for (const migration of missingIntegratedMigrations) {
        await dbRun(insertStmt, migration.version, migration.name, migration.description || '');
      }

      console.log(`✅ Marked ${missingIntegratedMigrations.length} integrated migration(s) as applied\n`);
    }

    const updatedAppliedMigrations = await dbAll(db.prepare('SELECT version FROM schema_migrations ORDER BY version'));
    const updatedAppliedVersions = new Set(updatedAppliedMigrations.map(m => m.version));

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

    for (const migration of pendingMigrations) {
      console.log(`⚙️  Applying migration ${migration.version}: ${migration.name}`);

      try {
        const migrationResult = migration.up(db);
        if (migrationResult && typeof migrationResult.then === 'function') {
          await migrationResult;
        }

        const insertStmt = db.prepare(INSERT_MIGRATION_SQL);
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
 * @param {import('../config/postgresDatabase.js').default} db
 */
export const getMigrationStatus = async (db) => {
  try {
    await dbExec(db, SCHEMA_MIGRATIONS_DDL);

    const appliedMigrations = await dbAll(db.prepare(`
      SELECT version, name, description, applied_at 
      FROM schema_migrations 
      ORDER BY version DESC
    `));

    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));

    const latestMigrationVersion = migrations.length > 0
      ? Math.max(...migrations.map(m => m.version))
      : 10;

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
