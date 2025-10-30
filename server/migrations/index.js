import crypto from 'crypto';

// Migration definitions
const migrations = [
  {
    version: 1,
    name: 'add_reporting_tables',
    description: 'Add tables for activity tracking, achievements, and reporting',
    up: (db) => {
      console.log('📊 Applying migration: Add reporting tables...');
      
      db.exec(`
        -- Activity Events Log (captures all user actions for reporting)
        CREATE TABLE IF NOT EXISTS activity_events (
          id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          user_id TEXT,
          user_name TEXT,
          user_email TEXT,
          task_id TEXT,
          task_title TEXT,
          task_ticket TEXT,
          board_id TEXT,
          board_name TEXT,
          column_id TEXT,
          column_name TEXT,
          from_column_id TEXT,
          from_column_name TEXT,
          to_column_id TEXT,
          to_column_name TEXT,
          effort_points INTEGER,
          priority_name TEXT,
          tags TEXT,
          metadata TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          period_year INTEGER,
          period_month INTEGER,
          period_week INTEGER
        );

        -- Task Snapshots (periodic snapshots for historical reporting)
        CREATE TABLE IF NOT EXISTS task_snapshots (
          id TEXT PRIMARY KEY,
          snapshot_date DATE NOT NULL,
          task_id TEXT NOT NULL,
          task_title TEXT,
          task_ticket TEXT,
          task_description TEXT,
          board_id TEXT,
          board_name TEXT,
          column_id TEXT,
          column_name TEXT,
          assignee_id TEXT,
          assignee_name TEXT,
          requester_id TEXT,
          requester_name TEXT,
          effort_points INTEGER,
          priority_name TEXT,
          tags TEXT,
          watchers TEXT,
          collaborators TEXT,
          status TEXT,
          is_deleted INTEGER DEFAULT 0,
          created_at DATETIME,
          completed_at DATETIME,
          UNIQUE(task_id, snapshot_date)
        );

        -- User Achievements (gamification badges and rewards)
        CREATE TABLE IF NOT EXISTS user_achievements (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          user_name TEXT,
          achievement_type TEXT NOT NULL,
          badge_name TEXT NOT NULL,
          badge_icon TEXT,
          badge_color TEXT,
          points_earned INTEGER DEFAULT 0,
          earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          period_year INTEGER,
          period_month INTEGER
        );

        -- User Points Summary (aggregated points per user per period)
        CREATE TABLE IF NOT EXISTS user_points (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          user_name TEXT,
          total_points INTEGER DEFAULT 0,
          tasks_completed INTEGER DEFAULT 0,
          total_effort_completed INTEGER DEFAULT 0,
          comments_added INTEGER DEFAULT 0,
          tasks_created INTEGER DEFAULT 0,
          collaborations INTEGER DEFAULT 0,
          period_year INTEGER,
          period_month INTEGER,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, period_year, period_month)
        );

        -- Planning Periods (sprints, quarters, etc. for burndown reports)
        CREATE TABLE IF NOT EXISTS planning_periods (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          is_active INTEGER DEFAULT 0,
          description TEXT,
          planned_tasks INTEGER DEFAULT 0,
          planned_effort INTEGER DEFAULT 0,
          board_id TEXT,
          created_by TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (board_id) REFERENCES boards(id) ON DELETE CASCADE,
          FOREIGN KEY (created_by) REFERENCES users(id)
        );

        -- Indexes for Performance
        CREATE INDEX IF NOT EXISTS idx_activity_events_user_id ON activity_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_activity_events_task_id ON activity_events(task_id);
        CREATE INDEX IF NOT EXISTS idx_activity_events_event_type ON activity_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_activity_events_period ON activity_events(period_year, period_month);
        CREATE INDEX IF NOT EXISTS idx_activity_events_created_at ON activity_events(created_at);
        
        CREATE INDEX IF NOT EXISTS idx_task_snapshots_task_id ON task_snapshots(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_snapshots_date ON task_snapshots(snapshot_date);
        CREATE INDEX IF NOT EXISTS idx_task_snapshots_board ON task_snapshots(board_id);
        CREATE INDEX IF NOT EXISTS idx_task_snapshots_status ON task_snapshots(status);
        
        CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id ON user_achievements(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_achievements_period ON user_achievements(period_year, period_month);
        CREATE INDEX IF NOT EXISTS idx_user_achievements_type ON user_achievements(achievement_type);
        
        CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON user_points(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_points_period ON user_points(period_year, period_month);
        
        CREATE INDEX IF NOT EXISTS idx_planning_periods_dates ON planning_periods(start_date, end_date);
        CREATE INDEX IF NOT EXISTS idx_planning_periods_board ON planning_periods(board_id);
      `);
      
      console.log('✅ Reporting tables created successfully');
    },
    down: (db) => {
      // Rollback migration (for development/testing)
      console.log('⚠️  Rolling back reporting tables...');
      db.exec(`
        DROP INDEX IF EXISTS idx_planning_periods_board;
        DROP INDEX IF EXISTS idx_planning_periods_dates;
        DROP INDEX IF EXISTS idx_user_points_period;
        DROP INDEX IF EXISTS idx_user_points_user_id;
        DROP INDEX IF EXISTS idx_user_achievements_type;
        DROP INDEX IF EXISTS idx_user_achievements_period;
        DROP INDEX IF EXISTS idx_user_achievements_user_id;
        DROP INDEX IF EXISTS idx_task_snapshots_status;
        DROP INDEX IF EXISTS idx_task_snapshots_board;
        DROP INDEX IF EXISTS idx_task_snapshots_date;
        DROP INDEX IF EXISTS idx_task_snapshots_task_id;
        DROP INDEX IF EXISTS idx_activity_events_created_at;
        DROP INDEX IF EXISTS idx_activity_events_period;
        DROP INDEX IF EXISTS idx_activity_events_event_type;
        DROP INDEX IF EXISTS idx_activity_events_task_id;
        DROP INDEX IF EXISTS idx_activity_events_user_id;
        
        DROP TABLE IF EXISTS planning_periods;
        DROP TABLE IF EXISTS user_points;
        DROP TABLE IF EXISTS user_achievements;
        DROP TABLE IF EXISTS task_snapshots;
        DROP TABLE IF EXISTS activity_events;
      `);
      console.log('✅ Reporting tables rolled back');
    }
  },
  {
    version: 2,
    name: 'add_sprint_columns',
    description: 'Add is_active, description, and updated_at columns to planning_periods table',
    up: (db) => {
      console.log('📊 Applying migration: Add sprint management columns...');
      
      try {
        // Check if columns already exist
        const tableInfo = db.prepare('PRAGMA table_info(planning_periods)').all();
        const columnNames = tableInfo.map(col => col.name);
        
        if (!columnNames.includes('is_active')) {
          db.exec('ALTER TABLE planning_periods ADD COLUMN is_active INTEGER DEFAULT 0');
          console.log('✅ Added is_active column');
        }
        
        if (!columnNames.includes('description')) {
          db.exec('ALTER TABLE planning_periods ADD COLUMN description TEXT');
          console.log('✅ Added description column');
        }
        
        if (!columnNames.includes('updated_at')) {
          db.exec('ALTER TABLE planning_periods ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
          console.log('✅ Added updated_at column');
        }
        
        console.log('✅ Migration completed: Add sprint management columns');
      } catch (error) {
        console.error('❌ Migration error:', error);
        throw error;
      }
    },
    down: (db) => {
      // SQLite doesn't support DROP COLUMN easily, so we'd need to recreate the table
      console.log('⚠️  Rollback not supported for this migration (SQLite limitation)');
    }
  },
  {
    version: 3,
    name: 'add_task_snapshots_columns',
    description: 'Add missing columns to task_snapshots table for reporting',
    up: (db) => {
      console.log('📊 Applying migration: Add task_snapshots columns...');
      
      try {
        // Check if columns already exist
        const tableInfo = db.prepare('PRAGMA table_info(task_snapshots)').all();
        const columnNames = tableInfo.map(col => col.name);
        
        if (!columnNames.includes('is_completed')) {
          db.exec('ALTER TABLE task_snapshots ADD COLUMN is_completed INTEGER DEFAULT 0');
          console.log('✅ Added is_completed column');
        }
        
        if (!columnNames.includes('start_date')) {
          db.exec('ALTER TABLE task_snapshots ADD COLUMN start_date DATE');
          console.log('✅ Added start_date column');
        }
        
        if (!columnNames.includes('due_date')) {
          db.exec('ALTER TABLE task_snapshots ADD COLUMN due_date DATE');
          console.log('✅ Added due_date column');
        }
        
        if (!columnNames.includes('watchers_count')) {
          db.exec('ALTER TABLE task_snapshots ADD COLUMN watchers_count INTEGER DEFAULT 0');
          console.log('✅ Added watchers_count column');
        }
        
        if (!columnNames.includes('collaborators_count')) {
          db.exec('ALTER TABLE task_snapshots ADD COLUMN collaborators_count INTEGER DEFAULT 0');
          console.log('✅ Added collaborators_count column');
        }
        
        if (!columnNames.includes('updated_at')) {
          db.exec('ALTER TABLE task_snapshots ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
          console.log('✅ Added updated_at column');
        }
        
        console.log('✅ Migration completed: Add task_snapshots columns');
      } catch (error) {
        console.error('❌ Migration error:', error);
        throw error;
      }
    },
    down: (db) => {
      console.log('⚠️  Rollback not supported for this migration (SQLite limitation)');
    }
  },
  {
    version: 4,
    name: 'add_badges_table',
    description: 'Create badges master table with predefined achievements',
    up: (db) => {
      console.log('🏆 Applying migration: Add badges table...');
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS badges (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          icon TEXT NOT NULL,
          color TEXT NOT NULL,
          tier TEXT NOT NULL,
          condition_type TEXT NOT NULL,
          condition_value INTEGER NOT NULL,
          points_reward INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_badges_tier ON badges(tier);
        CREATE INDEX IF NOT EXISTS idx_badges_condition_type ON badges(condition_type);
      `);
      
      // Insert predefined badges
      const badges = [
        // Task Creation Badges
        { id: 'first-task', name: 'First Task', description: 'Created your first task', icon: '🎯', color: 'blue', tier: 'bronze', condition_type: 'tasks_created', condition_value: 1, points_reward: 10 },
        { id: 'task-creator', name: 'Task Creator', description: 'Created 10 tasks', icon: '📝', color: 'blue', tier: 'silver', condition_type: 'tasks_created', condition_value: 10, points_reward: 50 },
        { id: 'task-master', name: 'Task Master', description: 'Created 50 tasks', icon: '📋', color: 'blue', tier: 'gold', condition_type: 'tasks_created', condition_value: 50, points_reward: 200 },
        { id: 'task-legend', name: 'Task Legend', description: 'Created 100 tasks', icon: '⭐', color: 'purple', tier: 'platinum', condition_type: 'tasks_created', condition_value: 100, points_reward: 500 },
        
        // Task Completion Badges
        { id: 'getting-started', name: 'Getting Started', description: 'Completed your first task', icon: '✅', color: 'green', tier: 'bronze', condition_type: 'tasks_completed', condition_value: 1, points_reward: 15 },
        { id: 'productive', name: 'Productive', description: 'Completed 10 tasks', icon: '💪', color: 'green', tier: 'silver', condition_type: 'tasks_completed', condition_value: 10, points_reward: 75 },
        { id: 'achiever', name: 'Achiever', description: 'Completed 50 tasks', icon: '🏆', color: 'green', tier: 'gold', condition_type: 'tasks_completed', condition_value: 50, points_reward: 300 },
        { id: 'champion', name: 'Champion', description: 'Completed 100 tasks', icon: '👑', color: 'purple', tier: 'platinum', condition_type: 'tasks_completed', condition_value: 100, points_reward: 750 },
        { id: 'unstoppable', name: 'Unstoppable', description: 'Completed 250 tasks', icon: '🚀', color: 'red', tier: 'diamond', condition_type: 'tasks_completed', condition_value: 250, points_reward: 2000 },
        
        // Collaboration Badges
        { id: 'team-player', name: 'Team Player', description: 'Added 5 collaborators to tasks', icon: '🤝', color: 'orange', tier: 'bronze', condition_type: 'collaborations', condition_value: 5, points_reward: 25 },
        { id: 'collaborator', name: 'Collaborator', description: 'Added 25 collaborators to tasks', icon: '👥', color: 'orange', tier: 'silver', condition_type: 'collaborations', condition_value: 25, points_reward: 100 },
        { id: 'team-builder', name: 'Team Builder', description: 'Added 50 collaborators to tasks', icon: '🌟', color: 'orange', tier: 'gold', condition_type: 'collaborations', condition_value: 50, points_reward: 250 },
        
        // Communication Badges
        { id: 'communicator', name: 'Communicator', description: 'Added 10 comments', icon: '💬', color: 'cyan', tier: 'bronze', condition_type: 'comments_added', condition_value: 10, points_reward: 20 },
        { id: 'conversationalist', name: 'Conversationalist', description: 'Added 50 comments', icon: '💭', color: 'cyan', tier: 'silver', condition_type: 'comments_added', condition_value: 50, points_reward: 100 },
        { id: 'commentator', name: 'Commentator', description: 'Added 100 comments', icon: '📣', color: 'cyan', tier: 'gold', condition_type: 'comments_added', condition_value: 100, points_reward: 200 },
        
        // Effort Badges
        { id: 'hard-worker', name: 'Hard Worker', description: 'Completed 50 effort points', icon: '💼', color: 'indigo', tier: 'bronze', condition_type: 'total_effort_completed', condition_value: 50, points_reward: 75 },
        { id: 'powerhouse', name: 'Powerhouse', description: 'Completed 200 effort points', icon: '⚡', color: 'indigo', tier: 'silver', condition_type: 'total_effort_completed', condition_value: 200, points_reward: 250 },
        { id: 'juggernaut', name: 'Juggernaut', description: 'Completed 500 effort points', icon: '🔥', color: 'indigo', tier: 'gold', condition_type: 'total_effort_completed', condition_value: 500, points_reward: 600 },
        
        // Watcher Badges
        { id: 'observer', name: 'Observer', description: 'Added 10 watchers to tasks', icon: '👀', color: 'gray', tier: 'bronze', condition_type: 'watchers_added', condition_value: 10, points_reward: 15 },
        { id: 'watchful', name: 'Watchful', description: 'Added 50 watchers to tasks', icon: '🔍', color: 'gray', tier: 'silver', condition_type: 'watchers_added', condition_value: 50, points_reward: 60 },
        
        // Points Milestones
        { id: 'point-getter', name: 'Point Getter', description: 'Earned 100 points', icon: '🎖️', color: 'yellow', tier: 'bronze', condition_type: 'total_points', condition_value: 100, points_reward: 0 },
        { id: 'point-collector', name: 'Point Collector', description: 'Earned 500 points', icon: '🏅', color: 'yellow', tier: 'silver', condition_type: 'total_points', condition_value: 500, points_reward: 0 },
        { id: 'point-master', name: 'Point Master', description: 'Earned 1000 points', icon: '🥇', color: 'yellow', tier: 'gold', condition_type: 'total_points', condition_value: 1000, points_reward: 0 },
        { id: 'point-legend', name: 'Point Legend', description: 'Earned 2500 points', icon: '💎', color: 'purple', tier: 'platinum', condition_type: 'total_points', condition_value: 2500, points_reward: 0 },
      ];
      
      const insertBadge = db.prepare(`
        INSERT OR IGNORE INTO badges (id, name, description, icon, color, tier, condition_type, condition_value, points_reward)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      badges.forEach(badge => {
        insertBadge.run(
          badge.id,
          badge.name,
          badge.description,
          badge.icon,
          badge.color,
          badge.tier,
          badge.condition_type,
          badge.condition_value,
          badge.points_reward
        );
      });
      
      console.log(`✅ Badges table created with ${badges.length} predefined achievements`);
    },
    down: (db) => {
      db.exec('DROP TABLE IF EXISTS badges');
      console.log('✅ Badges table dropped');
    }
  },
  {
    version: 5,
    name: 'add_watchers_added_column',
    description: 'Add watchers_added column to user_points table',
    up: (db) => {
      console.log('📊 Applying migration: Add watchers_added column...');
      
      try {
        const tableInfo = db.prepare('PRAGMA table_info(user_points)').all();
        const columnNames = tableInfo.map(col => col.name);
        
        if (!columnNames.includes('watchers_added')) {
          db.exec('ALTER TABLE user_points ADD COLUMN watchers_added INTEGER DEFAULT 0');
          console.log('✅ Added watchers_added column');
        } else {
          console.log('ℹ️  watchers_added column already exists');
        }
        
        console.log('✅ Migration completed: Add watchers_added column');
      } catch (error) {
        console.error('❌ Migration error:', error);
        throw error;
      }
    },
    down: (db) => {
      console.log('⚠️  Rollback not supported for this migration (SQLite limitation)');
    }
  },
  {
    version: 6,
    name: 'add_badge_id_column',
    description: 'Add badge_id column to user_achievements table',
    up: (db) => {
      console.log('📊 Applying migration: Add badge_id column...');
      
      try {
        const tableInfo = db.prepare('PRAGMA table_info(user_achievements)').all();
        const columnNames = tableInfo.map(col => col.name);
        
        if (!columnNames.includes('badge_id')) {
          db.exec('ALTER TABLE user_achievements ADD COLUMN badge_id TEXT');
          console.log('✅ Added badge_id column');
          
          // Also add an index for badge_id
          db.exec('CREATE INDEX IF NOT EXISTS idx_user_achievements_badge_id ON user_achievements(badge_id)');
          console.log('✅ Added index on badge_id');
        } else {
          console.log('ℹ️  badge_id column already exists');
        }
        
        console.log('✅ Migration completed: Add badge_id column');
      } catch (error) {
        console.error('❌ Migration error:', error);
        throw error;
      }
    },
    down: (db) => {
      console.log('⚠️  Rollback not supported for this migration (SQLite limitation)');
    }
  },
  {
    version: 7,
    name: 'add_notification_queue',
    description: 'Add persistent notification queue table to survive server restarts',
    up: (db) => {
      console.log('📧 Applying migration: Add notification queue table...');
      
      try {
        db.exec(`
          -- Notification Queue Table
          -- Stores pending notifications that will be sent after a delay
          -- This ensures notifications survive server restarts
          CREATE TABLE IF NOT EXISTS notification_queue (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            task_id TEXT NOT NULL,
            notification_type TEXT NOT NULL, -- 'assignee', 'watcher', 'collaborator', 'creator'
            action TEXT NOT NULL, -- 'created', 'updated', 'assigned', etc.
            details TEXT,
            old_value TEXT,
            new_value TEXT,
            task_data TEXT, -- JSON snapshot of task data
            participants_data TEXT, -- JSON snapshot of participants
            actor_data TEXT, -- JSON snapshot of actor (person making change)
            status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
            scheduled_send_time DATETIME NOT NULL, -- When this notification should be sent
            first_change_time DATETIME NOT NULL, -- When the first change occurred
            last_change_time DATETIME NOT NULL, -- When the last change occurred
            change_count INTEGER DEFAULT 1, -- How many changes accumulated
            error_message TEXT, -- Error message if sending failed
            retry_count INTEGER DEFAULT 0, -- How many times we've tried to send
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            sent_at DATETIME, -- When the notification was successfully sent
            
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
          );
          
          -- Indexes for efficient querying
          CREATE INDEX IF NOT EXISTS idx_notification_queue_status 
            ON notification_queue(status);
          
          CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled_send 
            ON notification_queue(scheduled_send_time, status);
          
          CREATE INDEX IF NOT EXISTS idx_notification_queue_user_task 
            ON notification_queue(user_id, task_id, status);
          
          CREATE INDEX IF NOT EXISTS idx_notification_queue_created_at 
            ON notification_queue(created_at);
        `);
        
        console.log('✅ Notification queue table created successfully');
        console.log('   • Added notification_queue table');
        console.log('   • Added indexes for efficient querying');
        console.log('   • Notifications will now persist across server restarts');
        
      } catch (error) {
        console.error('❌ Failed to create notification queue table:', error);
        throw error;
      }
    },
    down: (db) => {
      console.log('⚠️  Rolling back notification queue migration...');
      try {
        db.exec(`
          DROP TABLE IF EXISTS notification_queue;
        `);
        console.log('✅ Notification queue table removed');
      } catch (error) {
        console.error('❌ Failed to remove notification queue table:', error);
        throw error;
      }
    }
  }
  // Future migrations will be added here with version: 8, 9, etc.
];

/**
 * Run all pending database migrations
 * @param {Database} db - SQLite database instance
 */
export const runMigrations = (db) => {
  try {
    console.log('\n🔄 Checking for pending database migrations...');
    
    // Ensure migrations tracking table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Get list of already applied migrations
    const appliedMigrations = db.prepare(
      'SELECT version FROM schema_migrations ORDER BY version'
    ).all();
    
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    
    // Find pending migrations (not yet applied)
    const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));
    
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
      
      // Wrap migration in transaction for safety
      const applyMigration = db.transaction(() => {
        // Run the migration's up() function
        migration.up(db);
        
        // Record that this migration was successfully applied
        db.prepare(
          'INSERT INTO schema_migrations (version, name, description) VALUES (?, ?, ?)'
        ).run(migration.version, migration.name, migration.description || '');
      });
      
      try {
        applyMigration();
        appliedCount++;
        console.log(`✅ Migration ${migration.version} applied successfully\n`);
      } catch (error) {
        console.error(`❌ Migration ${migration.version} failed:`, error.message);
        console.error('   Migration rolled back. Database state is unchanged.\n');
        throw error; // Stop on first failure
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
 * @param {Database} db - SQLite database instance
 */
export const getMigrationStatus = (db) => {
  try {
    // Ensure migrations table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    const appliedMigrations = db.prepare(`
      SELECT version, name, description, applied_at 
      FROM schema_migrations 
      ORDER BY version DESC
    `).all();
    
    const appliedVersions = new Set(appliedMigrations.map(m => m.version));
    const pendingMigrations = migrations.filter(m => !appliedVersions.has(m.version));
    
    return {
      current_version: appliedMigrations[0]?.version || 0,
      latest_version: Math.max(...migrations.map(m => m.version), 0),
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

