import Database from 'better-sqlite3';
import DatabaseProxy from '../utils/databaseProxy.js';
import PostgresDatabase from './postgresDatabase.js';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { runMigrations } from '../migrations/index.js';
import { initializeDemoData } from './demoData.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { dbExec, dbGet, dbAll, dbRun } from '../utils/dbAsync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Utility function to generate project identifiers
const generateProjectIdentifier = async (db, prefix = 'PROJ-') => {
  // Use consistent async approach for both proxy and direct DB
  const stmt = db.prepare(`
    SELECT project FROM boards 
    WHERE project IS NOT NULL AND project LIKE ?
    ORDER BY CAST(SUBSTR(project, ?) AS INTEGER) DESC 
    LIMIT 1
  `);
  const result = await dbGet(stmt, `${prefix}%`, prefix.length + 1);
  
  let nextNumber = 1;
  if (result && result.project) {
    const currentNumber = parseInt(result.project.substring(prefix.length));
    nextNumber = currentNumber + 1;
  }
  
  return `${prefix}${nextNumber.toString().padStart(5, '0')}`;
};

// Utility function to generate random passwords
const generateRandomPassword = (length = 12) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

// Function to create default letter-based avatars
// tenantId: optional tenant identifier (for multi-tenant mode)
function createLetterAvatar(letter, userId, role = 'user', tenantId = null) {
  try {
    const colors = {
      admin: '#FF6B6B',
      demo: '#4ECDC4',
      user: '#6366F1'
    };
    
    const backgroundColor = colors[role] || colors.user;
    const size = 100;
    
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${backgroundColor}"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.6}" 
            fill="white" text-anchor="middle" dominant-baseline="central" font-weight="bold">${letter}</text>
    </svg>`;
    
    const filename = `default-${role}-${letter.toLowerCase()}-${Date.now()}.svg`;
    
    // Get tenant-specific avatar directory if in multi-tenant mode
    let avatarsDir;
    if (tenantId && isMultiTenant()) {
      const basePath = process.env.DOCKER_ENV === 'true'
        ? '/app/server'
        : join(dirname(__dirname), '..');
      avatarsDir = join(basePath, 'avatars', 'tenants', tenantId);
    } else {
      // Single-tenant: backward compatible path
      avatarsDir = join(dirname(__dirname), 'avatars');
    }
    
    // Ensure avatars directory exists
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
      if (tenantId) {
        console.log(`📁 Created tenant avatar directory: ${avatarsDir}`);
      }
    }
    
    const filePath = join(avatarsDir, filename);
    fs.writeFileSync(filePath, svg);
    
    console.log(`✅ Created default ${role} avatar: ${filename}${tenantId ? ` (tenant: ${tenantId})` : ''}`);
    return `/avatars/${filename}`;
  } catch (error) {
    console.error(`❌ Error creating ${role} avatar:`, error);
    return null;
  }
}

// Check if multi-tenant mode is enabled
const isMultiTenant = () => {
  return process.env.MULTI_TENANT === 'true';
};

// Database path configuration
// Supports both single-tenant (Docker) and multi-tenant (Kubernetes) modes
export const getDbPath = (tenantId = null) => {
  const basePath = process.env.DOCKER_ENV === 'true'
    ? '/app/server/data'
    : join(dirname(__dirname), '..');
  
  // Multi-tenant mode: use tenant-specific path
  if (tenantId && isMultiTenant()) {
    return join(basePath, 'tenants', tenantId, 'kanban.db');
  }
  
  // Single-tenant mode: backward compatible path
  return join(basePath, 'kanban.db');
};

// Initialize default priorities (called before migrations to ensure they exist)
const initializeDefaultPriorities = async (db) => {
  const isProxy = db && db.constructor.name === 'DatabaseProxy';
  
  if (isProxy) {
    const prioritiesCount = await wrapQuery(db.prepare('SELECT COUNT(*) as count FROM priorities'), 'SELECT').get();
    if (prioritiesCount.count === 0) {
      const defaultPriorities = [
        { priority: 'low', color: '#10B981', position: 0, initial: 0 },
        { priority: 'medium', color: '#F59E0B', position: 1, initial: 1 },
        { priority: 'high', color: '#EF4444', position: 2, initial: 0 },
        { priority: 'urgent', color: '#DC2626', position: 3, initial: 0 }
      ];

      const priorityStmt = db.prepare('INSERT INTO priorities (priority, color, position, initial) VALUES (?, ?, ?, ?)');
      for (const p of defaultPriorities) {
        await wrapQuery(priorityStmt, 'INSERT').run(p.priority, p.color, p.position, p.initial || 0);
      }
      
      console.log('✅ Initialized default priorities (low, medium, high, urgent)');
      console.log('   Default priority: medium');
    } else {
      // Ensure at least one priority is marked as default
      const defaultPriorityCount = await wrapQuery(db.prepare('SELECT COUNT(*) as count FROM priorities WHERE initial = 1'), 'SELECT').get();
      if (defaultPriorityCount.count === 0) {
        // Set medium as default if no default exists
        const mediumPriority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE priority = ?'), 'SELECT').get('medium');
        if (mediumPriority) {
          await wrapQuery(db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?'), 'UPDATE').run(mediumPriority.id);
          console.log('✅ Set "medium" as default priority');
        } else {
          // If medium doesn't exist, set the first priority as default
          const firstPriority = await wrapQuery(db.prepare('SELECT id FROM priorities ORDER BY position ASC LIMIT 1'), 'SELECT').get();
          if (firstPriority) {
            await wrapQuery(db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?'), 'UPDATE').run(firstPriority.id);
            const priorityName = await wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(firstPriority.id);
            console.log(`✅ Set "${priorityName?.priority || 'first priority'}" as default priority`);
          }
        }
      }
    }
  } else {
    // Direct DB (better-sqlite3) - use wrapQuery for consistency
    const prioritiesCountResult = await wrapQuery(db.prepare('SELECT COUNT(*) as count FROM priorities'), 'SELECT').get();
    const prioritiesCount = prioritiesCountResult.count;
    if (prioritiesCount === 0) {
      const defaultPriorities = [
        { priority: 'low', color: '#10B981', position: 0, initial: 0 },
        { priority: 'medium', color: '#F59E0B', position: 1, initial: 1 },
        { priority: 'high', color: '#EF4444', position: 2, initial: 0 },
        { priority: 'urgent', color: '#DC2626', position: 3, initial: 0 }
      ];

      const priorityStmt = db.prepare('INSERT INTO priorities (priority, color, position, initial) VALUES (?, ?, ?, ?)');
      for (const p of defaultPriorities) {
        await wrapQuery(priorityStmt, 'INSERT').run(p.priority, p.color, p.position, p.initial || 0);
      }
      
      console.log('✅ Initialized default priorities (low, medium, high, urgent)');
      console.log('   Default priority: medium');
    } else {
      // Ensure at least one priority is marked as default
      const defaultPriorityCountResult = await wrapQuery(db.prepare('SELECT COUNT(*) as count FROM priorities WHERE initial = 1'), 'SELECT').get();
      const defaultPriorityCount = defaultPriorityCountResult.count;
      if (defaultPriorityCount === 0) {
        // Set medium as default if no default exists
        const mediumPriority = await wrapQuery(db.prepare('SELECT id FROM priorities WHERE priority = ?'), 'SELECT').get('medium');
        if (mediumPriority) {
          await wrapQuery(db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?'), 'UPDATE').run(mediumPriority.id);
          console.log('✅ Set "medium" as default priority');
        } else {
          // If medium doesn't exist, set the first priority as default
          const firstPriority = await wrapQuery(db.prepare('SELECT id FROM priorities ORDER BY position ASC LIMIT 1'), 'SELECT').get();
          if (firstPriority) {
            await wrapQuery(db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?'), 'UPDATE').run(firstPriority.id);
            const priorityNameResult = await wrapQuery(db.prepare('SELECT priority FROM priorities WHERE id = ?'), 'SELECT').get(firstPriority.id);
            const priorityName = priorityNameResult?.priority;
            console.log(`✅ Set "${priorityName || 'first priority'}" as default priority`);
          }
        }
      }
    }
  }
};
// Convert SQLite SQL to PostgreSQL SQL
function convertSqliteToPostgres(sql) {
  let pgSql = sql;
  
  // Replace SQLite-specific syntax with PostgreSQL
  pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  pgSql = pgSql.replace(/AUTOINCREMENT/gi, '');
  pgSql = pgSql.replace(/INTEGER PRIMARY KEY/gi, 'SERIAL PRIMARY KEY');
  
  // CRITICAL: Replace DATETIME with TIMESTAMPTZ (timestamp with timezone)
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
  pgSql = pgSql.replace(/used BOOLEAN DEFAULT 0/gi, 'used BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/shared BOOLEAN DEFAULT 0/gi, 'shared BOOLEAN DEFAULT false');
  pgSql = pgSql.replace(/force_logout INTEGER DEFAULT 0/gi, 'force_logout BOOLEAN DEFAULT false');
  
  // Also handle INTEGER columns that should be BOOLEAN (without DEFAULT)
  pgSql = pgSql.replace(/\bis_deleted\s+INTEGER\b/gi, 'is_deleted BOOLEAN');
  pgSql = pgSql.replace(/\bis_completed\s+INTEGER\b/gi, 'is_completed BOOLEAN');
  
  // Replace SQLite datetime functions
  pgSql = pgSql.replace(/datetime\(/gi, 'to_timestamp(');
  
  return pgSql;
}

const CREATE_TABLES_SQL = `
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      avatar_path TEXT,
      auth_provider TEXT DEFAULT 'local',
      google_avatar_url TEXT,
      is_active INTEGER DEFAULT 1,
      force_logout INTEGER DEFAULT 0,
      deactivated_at DATETIME NULL,
      deactivated_by TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_invitations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      UNIQUE(user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS boards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project TEXT,
      position INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS columns (
      id TEXT PRIMARY KEY,
      boardId TEXT NOT NULL,
      title TEXT NOT NULL,
      position INTEGER DEFAULT 0,
      is_finished BOOLEAN DEFAULT 0,
      is_archived BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      position INTEGER DEFAULT 0,
      title TEXT NOT NULL,
      description TEXT,
      ticket TEXT,
      memberId TEXT NOT NULL,
      requesterId TEXT,
      startDate TEXT NOT NULL,
      dueDate TEXT,
      effort INTEGER NOT NULL,
      priority TEXT NOT NULL,
      priority_id INTEGER,
      sprint_id TEXT NULL,
      columnId TEXT NOT NULL,
      boardId TEXT,
      pre_boardId TEXT,
      pre_columnId TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (memberId) REFERENCES members(id),
      FOREIGN KEY (requesterId) REFERENCES members(id),
      FOREIGN KEY (columnId) REFERENCES columns(id) ON DELETE CASCADE,
      FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL,
      text TEXT NOT NULL,
      authorId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (authorId) REFERENCES members(id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      taskId TEXT,
      commentId TEXT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (commentId) REFERENCES comments(id) ON DELETE CASCADE,
      CHECK ((taskId IS NOT NULL AND commentId IS NULL) OR (taskId IS NULL AND commentId IS NOT NULL))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tag TEXT NOT NULL UNIQUE,
      description TEXT,
      color TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS priorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      priority TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      initial INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filterName TEXT NOT NULL,
      userId TEXT NOT NULL,
      shared BOOLEAN DEFAULT 0,
      textFilter TEXT,
      dateFromFilter TEXT,
      dateToFilter TEXT,
      dueDateFromFilter TEXT,
      dueDateToFilter TEXT,
      memberFilters TEXT,
      priorityFilters TEXT,
      tagFilters TEXT,
      projectFilter TEXT,
      taskFilter TEXT,
      boardColumnFilter TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId TEXT NOT NULL,
      tagId INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(taskId, tagId)
    );

    CREATE TABLE IF NOT EXISTS watchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
      UNIQUE(taskId, memberId)
    );

    CREATE TABLE IF NOT EXISTS collaborators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (taskId) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (memberId) REFERENCES members(id) ON DELETE CASCADE,
      UNIQUE(taskId, memberId)
    );

    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      roleId INTEGER,
      action TEXT NOT NULL,
      taskId TEXT,
      columnId TEXT,
      boardId TEXT,
      tagId INTEGER,
      commentId TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(userId, setting_key)
    );

    CREATE TABLE IF NOT EXISTS task_rels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      relationship TEXT NOT NULL CHECK(relationship IN ('child', 'parent', 'related')),
      to_task_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (to_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      UNIQUE(task_id, relationship, to_task_id)
    );

    CREATE TABLE IF NOT EXISTS license_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT UNIQUE NOT NULL,
      setting_value TEXT NOT NULL,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_watchers_taskId ON watchers(taskId);
    CREATE INDEX IF NOT EXISTS idx_watchers_memberId ON watchers(memberId);
    CREATE INDEX IF NOT EXISTS idx_collaborators_taskId ON collaborators(taskId);
    CREATE INDEX IF NOT EXISTS idx_collaborators_memberId ON collaborators(memberId);
    CREATE INDEX IF NOT EXISTS idx_user_settings_userId ON user_settings(userId);
    CREATE INDEX IF NOT EXISTS idx_task_rels_task_id ON task_rels(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_rels_to_task_id ON task_rels(to_task_id);
    CREATE INDEX IF NOT EXISTS idx_task_rels_relationship ON task_rels(relationship);
    
    -- Additional indexes for frequently queried columns
    -- task_tags table (used in JOINs and WHERE clauses)
    CREATE INDEX IF NOT EXISTS idx_task_tags_taskId ON task_tags(taskId);
    CREATE INDEX IF NOT EXISTS idx_task_tags_tagId ON task_tags(tagId);
    
    -- comments table (used in JOINs and WHERE clauses)
    CREATE INDEX IF NOT EXISTS idx_comments_taskId ON comments(taskId);
    CREATE INDEX IF NOT EXISTS idx_comments_authorId ON comments(authorId);
    
    -- attachments table (used in WHERE clauses)
    CREATE INDEX IF NOT EXISTS idx_attachments_taskId ON attachments(taskId);
    CREATE INDEX IF NOT EXISTS idx_attachments_commentId ON attachments(commentId);
    
    -- tasks table (used in WHERE clauses and JOINs)
    CREATE INDEX IF NOT EXISTS idx_tasks_columnId ON tasks(columnId);
    CREATE INDEX IF NOT EXISTS idx_tasks_boardId ON tasks(boardId);
    CREATE INDEX IF NOT EXISTS idx_tasks_memberId ON tasks(memberId);
    CREATE INDEX IF NOT EXISTS idx_tasks_requesterId ON tasks(requesterId);
    -- Note: idx_tasks_priority_id is created by migration 10 (add_priority_id_to_tasks)
    
    -- columns table (used in WHERE clauses)
    CREATE INDEX IF NOT EXISTS idx_columns_boardId ON columns(boardId);
    CREATE INDEX IF NOT EXISTS idx_columns_is_archived ON columns(is_archived);
    CREATE INDEX IF NOT EXISTS idx_columns_is_finished ON columns(is_finished);
    
    -- activity table (used in WHERE clauses)
    CREATE INDEX IF NOT EXISTS idx_activity_userId ON activity(userId);
    CREATE INDEX IF NOT EXISTS idx_activity_taskId ON activity(taskId);
    CREATE INDEX IF NOT EXISTS idx_activity_boardId ON activity(boardId);
    
    -- members table (used in JOINs)
    CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
    
    -- user_roles table (used in JOINs)
    CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);
    
    -- views table (used in WHERE clauses)
    CREATE INDEX IF NOT EXISTS idx_views_userId ON views(userId);
    
    -- Migration 1: Reporting tables (integrated into base schema)
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
      is_completed INTEGER DEFAULT 0,
      start_date DATE,
      due_date DATE,
      watchers_count INTEGER DEFAULT 0,
      collaborators_count INTEGER DEFAULT 0,
      created_at DATETIME,
      completed_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_id, snapshot_date)
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT,
      achievement_type TEXT NOT NULL,
      badge_name TEXT NOT NULL,
      badge_id TEXT,
      badge_icon TEXT,
      badge_color TEXT,
      points_earned INTEGER DEFAULT 0,
      earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      period_year INTEGER,
      period_month INTEGER
    );

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
      watchers_added INTEGER DEFAULT 0,
      period_year INTEGER,
      period_month INTEGER,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, period_year, period_month)
    );

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

    -- Migration 4: Badges table
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

    -- Migration 7: Notification queue
    CREATE TABLE IF NOT EXISTS notification_queue (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      old_value TEXT,
      new_value TEXT,
      task_data TEXT,
      participants_data TEXT,
      actor_data TEXT,
      status TEXT DEFAULT 'pending',
      scheduled_send_time DATETIME NOT NULL,
      first_change_time DATETIME NOT NULL,
      last_change_time DATETIME NOT NULL,
      change_count INTEGER DEFAULT 1,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    -- Migration 1: Indexes for reporting tables
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
    CREATE INDEX IF NOT EXISTS idx_user_achievements_badge_id ON user_achievements(badge_id);
    
    CREATE INDEX IF NOT EXISTS idx_user_points_user_id ON user_points(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_points_period ON user_points(period_year, period_month);
    
    CREATE INDEX IF NOT EXISTS idx_planning_periods_dates ON planning_periods(start_date, end_date);
    CREATE INDEX IF NOT EXISTS idx_planning_periods_board ON planning_periods(board_id);
    
    CREATE INDEX IF NOT EXISTS idx_badges_tier ON badges(tier);
    CREATE INDEX IF NOT EXISTS idx_badges_condition_type ON badges(condition_type);
    
    CREATE INDEX IF NOT EXISTS idx_notification_queue_status ON notification_queue(status);
    CREATE INDEX IF NOT EXISTS idx_notification_queue_scheduled_send ON notification_queue(scheduled_send_time, status);
    CREATE INDEX IF NOT EXISTS idx_notification_queue_user_task ON notification_queue(user_id, task_id, status);
    CREATE INDEX IF NOT EXISTS idx_notification_queue_created_at ON notification_queue(created_at);
    
    -- Migration 8: Performance indexes on tasks
    CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON tasks(startDate);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(dueDate);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_dates_board ON tasks(startDate, dueDate, boardId);
    CREATE INDEX IF NOT EXISTS idx_tasks_board_column ON tasks(boardId, columnId);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority_id ON tasks(priority_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_sprint_id ON tasks(sprint_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_board_sprint ON tasks(boardId, sprint_id);
    
    -- Migration tracking table
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`;

// Create database tables (async for proxy support and PostgreSQL)
const createTables = async (db) => {
  const isProxy = db && db.constructor.name === 'DatabaseProxy';
  const isPostgres = db && db.constructor.name === 'PostgresDatabase';
  
  // Convert SQL for PostgreSQL
  const sql = isPostgres ? convertSqliteToPostgres(CREATE_TABLES_SQL) : CREATE_TABLES_SQL;
  
  // Proxy service handles expected SQLite errors (duplicate column, already exists, etc.)
  // at the service level, so we can just execute the SQL directly
  // PostgreSQL also handles IF NOT EXISTS gracefully
  await dbExec(db, sql);
};

// Initialize default data
// tenantId: optional tenant identifier (for multi-tenant mode)
// Now async to support proxy mode
const initializeDefaultData = async (db, tenantId = null) => {
  const isProxy = db && db.constructor.name === 'DatabaseProxy';
  
  // Always ensure UPLOAD_FILETYPES is initialized (even if roles already exist)
  // This is important for multi-tenant databases that may have been created before this setting was added
  const uploadFileTypes = await wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('UPLOAD_FILETYPES');
  if (!uploadFileTypes || !uploadFileTypes.value || uploadFileTypes.value === '{}') {
    // Initialize UPLOAD_FILETYPES with default file types
    const defaultFileTypes = JSON.stringify({
      // Images
      'image/jpeg': true,
      'image/png': true,
      'image/gif': true,
      'image/webp': true,
      'image/svg+xml': true,
      'image/bmp': true,
      'image/tiff': true,
      'image/ico': true,
      'image/vnd.microsoft.icon': true, // .ico files (alternative MIME type)
      'image/heic': true,
      'image/heif': true,
      'image/avif': true,
      // Videos
      'video/mp4': true,
      'video/webm': true,
      'video/ogg': true,
      'video/quicktime': true,
      'video/x-msvideo': true,
      'video/x-ms-wmv': true,
      'video/x-matroska': true,
      'video/mpeg': true,
      'video/3gpp': true,
      // Documents
      'application/pdf': true,
      'text/plain': true,
      'text/csv': true,
      // Office Documents
      'application/msword': true,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
      'application/vnd.ms-excel': true,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
      'application/vnd.ms-powerpoint': true,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
      // Archives
      'application/zip': true,
      'application/x-rar-compressed': true,
      'application/x-7z-compressed': true,
      // Code Files
      'text/javascript': true,
      'text/css': true,
      'text/html': true,
      'application/json': true
    });
    const uploadFileTypesStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
    await dbRun(uploadFileTypesStmt, 'UPLOAD_FILETYPES', defaultFileTypes);
    console.log('✅ Initialized UPLOAD_FILETYPES with default file types (including GIF)');
  }
  
  // Initialize authentication data if no roles exist
  const rolesCountResult = await wrapQuery(db.prepare('SELECT COUNT(*) as count FROM roles'), 'SELECT').get();
  const rolesCount = rolesCountResult.count;
  if (rolesCount === 0) {
    // Generate random password for admin user (only when creating users)
    const adminPassword = generateRandomPassword(12);
    
    // Store password in settings
    await wrapQuery(db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'), 'INSERT').run('ADMIN_PASSWORD', adminPassword);
    
    // Insert default roles
    await wrapQuery(db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)'), 'INSERT').run('admin', 'Administrator role');
    await wrapQuery(db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)'), 'INSERT').run('user', 'Regular user role');

    // Create default admin user with random password
    const adminId = crypto.randomUUID();
    const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);
    
    // Create admin avatar (with tenant-specific path if in multi-tenant mode)
    const adminAvatarPath = createLetterAvatar('A', adminId, 'admin', tenantId);
    
    await wrapQuery(db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path) 
      VALUES (?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(adminId, 'admin@kanban.local', adminPasswordHash, 'Admin', 'User', adminAvatarPath);

    // Assign admin role to default user
    const adminRoleResult = await wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get('admin');
    const adminRoleId = adminRoleResult.id;
    await wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(adminId, adminRoleId);

    // Log admin credentials for easy access
    console.log('');
    console.log('🔐 ===========================================');
    console.log('   ADMIN ACCOUNT CREDENTIALS');
    console.log('===========================================');
    console.log(`   Email: admin@kanban.local`);
    console.log(`   Password: ${adminPassword}`);
    console.log('===========================================');
    console.log('');

    // Initialize default settings
    const defaultSettings = [
      ['APP_VERSION', '0'],
      ['ADMIN_PORTAL_URL', 'https://admin.ezkan.cloud'],
      ['WEBSITE_URL', 'https://ezkan.cloud'],
      ['SITE_NAME', 'Easy Kanban'],
      ['SITE_URL', '/'],
      ['MAIL_ENABLED', 'false'],
      ['MAIL_MANAGED', 'false'], // Default to false, will be set to true for licensed instances
      // SMTP settings (replaces old MAIL_* settings)
      ['SMTP_HOST', ''],
      ['SMTP_PORT', '587'],
      ['SMTP_USERNAME', ''],
      ['SMTP_PASSWORD', ''],
      ['SMTP_FROM_EMAIL', ''],
      ['SMTP_FROM_NAME', 'Easy Kanban'],
      ['SMTP_SECURE', 'tls'],
      ['GOOGLE_CLIENT_ID', ''],
      ['GOOGLE_CLIENT_SECRET', ''],
      ['GOOGLE_SSO_DEBUG', 'false'],
      // Admin-configurable user preference defaults
      ['DEFAULT_VIEW_MODE', 'kanban'], // Default view mode for new users
      ['DEFAULT_TASK_VIEW_MODE', 'expand'], // Default task view mode for new users
      ['DEFAULT_ACTIVITY_FEED_POSITION', '{"x": 10, "y": 220}'], // Default activity feed position
      ['DEFAULT_ACTIVITY_FEED_WIDTH', '160'], // Default activity feed width
      ['DEFAULT_ACTIVITY_FEED_HEIGHT', '400'], // Default activity feed height
      // Project and task identification settings
      ['DEFAULT_PROJ_PREFIX', 'PROJ-'], // Default project prefix
      ['DEFAULT_TASK_PREFIX', 'TASK-'], // Default task prefix
      ['DEFAULT_FINISHED_COLUMN_NAMES', '["Done","Terminé","Completed","Complété", "Finished","Fini"]'], // Default finished column names
      ['APP_LANGUAGE', 'EN'], // Default application language (EN or FR)
      ['SITE_OPENS_NEW_TAB', 'true'], // Default to opening links in new tab (matches current behavior)
      ['HIGHLIGHT_OVERDUE_TASKS', 'true'], // Highlight overdue tasks in light red
      ['STORAGE_LIMIT', '5368709120'], // 5GB storage limit in bytes (5 * 1024^3)
      ['STORAGE_USED', '0'], // Current storage usage in bytes
      ['UPLOAD_MAX_FILESIZE', '10485760'], // 10MB max file size in bytes (10 * 1024^2)
      ['UPLOAD_LIMITS_ENFORCED', 'true'], // Enable/disable file upload restrictions (default true)
      ['NOTIFICATION_DELAY', '30'], // Email notification delay in minutes (default 30)
      ['NOTIFICATION_DEFAULTS', JSON.stringify({
        newTaskAssigned: true,
        myTaskUpdated: true,
        watchedTaskUpdated: true,
        addedAsCollaborator: true,
        collaboratingTaskUpdated: true,
        commentAdded: true,
        requesterTaskCreated: true,
        requesterTaskUpdated: true
      })], // Global notification defaults
      // Reporting & Analytics Settings
      ['REPORTS_ENABLED', 'true'], // Enable/disable Reports module
      ['REPORTS_GAMIFICATION_ENABLED', 'true'], // Enable points and gamification
      ['REPORTS_LEADERBOARD_ENABLED', 'true'], // Enable leaderboard rankings
      ['REPORTS_ACHIEVEMENTS_ENABLED', 'true'], // Enable achievement badges
      ['REPORTS_SNAPSHOT_FREQUENCY', 'daily'], // Snapshot frequency: daily, weekly, or manual
      ['REPORTS_RETENTION_DAYS', '730'], // Data retention in days (2 years default)
      ['REPORTS_VISIBLE_TO', 'all'], // Who can see reports: all, admin, members
      ['REPORTS_POINTS_TASK_CREATED', '5'], // Points for creating a task
      ['REPORTS_POINTS_TASK_COMPLETED', '10'], // Points for completing a task
      ['REPORTS_POINTS_TASK_MOVED', '2'], // Points for moving a task
      ['REPORTS_POINTS_TASK_UPDATED', '1'], // Points for updating a task
      ['REPORTS_POINTS_COMMENT_ADDED', '3'], // Points for adding a comment
      ['REPORTS_POINTS_WATCHER_ADDED', '1'], // Points for adding a watcher
      ['REPORTS_POINTS_COLLABORATOR_ADDED', '2'], // Points for adding a collaborator
      ['REPORTS_POINTS_TAG_ADDED', '1'], // Points for adding a tag
      ['REPORTS_POINTS_EFFORT_MULTIPLIER', '2'], // Multiplier for effort points
      ['UPLOAD_FILETYPES', JSON.stringify({
        // Images
        'image/jpeg': true,
        'image/png': true,
        'image/gif': true,
        'image/webp': true,
        'image/svg+xml': true,
        'image/bmp': true,
        'image/tiff': true,
        'image/ico': true,
        'image/heic': true,
        'image/heif': true,
        'image/avif': true,
        // Videos
        'video/mp4': true,
        'video/webm': true,
        'video/ogg': true,
        'video/quicktime': true,
        'video/x-msvideo': true,
        'video/x-ms-wmv': true,
        'video/x-matroska': true,
        'video/mpeg': true,
        'video/3gpp': true,
        // Documents
        'application/pdf': true,
        'text/plain': true,
        'text/csv': true,
        // Office Documents
        'application/msword': true,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
        'application/vnd.ms-excel': true,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
        'application/vnd.ms-powerpoint': true,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
        // Archives
        'application/zip': true,
        'application/x-rar-compressed': true,
        'application/x-7z-compressed': true,
        // Code Files
        'text/javascript': true,
        'text/css': true,
        'text/html': true,
        'application/json': true
      })] // Allowed file types as JSON object
    ];

    // Use INSERT OR IGNORE for most settings, but ensure UPLOAD_FILETYPES is always initialized
    // If UPLOAD_FILETYPES is missing or empty, initialize it with defaults
    const settingsStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    const uploadFileTypesStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    
    for (const [key, value] of defaultSettings) {
      if (key === 'UPLOAD_FILETYPES') {
        // Check if UPLOAD_FILETYPES exists and is not empty
        const existing = await wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('UPLOAD_FILETYPES');
        if (!existing || !existing.value || existing.value === '{}') {
          // Initialize or update with default file types
          await wrapQuery(uploadFileTypesStmt, 'INSERT').run(key, value);
          console.log('✅ Initialized UPLOAD_FILETYPES with default file types');
        } else {
          // Already exists with a value, keep it (admin may have configured it)
          console.log('ℹ️  UPLOAD_FILETYPES already configured, keeping existing value');
        }
      } else {
        await dbRun(settingsStmt, key, value);
      }
    }

    // Override APP_VERSION from environment variable if present (during initial setup)
    if (process.env.APP_VERSION) {
      await wrapQuery(db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'), 'INSERT')
        .run('APP_VERSION', process.env.APP_VERSION);
      console.log(`✅ Set APP_VERSION=${process.env.APP_VERSION} from environment variable`);
    }

    // Set MAIL_MANAGED=true for licensed instances (basic/pro plans)
    if (process.env.LICENSE_ENABLED === 'true') {
      const supportType = process.env.SUPPORT_TYPE || 'basic';
      if (supportType === 'basic' || supportType === 'pro') {
        await wrapQuery(db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'), 'INSERT')
          .run('MAIL_MANAGED', 'true');
        console.log('✅ Set MAIL_MANAGED=true for licensed instance');
        
        // Configure managed SMTP settings
        const managedSmtpSettings = [
          ['SMTP_HOST', 'smtp.ezkan.cloud'],
          ['SMTP_PORT', '587'],
          ['SMTP_USERNAME', 'noreply@ezkan.cloud'],
          ['SMTP_PASSWORD', process.env.MANAGED_SMTP_PASSWORD || 'managed-password'],
          ['SMTP_FROM_EMAIL', 'noreply@ezkan.cloud'],
          ['SMTP_FROM_NAME', 'Easy Kanban'],
          ['SMTP_SECURE', 'tls'],
          ['MAIL_ENABLED', 'true']
        ];
        
        const managedSmtpStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
        for (const [key, value] of managedSmtpSettings) {
          await wrapQuery(managedSmtpStmt, 'INSERT').run(key, value);
        }
        console.log('✅ Configured managed SMTP settings');
      }
    }

    // Create admin member
    const adminMemberId = crypto.randomUUID();
    await wrapQuery(db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)'), 'INSERT').run(
      adminMemberId, 
      'Admin User', 
      '#FF6B6B', 
      adminId
    );

    // Create system user account (for orphaned tasks when users are deleted)
    const systemUserId = '00000000-0000-0000-0000-000000000000';
    const systemMemberId = '00000000-0000-0000-0000-000000000001';
    const systemPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10); // Random unguessable password
    
    // Create system avatar (with tenant-specific path if in multi-tenant mode)
    const systemAvatarPath = createLetterAvatar('S', systemUserId, 'system', tenantId);
    
    // Check if system user already exists
    const existingSystemUser = await wrapQuery(db.prepare('SELECT id FROM users WHERE id = ?'), 'SELECT').get(systemUserId);
    if (!existingSystemUser) {
      await wrapQuery(db.prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path, auth_provider, is_active) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `), 'INSERT').run(systemUserId, 'system@local', systemPasswordHash, 'System', 'User', systemAvatarPath, 'local', 0);

      // Assign user role to system account
      const userRoleResult = await wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get('user');
      const userRoleId = userRoleResult.id;
      const userRoleStmt = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
      await dbRun(userRoleStmt, systemUserId, userRoleId);

      // Create system member record
      const systemMemberStmt = db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)');
      await dbRun(systemMemberStmt, systemMemberId, 'SYSTEM', '#1E40AF', systemUserId);
      
      console.log('🤖 System account created for orphaned task management');
    }
  }

  // Ensure default priorities exist (in case they were deleted)
  await initializeDefaultPriorities(db);

  // Initialize default data if no boards exist
  const boardsCountStmt = db.prepare('SELECT COUNT(*) as count FROM boards');
  const boardsCountResult = await dbGet(boardsCountStmt);
  const boardsCount = boardsCountResult.count;
  if (boardsCount === 0) {
    // Always create a default board with columns
    const boardId = crypto.randomUUID();
    const projectIdentifier = await generateProjectIdentifier(db);
    await wrapQuery(db.prepare('INSERT INTO boards (id, title, project, position) VALUES (?, ?, ?, ?)'), 'INSERT').run(
      boardId, 
      'Project Board', 
      projectIdentifier,
      0
    );

    // Create default columns
    const defaultColumns = [
      { id: `todo-${boardId}`, title: 'To Do', position: 0, is_finished: false, is_archived: false },
      { id: `progress-${boardId}`, title: 'In Progress', position: 1, is_finished: false, is_archived: false },
      { id: `testing-${boardId}`, title: 'Testing', position: 2, is_finished: false, is_archived: false },
      { id: `completed-${boardId}`, title: 'Completed', position: 3, is_finished: true, is_archived: false },
      { id: `archive-${boardId}`, title: 'Archive', position: 4, is_finished: false, is_archived: true }
    ];

    const columnStmt = db.prepare('INSERT INTO columns (id, boardId, title, position, is_finished, is_archived) VALUES (?, ?, ?, ?, ?, ?)');
    for (const col of defaultColumns) {
      await wrapQuery(columnStmt, 'INSERT').run(col.id, boardId, col.title, col.position, col.is_finished ? 1 : 0, col.is_archived ? 1 : 0);
    }

    console.log(`✅ Created default board: ${projectIdentifier} with ${defaultColumns.length} columns`);

    // Initialize demo data if DEMO_ENABLED=true
    // This will create demo users and tasks for the board
    await initializeDemoData(db, boardId, defaultColumns);
  }



  // Clean up orphaned members (members without corresponding users)
  try {
    const orphanedMembers = await wrapQuery(db.prepare(`
      SELECT m.id 
      FROM members m 
      LEFT JOIN users u ON m.user_id = u.id 
      WHERE u.id IS NULL AND m.user_id IS NOT NULL
    `), 'SELECT').all();

    if (orphanedMembers.length > 0) {
      const deleteMemberStmt = db.prepare('DELETE FROM members WHERE id = ?');
      for (const member of orphanedMembers) {
        await dbRun(deleteMemberStmt, member.id);
      }
    }
  } catch (error) {
    console.error('Error cleaning up orphaned members:', error);
  }

  // Update APP_VERSION on every startup (from version.json or environment variable)
  // Priority: 1) version.json (build-time), 2) ENV variable (runtime)
  let appVersion = null;
  let versionChanged = false;
  
  // Try to read from version.json (build-time version, works in K8s)
  try {
    const versionUrl = new URL('../version.json', import.meta.url);
    const versionPath = fileURLToPath(versionUrl);
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    appVersion = versionData.version;
    console.log(`📦 Read version from build-time version.json: ${appVersion}`);
    console.log(`   Git commit: ${versionData.gitCommit} | Branch: ${versionData.gitBranch}`);
    console.log(`   Built at: ${versionData.buildTime}`);
  } catch (error) {
    // Fallback to environment variable (Docker Compose, legacy)
    if (process.env.APP_VERSION) {
      appVersion = process.env.APP_VERSION;
      console.log(`📦 Read version from environment variable: ${appVersion}`);
    }
  }
  
  // Update database if version is available
  if (appVersion) {
    const currentVersion = await wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('APP_VERSION');
    
    if (!currentVersion) {
      // APP_VERSION doesn't exist in settings, insert it
      const insertVersionStmt = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
      await dbRun(insertVersionStmt, 'APP_VERSION', appVersion);
      console.log(`✅ Initialized APP_VERSION=${appVersion}`);
      versionChanged = true;
    } else if (currentVersion.value !== appVersion) {
      // APP_VERSION has changed, update it
      const updateVersionStmt = db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?');
      await dbRun(updateVersionStmt, appVersion, 'APP_VERSION');
      console.log(`✅ Updated APP_VERSION from ${currentVersion.value} to ${appVersion}`);
      console.log(`   🔄 Users will be notified to refresh their browsers`);
      versionChanged = true;
    }
  }
  
  // Return version info for broadcasting
  return { appVersion, versionChanged };
};

