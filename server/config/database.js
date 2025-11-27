import Database from 'better-sqlite3';
import DatabaseProxy from '../utils/databaseProxy.js';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { runMigrations } from '../migrations/index.js';
import { initializeDemoData } from './demoData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Utility function to generate project identifiers
const generateProjectIdentifier = async (db, prefix = 'PROJ-') => {
  const isProxy = db && db.constructor.name === 'DatabaseProxy';
  
  // Get the highest existing project number
  const result = isProxy
    ? await db.prepare(`
        SELECT project FROM boards 
        WHERE project IS NOT NULL AND project LIKE ?
        ORDER BY CAST(SUBSTR(project, ?) AS INTEGER) DESC 
        LIMIT 1
      `).get(`${prefix}%`, prefix.length + 1)
    : db.prepare(`
        SELECT project FROM boards 
        WHERE project IS NOT NULL AND project LIKE ?
        ORDER BY CAST(SUBSTR(project, ?) AS INTEGER) DESC 
        LIMIT 1
      `).get(`${prefix}%`, prefix.length + 1);
  
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

// Initialize database connection
// Supports both single-tenant and multi-tenant modes
// tenantId: optional tenant identifier (for multi-tenant mode)
// Now async to support proxy mode
export const initializeDatabase = async (tenantId = null) => {
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
    await createTables(db);
    await initializeDefaultPriorities(db);
    try {
      await runMigrations(db);
    } catch (error) {
      console.error('❌ Failed to run migrations:', error);
      throw error;
    }
    
    // Safety check for priority_id (async)
    try {
      const tableInfo = await db.prepare('PRAGMA table_info(tasks)').all();
      const columnNames = tableInfo.map(col => col.name);
      
      if (!columnNames.includes('priority_id')) {
        console.log('⚠️  priority_id column missing - adding it now...');
        await db.exec('ALTER TABLE tasks ADD COLUMN priority_id INTEGER');
        
        const priorities = await db.prepare('SELECT id, priority FROM priorities').all();
        if (priorities.length > 0) {
          const priorityMap = new Map();
          priorities.forEach(p => {
            priorityMap.set(p.priority.toLowerCase(), p.id);
          });
          
          const defaultPriority = await db.prepare('SELECT id FROM priorities WHERE initial = 1').get();
          const defaultPriorityId = defaultPriority ? defaultPriority.id : priorities[0].id;
          
          for (const [priorityName, priorityId] of priorityMap.entries()) {
            await db.prepare(`
              UPDATE tasks 
              SET priority_id = ? 
              WHERE LOWER(priority) = ? AND priority_id IS NULL
            `).run(priorityId, priorityName);
          }
          
          await db.prepare(`
            UPDATE tasks 
            SET priority_id = ? 
            WHERE priority_id IS NULL
          `).run(defaultPriorityId);
          
          console.log('✅ priority_id column added and populated');
        }
        
        try {
          await db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_priority_id ON tasks(priority_id)');
        } catch (err) {
          // Index might already exist
        }
      }
    } catch (error) {
      console.error('⚠️  Warning: Could not verify/add priority_id column:', error.message);
    }
    
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
  
  // Safety check: Ensure priority_id column exists (defensive measure in case migration failed)
  try {
    const tableInfo = await db.prepare('PRAGMA table_info(tasks)').all();
    const columnNames = tableInfo.map(col => col.name);
    
    if (!columnNames.includes('priority_id')) {
      console.log('⚠️  priority_id column missing - adding it now...');
      await db.exec('ALTER TABLE tasks ADD COLUMN priority_id INTEGER');
      
      // Try to populate priority_id from existing priority names
      const priorities = await db.prepare('SELECT id, priority FROM priorities').all();
      if (priorities.length > 0) {
        const priorityMap = new Map();
        priorities.forEach(p => {
          priorityMap.set(p.priority.toLowerCase(), p.id);
        });
        
        const defaultPriority = await db.prepare('SELECT id FROM priorities WHERE initial = 1').get();
        const defaultPriorityId = defaultPriority ? defaultPriority.id : priorities[0].id;
        
        for (const [priorityName, priorityId] of priorityMap.entries()) {
          await db.prepare(`
            UPDATE tasks 
            SET priority_id = ? 
            WHERE LOWER(priority) = ? AND priority_id IS NULL
          `).run(priorityId, priorityName);
        }
        
        // Set default for any remaining
        await db.prepare(`
          UPDATE tasks 
          SET priority_id = ? 
          WHERE priority_id IS NULL
        `).run(defaultPriorityId);
        
        console.log('✅ priority_id column added and populated');
      }
      
      // Add index
      try {
        await db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_priority_id ON tasks(priority_id)');
      } catch (err) {
        // Index might already exist
      }
    }
  } catch (error) {
    console.error('⚠️  Warning: Could not verify/add priority_id column:', error.message);
    // Don't throw - this is a defensive check, not critical
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

// Create database tables (async for proxy support)
const createTables = async (db) => {
  const isProxy = db && db.constructor.name === 'DatabaseProxy';
  if (isProxy) {
    await db.exec(CREATE_TABLES_SQL);
  } else {
    // Direct DB (better-sqlite3) - sync execution, but in async function
    db.exec(CREATE_TABLES_SQL);
  }
};

// Initialize default priorities (called before migrations to ensure they exist)
const initializeDefaultPriorities = async (db) => {
  const isProxy = db && db.constructor.name === 'DatabaseProxy';
  
  if (isProxy) {
    const prioritiesCount = await db.prepare('SELECT COUNT(*) as count FROM priorities').get();
    if (prioritiesCount.count === 0) {
      const defaultPriorities = [
        { priority: 'low', color: '#10B981', position: 0, initial: 0 },
        { priority: 'medium', color: '#F59E0B', position: 1, initial: 1 },
        { priority: 'high', color: '#EF4444', position: 2, initial: 0 },
        { priority: 'urgent', color: '#DC2626', position: 3, initial: 0 }
      ];

      const priorityStmt = db.prepare('INSERT INTO priorities (priority, color, position, initial) VALUES (?, ?, ?, ?)');
      for (const p of defaultPriorities) {
        await priorityStmt.run(p.priority, p.color, p.position, p.initial || 0);
      }
      
      console.log('✅ Initialized default priorities (low, medium, high, urgent)');
      console.log('   Default priority: medium');
    } else {
      // Ensure at least one priority is marked as default
      const defaultPriorityCount = await db.prepare('SELECT COUNT(*) as count FROM priorities WHERE initial = 1').get();
      if (defaultPriorityCount.count === 0) {
        // Set medium as default if no default exists
        const mediumPriority = await db.prepare('SELECT id FROM priorities WHERE priority = ?').get('medium');
        if (mediumPriority) {
          await db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?').run(mediumPriority.id);
          console.log('✅ Set "medium" as default priority');
        } else {
          // If medium doesn't exist, set the first priority as default
          const firstPriority = await db.prepare('SELECT id FROM priorities ORDER BY position ASC LIMIT 1').get();
          if (firstPriority) {
            await db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?').run(firstPriority.id);
            const priorityName = await db.prepare('SELECT priority FROM priorities WHERE id = ?').get(firstPriority.id);
            console.log(`✅ Set "${priorityName?.priority || 'first priority'}" as default priority`);
          }
        }
      }
    }
  } else {
    // Direct DB (better-sqlite3) - sync execution
    const prioritiesCount = db.prepare('SELECT COUNT(*) as count FROM priorities').get().count;
    if (prioritiesCount === 0) {
    const defaultPriorities = [
      { priority: 'low', color: '#10B981', position: 0, initial: 0 },
      { priority: 'medium', color: '#F59E0B', position: 1, initial: 1 },
      { priority: 'high', color: '#EF4444', position: 2, initial: 0 },
      { priority: 'urgent', color: '#DC2626', position: 3, initial: 0 }
    ];

    const priorityStmt = db.prepare('INSERT INTO priorities (priority, color, position, initial) VALUES (?, ?, ?, ?)');
    defaultPriorities.forEach(p => {
      priorityStmt.run(p.priority, p.color, p.position, p.initial || 0);
    });
    
    console.log('✅ Initialized default priorities (low, medium, high, urgent)');
    console.log('   Default priority: medium');
  } else {
    // Ensure at least one priority is marked as default
    const defaultPriorityCount = db.prepare('SELECT COUNT(*) as count FROM priorities WHERE initial = 1').get().count;
    if (defaultPriorityCount === 0) {
      // Set medium as default if no default exists
      const mediumPriority = db.prepare('SELECT id FROM priorities WHERE priority = ?').get('medium');
      if (mediumPriority) {
        db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?').run(mediumPriority.id);
        console.log('✅ Set "medium" as default priority');
      } else {
        // If medium doesn't exist, set the first priority as default
        const firstPriority = db.prepare('SELECT id FROM priorities ORDER BY position ASC LIMIT 1').get();
        if (firstPriority) {
          db.prepare('UPDATE priorities SET initial = 1 WHERE id = ?').run(firstPriority.id);
          const priorityName = db.prepare('SELECT priority FROM priorities WHERE id = ?').get(firstPriority.id)?.priority;
          console.log(`✅ Set "${priorityName || 'first priority'}" as default priority`);
        }
      }
    }
  }
};

// Initialize default data
// tenantId: optional tenant identifier (for multi-tenant mode)
// Now async to support proxy mode
const initializeDefaultData = async (db, tenantId = null) => {
  const isProxy = db && db.constructor.name === 'DatabaseProxy';
  
  // Always ensure UPLOAD_FILETYPES is initialized (even if roles already exist)
  // This is important for multi-tenant databases that may have been created before this setting was added
  const uploadFileTypes = isProxy
    ? await db.prepare('SELECT value FROM settings WHERE key = ?').get('UPLOAD_FILETYPES')
    : db.prepare('SELECT value FROM settings WHERE key = ?').get('UPLOAD_FILETYPES');
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
    if (isProxy) {
      await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('UPLOAD_FILETYPES', defaultFileTypes);
    } else {
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('UPLOAD_FILETYPES', defaultFileTypes);
    }
    console.log('✅ Initialized UPLOAD_FILETYPES with default file types (including GIF)');
  }
  
  // Initialize authentication data if no roles exist
  const rolesCount = isProxy
    ? (await db.prepare('SELECT COUNT(*) as count FROM roles').get()).count
    : db.prepare('SELECT COUNT(*) as count FROM roles').get().count;
  if (rolesCount === 0) {
    // Generate random password for admin user (only when creating users)
    const adminPassword = generateRandomPassword(12);
    
    // Store password in settings
    if (isProxy) {
      await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('ADMIN_PASSWORD', adminPassword);
    } else {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('ADMIN_PASSWORD', adminPassword);
    }
    
    // Insert default roles
    if (isProxy) {
      await db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run('admin', 'Administrator role');
      await db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run('user', 'Regular user role');
    } else {
      db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run('admin', 'Administrator role');
      db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run('user', 'Regular user role');
    }

    // Create default admin user with random password
    const adminId = crypto.randomUUID();
    const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);
    
    // Create admin avatar (with tenant-specific path if in multi-tenant mode)
    const adminAvatarPath = createLetterAvatar('A', adminId, 'admin', tenantId);
    
    if (isProxy) {
      await db.prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminId, 'admin@kanban.local', adminPasswordHash, 'Admin', 'User', adminAvatarPath);
    } else {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(adminId, 'admin@kanban.local', adminPasswordHash, 'Admin', 'User', adminAvatarPath);
    }

    // Assign admin role to default user
    const adminRoleId = isProxy
      ? (await db.prepare('SELECT id FROM roles WHERE name = ?').get('admin')).id
      : db.prepare('SELECT id FROM roles WHERE name = ?').get('admin').id;
    if (isProxy) {
      await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(adminId, adminRoleId);
    } else {
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(adminId, adminRoleId);
    }

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
      ['MAIL_HOST', ''],
      ['MAIL_PORT', '587'],
      ['MAIL_USER', ''],
      ['MAIL_PASS', ''],
      ['MAIL_FROM', ''],
      ['MAIL_MANAGED', 'false'], // Default to false, will be set to true for licensed instances
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
        const existing = isProxy
          ? await db.prepare('SELECT value FROM settings WHERE key = ?').get('UPLOAD_FILETYPES')
          : db.prepare('SELECT value FROM settings WHERE key = ?').get('UPLOAD_FILETYPES');
        if (!existing || !existing.value || existing.value === '{}') {
          // Initialize or update with default file types
          if (isProxy) {
            await uploadFileTypesStmt.run(key, value);
          } else {
            uploadFileTypesStmt.run(key, value);
          }
          console.log('✅ Initialized UPLOAD_FILETYPES with default file types');
        } else {
          // Already exists with a value, keep it (admin may have configured it)
          console.log('ℹ️  UPLOAD_FILETYPES already configured, keeping existing value');
        }
      } else {
        if (isProxy) {
          await settingsStmt.run(key, value);
        } else {
          settingsStmt.run(key, value);
        }
      }
    }

    // Override APP_VERSION from environment variable if present (during initial setup)
    if (process.env.APP_VERSION) {
      if (isProxy) {
        await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
          .run('APP_VERSION', process.env.APP_VERSION);
      } else {
        db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
          .run('APP_VERSION', process.env.APP_VERSION);
      }
      console.log(`✅ Set APP_VERSION=${process.env.APP_VERSION} from environment variable`);
    }

    // Set MAIL_MANAGED=true for licensed instances (basic/pro plans)
    if (process.env.LICENSE_ENABLED === 'true') {
      const supportType = process.env.SUPPORT_TYPE || 'basic';
      if (supportType === 'basic' || supportType === 'pro') {
        if (isProxy) {
          await db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
            .run('MAIL_MANAGED', 'true');
        } else {
          db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
            .run('MAIL_MANAGED', 'true');
        }
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
          if (isProxy) {
            await managedSmtpStmt.run(key, value);
          } else {
            managedSmtpStmt.run(key, value);
          }
        }
        console.log('✅ Configured managed SMTP settings');
      }
    }

    // Create admin member
    const adminMemberId = crypto.randomUUID();
    if (isProxy) {
      await db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
        adminMemberId, 
        'Admin User', 
        '#FF6B6B', 
        adminId
      );
    } else {
      db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
        adminMemberId, 
        'Admin User', 
        '#FF6B6B', 
        adminId
      );
    }

    // Create system user account (for orphaned tasks when users are deleted)
    const systemUserId = '00000000-0000-0000-0000-000000000000';
    const systemMemberId = '00000000-0000-0000-0000-000000000001';
    const systemPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10); // Random unguessable password
    
    // Create system avatar (with tenant-specific path if in multi-tenant mode)
    const systemAvatarPath = createLetterAvatar('S', systemUserId, 'system', tenantId);
    
    // Check if system user already exists
    const existingSystemUser = isProxy
      ? await db.prepare('SELECT id FROM users WHERE id = ?').get(systemUserId)
      : db.prepare('SELECT id FROM users WHERE id = ?').get(systemUserId);
    if (!existingSystemUser) {
      if (isProxy) {
        await db.prepare(`
          INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path, auth_provider, is_active) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(systemUserId, 'system@local', systemPasswordHash, 'System', 'User', systemAvatarPath, 'local', 0);
      } else {
        db.prepare(`
          INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path, auth_provider, is_active) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(systemUserId, 'system@local', systemPasswordHash, 'System', 'User', systemAvatarPath, 'local', 0);
      }

      // Assign user role to system account
      const userRoleId = isProxy
        ? (await db.prepare('SELECT id FROM roles WHERE name = ?').get('user')).id
        : db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id;
      if (isProxy) {
        await db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(systemUserId, userRoleId);
      } else {
        db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(systemUserId, userRoleId);
      }

      // Create system member record
      if (isProxy) {
        await db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
          systemMemberId, 
          'SYSTEM', 
          '#1E40AF', // Blue color
          systemUserId
        );
      } else {
        db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
          systemMemberId, 
          'SYSTEM', 
          '#1E40AF', // Blue color
          systemUserId
        );
      }
      
      console.log('🤖 System account created for orphaned task management');
    }
  }

  // Ensure default priorities exist (in case they were deleted)
  await initializeDefaultPriorities(db);

  // Initialize default data if no boards exist
  const boardsCount = isProxy
    ? (await db.prepare('SELECT COUNT(*) as count FROM boards').get()).count
    : db.prepare('SELECT COUNT(*) as count FROM boards').get().count;
  if (boardsCount === 0) {
    // Always create a default board with columns
    const boardId = crypto.randomUUID();
    const projectIdentifier = await generateProjectIdentifier(db);
    if (isProxy) {
      await db.prepare('INSERT INTO boards (id, title, project, position) VALUES (?, ?, ?, ?)').run(
        boardId, 
        'Project Board', 
        projectIdentifier,
        0
      );
    } else {
      db.prepare('INSERT INTO boards (id, title, project, position) VALUES (?, ?, ?, ?)').run(
        boardId, 
        'Project Board', 
        projectIdentifier,
        0
      );
    }

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
      if (isProxy) {
        await columnStmt.run(col.id, boardId, col.title, col.position, col.is_finished ? 1 : 0, col.is_archived ? 1 : 0);
      } else {
        columnStmt.run(col.id, boardId, col.title, col.position, col.is_finished ? 1 : 0, col.is_archived ? 1 : 0);
      }
    }

    console.log(`✅ Created default board: ${projectIdentifier} with ${defaultColumns.length} columns`);

    // Initialize demo data if DEMO_ENABLED=true
    // This will create demo users and tasks for the board
    initializeDemoData(db, boardId, defaultColumns);
  }

  // Database migrations (legacy - these columns are now in CREATE_TABLES_SQL, but kept for backward compatibility)
  try {
    // Ensure members table has created_at column (migration)
    if (isProxy) {
      await db.prepare('ALTER TABLE members ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
    } else {
      db.prepare('ALTER TABLE members ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
    }
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add dueDate column to tasks table (migration)  
    if (isProxy) {
      await db.prepare('ALTER TABLE tasks ADD COLUMN dueDate TEXT').run();
    } else {
      db.prepare('ALTER TABLE tasks ADD COLUMN dueDate TEXT').run();
    }
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add position column to priorities table (migration)
    if (isProxy) {
      await db.prepare('ALTER TABLE priorities ADD COLUMN position INTEGER NOT NULL DEFAULT 0').run();
    } else {
      db.prepare('ALTER TABLE priorities ADD COLUMN position INTEGER NOT NULL DEFAULT 0').run();
    }
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add projectFilter column to views table (migration)
    if (isProxy) {
      await db.prepare('ALTER TABLE views ADD COLUMN projectFilter TEXT').run();
    } else {
      db.prepare('ALTER TABLE views ADD COLUMN projectFilter TEXT').run();
    }
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add taskFilter column to views table (migration)
    if (isProxy) {
      await db.prepare('ALTER TABLE views ADD COLUMN taskFilter TEXT').run();
    } else {
      db.prepare('ALTER TABLE views ADD COLUMN taskFilter TEXT').run();
    }
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add boardColumnFilter column to views table (migration)
    if (isProxy) {
      await db.prepare('ALTER TABLE views ADD COLUMN boardColumnFilter TEXT').run();
    } else {
      db.prepare('ALTER TABLE views ADD COLUMN boardColumnFilter TEXT').run();
    }
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add force_logout column to users table (migration)
    if (isProxy) {
      await db.prepare('ALTER TABLE users ADD COLUMN force_logout INTEGER DEFAULT 0').run();
    } else {
      db.prepare('ALTER TABLE users ADD COLUMN force_logout INTEGER DEFAULT 0').run();
    }
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add is_archived column to columns table (migration)
    if (isProxy) {
      await db.prepare('ALTER TABLE columns ADD COLUMN is_archived BOOLEAN DEFAULT 0').run();
    } else {
      db.prepare('ALTER TABLE columns ADD COLUMN is_archived BOOLEAN DEFAULT 0').run();
    }
  } catch (error) {
    // Column already exists, ignore error
  }


  // Clean up orphaned members (members without corresponding users)
  try {
    const orphanedMembers = isProxy
      ? await db.prepare(`
          SELECT m.id 
          FROM members m 
          LEFT JOIN users u ON m.user_id = u.id 
          WHERE u.id IS NULL AND m.user_id IS NOT NULL
        `).all()
      : db.prepare(`
          SELECT m.id 
          FROM members m 
          LEFT JOIN users u ON m.user_id = u.id 
          WHERE u.id IS NULL AND m.user_id IS NOT NULL
        `).all();

    if (orphanedMembers.length > 0) {
      const deleteMemberStmt = db.prepare('DELETE FROM members WHERE id = ?');
      for (const member of orphanedMembers) {
        if (isProxy) {
          await deleteMemberStmt.run(member.id);
        } else {
          deleteMemberStmt.run(member.id);
        }
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
    const versionPath = new URL('../version.json', import.meta.url);
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
    const currentVersion = isProxy
      ? await db.prepare('SELECT value FROM settings WHERE key = ?').get('APP_VERSION')
      : db.prepare('SELECT value FROM settings WHERE key = ?').get('APP_VERSION');
    
    if (!currentVersion) {
      // APP_VERSION doesn't exist in settings, insert it
      if (isProxy) {
        await db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
          .run('APP_VERSION', appVersion);
      } else {
        db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
          .run('APP_VERSION', appVersion);
      }
      console.log(`✅ Initialized APP_VERSION=${appVersion}`);
      versionChanged = true;
    } else if (currentVersion.value !== appVersion) {
      // APP_VERSION has changed, update it
      if (isProxy) {
        await db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?')
          .run(appVersion, 'APP_VERSION');
      } else {
        db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?')
          .run(appVersion, 'APP_VERSION');
      }
      console.log(`✅ Updated APP_VERSION from ${currentVersion.value} to ${appVersion}`);
      console.log(`   🔄 Users will be notified to refresh their browsers`);
      versionChanged = true;
    }
  }
  
  // Return version info for broadcasting
  return { appVersion, versionChanged };
};

export default initializeDatabase;