// Initialize database connection
// Supports both single-tenant and multi-tenant modes
// tenantId: optional tenant identifier (for multi-tenant mode)
// Now async to support proxy mode and PostgreSQL
export const initializeDatabase = async (tenantId = null) => {
  // Check if we should use PostgreSQL
  const usePostgres = process.env.DB_TYPE === 'postgresql';
  
  if (usePostgres) {
    // PostgreSQL mode
    console.log(`🐘 Using PostgreSQL for tenant: ${tenantId || 'default'}`);
    const db = new PostgresDatabase(tenantId);
    
    // Ensure schema exists (for multi-tenant mode)
    await db.ensureSchema();
    
    // Create tables (async wrapper for consistency)
    await createTables(db);
    
    // Initialize default priorities BEFORE migrations (migration 10 needs priorities to exist)
    await initializeDefaultPriorities(db);
    
    // Run database migrations (migrations may create tables needed by demo data)
    try {
      await runMigrations(db);
    } catch (error) {
      console.error('❌ Failed to run migrations:', error);
      throw error;
    }
    
    // Initialize default data and capture version info (must run AFTER migrations)
    const versionInfo = await initializeDefaultData(db, tenantId);
    
    // Return both db and version info for broadcasting
    return { 
      db, 
      appVersion: versionInfo?.appVersion || null,
      versionChanged: versionInfo?.versionChanged || false,
      tenantId: tenantId || null
    };
  }

  // SQLite mode (original implementation)
  const dbPath = getDbPath(tenantId);
  
  // Ensure the directory exists
  const dbDir = dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    if (tenantId) {
      console.log(`📁 Created tenant directory: ${dbDir}`);
    }
  }

  // Check if we should use SQLite proxy (for multi-tenant NFS setups)
  const useProxy = process.env.SQLITE_PROXY_URL && isMultiTenant() && tenantId;
  
  if (useProxy) {
    // Use proxy service for database access
    console.log(`🔗 Using SQLite proxy for tenant: ${tenantId}`);
    const db = new DatabaseProxy(tenantId, process.env.SQLITE_PROXY_URL);
    
    // Initialize tables and migrations via proxy (async)
    // Proxy service handles expected SQLite errors (duplicate column, already exists, etc.)
    await createTables(db);
    await initializeDefaultPriorities(db);
    await runMigrations(db);
    
    const versionInfo = await initializeDefaultData(db, tenantId);
    return { 
      db, 
      appVersion: versionInfo?.appVersion || null,
      versionChanged: versionInfo?.versionChanged || false,
      tenantId: tenantId || null
    };
  }

  // Direct database access (single-tenant or non-proxy multi-tenant)
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '');
    if (tenantId) {
      console.log(`📊 Created tenant database: ${dbPath}`);
    }
  }

  const db = new Database(dbPath);
  
  // Create tables (async wrapper for consistency)
  await createTables(db);
  
  // Initialize default priorities BEFORE migrations (migration 10 needs priorities to exist)
  await initializeDefaultPriorities(db);
  
  // Run database migrations (migrations may create tables needed by demo data)
  try {
    await runMigrations(db);
  } catch (error) {
    console.error('❌ Failed to run migrations:', error);
    throw error;
  }
  
  // Initialize default data and capture version info (must run AFTER migrations)
  const versionInfo = await initializeDefaultData(db, tenantId);
  
  // Return both db and version info for broadcasting
  return { 
    db, 
    appVersion: versionInfo?.appVersion || null,
    versionChanged: versionInfo?.versionChanged || false,
    tenantId: tenantId || null
  };
};

// Export utility function for tenant routing
export { isMultiTenant };

// SQL for creating all tables (shared between proxy and direct DB)
