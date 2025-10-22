import Database from 'better-sqlite3';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Utility function to generate project identifiers
const generateProjectIdentifier = (db, prefix = 'PROJ-') => {
  // Get the highest existing project number
  const result = db.prepare(`
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
function createLetterAvatar(letter, userId, role = 'user') {
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
    const avatarsDir = join(dirname(__dirname), 'avatars');
    
    // Ensure avatars directory exists
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }
    
    const filePath = join(avatarsDir, filename);
    fs.writeFileSync(filePath, svg);
    
    console.log(`✅ Created default ${role} avatar: ${filename}`);
    return `/avatars/${filename}`;
  } catch (error) {
    console.error(`❌ Error creating ${role} avatar:`, error);
    return null;
  }
}

// Database path configuration
const getDbPath = () => {
  // In Docker, use the data volume path; otherwise use local path
  return process.env.DOCKER_ENV === 'true'
    ? '/app/server/data/kanban.db'
    : join(dirname(__dirname), 'kanban.db');
};

// Initialize database connection
export const initializeDatabase = () => {
  const dbPath = getDbPath();
  
  // Ensure the directory exists
  const dbDir = dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '');
  }

  const db = new Database(dbPath);
  
  // Create tables
  createTables(db);
  
  // Initialize default data
  initializeDefaultData(db);
  
  return db;
};

// Create database tables
const createTables = (db) => {
  // Create tables in dependency order
  db.exec(`
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
  `);
};

// Initialize default data
const initializeDefaultData = (db) => {
  // Initialize authentication data if no roles exist
  const rolesCount = db.prepare('SELECT COUNT(*) as count FROM roles').get().count;
  if (rolesCount === 0) {
    // Generate random passwords for both admin and demo users (only when creating users)
    const adminPassword = generateRandomPassword(12);
    const demoPassword = generateRandomPassword(12);
    
    // Store passwords in settings
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('ADMIN_PASSWORD', adminPassword);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('DEMO_PASSWORD', demoPassword);
    // Insert default roles
    db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run('admin', 'Administrator role');
    db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run('user', 'Regular user role');

    // Create default admin user with random password
    const adminId = crypto.randomUUID();
    const adminPasswordHash = bcrypt.hashSync(adminPassword, 10);
    
    // Create admin avatar
    const adminAvatarPath = createLetterAvatar('A', adminId, 'admin');
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(adminId, 'admin@kanban.local', adminPasswordHash, 'Admin', 'User', adminAvatarPath);

    // Assign admin role to default user
    const adminRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('admin').id;
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(adminId, adminRoleId);

    // Create default demo user with random password
    const demoUserId = crypto.randomUUID();
    const demoPasswordHash = bcrypt.hashSync(demoPassword, 10);
    
    // Create demo avatar
    const demoAvatarPath = createLetterAvatar('D', demoUserId, 'demo');
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(demoUserId, 'demo@kanban.local', demoPasswordHash, 'Demo', 'User', demoAvatarPath);

    // Assign user role to demo user
    const userRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id;
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(demoUserId, userRoleId);

    // Log admin credentials for easy access
    console.log('');
    console.log('🔐 ===========================================');
    console.log('   ADMIN ACCOUNT CREDENTIALS');
    console.log('===========================================');
    console.log(`   Email: admin@kanban.local`);
    console.log(`   Password: ${adminPassword}`);
    console.log('===========================================');
    console.log('');
    console.log('🔐 ===========================================');
    console.log('   DEMO ACCOUNT CREDENTIALS');
    console.log('===========================================');
    console.log(`   Email: demo@kanban.local`);
    console.log(`   Password: ${demoPassword}`);
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
      ['DEFAULT_ACTIVITY_FEED_POSITION', '{"x": 0, "y": 443}'], // Default activity feed position
      ['DEFAULT_ACTIVITY_FEED_WIDTH', '160'], // Default activity feed width
      ['DEFAULT_ACTIVITY_FEED_HEIGHT', '400'], // Default activity feed height
      // Project and task identification settings
      ['DEFAULT_PROJ_PREFIX', 'PROJ-'], // Default project prefix
      ['DEFAULT_TASK_PREFIX', 'TASK-'], // Default task prefix
      ['DEFAULT_FINISHED_COLUMN_NAMES', '["Done", "Completed", "Finished"]'], // Default finished column names
      ['HIGHLIGHT_OVERDUE_TASKS', 'true'], // Highlight overdue tasks in light red
      ['STORAGE_LIMIT', '5368709120'], // 5GB storage limit in bytes (5 * 1024^3)
      ['STORAGE_USED', '0'], // Current storage usage in bytes
      ['UPLOAD_MAX_FILESIZE', '10485760'], // 10MB max file size in bytes (10 * 1024^2)
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
      ['UPLOAD_FILETYPES', JSON.stringify({
        'image/jpeg': true,
        'image/jpg': true,
        'image/png': true,
        'image/gif': true,
        'image/webp': true,
        'image/svg+xml': true,
        'application/pdf': true,
        'text/plain': true,
        'text/csv': true,
        'application/msword': true,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
        'application/vnd.ms-excel': true,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
        'application/vnd.ms-powerpoint': true,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
        'application/zip': true,
        'application/x-rar-compressed': true,
        'application/x-7z-compressed': true,
        'text/javascript': true,
        'text/css': true,
        'text/html': true,
        'application/json': true
      })] // Allowed file types as JSON object
    ];

    const settingsStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    defaultSettings.forEach(([key, value]) => {
      settingsStmt.run(key, value);
    });

    // Override APP_VERSION from environment variable if present (during initial setup)
    if (process.env.APP_VERSION) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('APP_VERSION', process.env.APP_VERSION);
      console.log(`✅ Set APP_VERSION=${process.env.APP_VERSION} from environment variable`);
    }

    // Set MAIL_MANAGED=true for licensed instances (basic/pro plans)
    if (process.env.LICENSE_ENABLED === 'true') {
      const supportType = process.env.SUPPORT_TYPE || 'basic';
      if (supportType === 'basic' || supportType === 'pro') {
        db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
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
        managedSmtpSettings.forEach(([key, value]) => {
          managedSmtpStmt.run(key, value);
        });
        console.log('✅ Configured managed SMTP settings');
      }
    }

    // Create admin member
    const adminMemberId = crypto.randomUUID();
    db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
      adminMemberId, 
      'Admin User', 
      '#FF6B6B', 
      adminId
    );

    // Create system user account (for orphaned tasks when users are deleted)
    const systemUserId = '00000000-0000-0000-0000-000000000000';
    const systemMemberId = '00000000-0000-0000-0000-000000000001';
    const systemPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10); // Random unguessable password
    
    // Create system avatar (computer icon)
    const systemAvatarPath = createLetterAvatar('S', systemUserId, 'system');
    
    // Check if system user already exists
    const existingSystemUser = db.prepare('SELECT id FROM users WHERE id = ?').get(systemUserId);
    if (!existingSystemUser) {
      db.prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path, auth_provider, is_active) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(systemUserId, 'system@local', systemPasswordHash, 'System', 'User', systemAvatarPath, 'local', 0);

      // Assign user role to system account
      const userRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id;
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(systemUserId, userRoleId);

      // Create system member record
      db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
        systemMemberId, 
        'SYSTEM', 
        '#1E40AF', // Blue color
        systemUserId
      );
      
      console.log('🤖 System account created for orphaned task management');
    }
  }

  // Initialize default priorities if none exist
  const prioritiesCount = db.prepare('SELECT COUNT(*) as count FROM priorities').get().count;
  if (prioritiesCount === 0) {
    const defaultPriorities = [
      { priority: 'low', color: '#10B981', position: 0 },
      { priority: 'medium', color: '#F59E0B', position: 1, initial: 1 },
      { priority: 'high', color: '#EF4444', position: 2 },
      { priority: 'urgent', color: '#DC2626', position: 3 }
    ];

    const priorityStmt = db.prepare('INSERT INTO priorities (priority, color, position, initial) VALUES (?, ?, ?, ?)');
    defaultPriorities.forEach(p => {
      priorityStmt.run(p.priority, p.color, p.position, p.initial || 0);
    });
  }

  // Initialize default data if no boards exist
  const boardsCount = db.prepare('SELECT COUNT(*) as count FROM boards').get().count;
  if (boardsCount === 0) {
    // Create team member for demo user (if demo user exists)
    const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@kanban.local');
    if (demoUser) {
      const demoMemberId = crypto.randomUUID();
      db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
        demoMemberId, 
        'Demo User', 
        '#4ECDC4', 
        demoUser.id
      );
    }

    // Create default board with project identifier
    const boardId = crypto.randomUUID();
    const projectIdentifier = generateProjectIdentifier(db);
    db.prepare('INSERT INTO boards (id, title, project, position) VALUES (?, ?, ?, ?)').run(
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
    defaultColumns.forEach(col => {
      columnStmt.run(col.id, boardId, col.title, col.position, col.is_finished ? 1 : 0, col.is_archived ? 1 : 0);
    });

    // Create sample tasks
    const demoUserRecord = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@kanban.local');
    const demoMember = demoUserRecord ? db.prepare('SELECT id FROM members WHERE user_id = ?').get(demoUserRecord.id) : null;
    if (demoMember) {
      const now = new Date().toISOString();
      const today = new Date().toISOString().split('T')[0];
      
      // Always create the welcome task
      const welcomeTaskId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, effort, priority, columnId, boardId, position, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        welcomeTaskId,
        'Welcome to Easy Kanban!',
        'This is a sample task to get you started. You can edit, move, or delete this task.',
        'TASK-00001',
        demoMember.id,
        demoMember.id,
        today,
        1,
        'medium',
        defaultColumns[0].id,
        boardId,
        0,
        now,
        now
      );

      // Create additional demo tasks if DEMO_ENABLED=true
      if (process.env.DEMO_ENABLED === 'true') {
        const demoTasks = [
          // To Do Column (3 tasks)
          {
            title: 'Set up project documentation',
            description: 'Create comprehensive project documentation including README, API docs, and user guides.',
            priority: 'high',
            effort: 3,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days from now
          },
          {
            title: 'Design user interface mockups',
            description: 'Create wireframes and mockups for the new dashboard interface.',
            priority: 'medium',
            effort: 2,
            dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 5 days from now
          },
          {
            title: 'Research third-party integrations',
            description: 'Investigate available APIs and services for payment processing and analytics.',
            priority: 'low',
            effort: 1,
            dueDate: null
          },
          // In Progress Column (3 tasks)
          {
            title: 'Implement user authentication',
            description: 'Build secure login system with JWT tokens and password hashing.',
            priority: 'urgent',
            effort: 5,
            dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 3 days from now
          },
          {
            title: 'Create database schema',
            description: 'Design and implement the database structure with proper relationships and indexes.',
            priority: 'high',
            effort: 4,
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 2 days from now
          },
          {
            title: 'Set up CI/CD pipeline',
            description: 'Configure automated testing and deployment workflows using GitHub Actions.',
            priority: 'medium',
            effort: 3,
            dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 4 days from now
          },
          // Testing Column (3 tasks)
          {
            title: 'Write unit tests for API endpoints',
            description: 'Create comprehensive test coverage for all REST API endpoints.',
            priority: 'high',
            effort: 2,
            dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 1 day from now
          },
          {
            title: 'Perform security audit',
            description: 'Review code for security vulnerabilities and implement necessary fixes.',
            priority: 'urgent',
            effort: 3,
            dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 2 days from now
          },
          {
            title: 'Test cross-browser compatibility',
            description: 'Ensure the application works correctly across different browsers and devices.',
            priority: 'medium',
            effort: 2,
            dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 3 days from now
          },
          // Completed Column (3 tasks)
          {
            title: 'Project planning and requirements gathering',
            description: 'Conducted stakeholder interviews and documented all project requirements.',
            priority: 'medium',
            effort: 2,
            dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 5 days ago
          },
          {
            title: 'Set up development environment',
            description: 'Configured local development setup with all necessary tools and dependencies.',
            priority: 'low',
            effort: 1,
            dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 3 days ago
          },
          {
            title: 'Create initial project structure',
            description: 'Set up the basic project architecture and folder structure.',
            priority: 'medium',
            effort: 1,
            dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 2 days ago
          },
          // Archive Column (3 tasks)
          {
            title: 'Legacy feature removal',
            description: 'Removed deprecated features that are no longer needed in the current version.',
            priority: 'low',
            effort: 1,
            dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 10 days ago
          },
          {
            title: 'Old documentation cleanup',
            description: 'Archived outdated documentation and updated references to current versions.',
            priority: 'low',
            effort: 1,
            dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days ago
          },
          {
            title: 'Deprecated API endpoint removal',
            description: 'Removed old API endpoints that have been replaced by newer versions.',
            priority: 'medium',
            effort: 2,
            dueDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 14 days ago
          }
        ];

        // Insert demo tasks
        const taskStmt = db.prepare(`
          INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        demoTasks.forEach((task, index) => {
          const taskId = crypto.randomUUID();
          const ticketNumber = String(index + 2).padStart(5, '0'); // TASK-00002, TASK-00003, etc.
          const columnIndex = Math.floor(index / 3); // 0-4 for each column
          const positionInColumn = index % 3; // 0-2 within each column
          
          taskStmt.run(
            taskId,
            task.title,
            task.description,
            `TASK-${ticketNumber}`,
            demoMember.id,
            demoMember.id,
            today,
            task.dueDate,
            task.effort,
            task.priority,
            defaultColumns[columnIndex].id,
            boardId,
            positionInColumn + 1, // +1 because welcome task is at position 0
            now,
            now
          );
        });

        console.log('✅ Created 15 additional demo tasks for enhanced demo experience');
      }
    }
  }

  // Database migrations
  try {
    // Ensure members table has created_at column (migration)
    db.prepare('ALTER TABLE members ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP').run();
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add dueDate column to tasks table (migration)  
    db.prepare('ALTER TABLE tasks ADD COLUMN dueDate TEXT').run();
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add position column to priorities table (migration)
    db.prepare('ALTER TABLE priorities ADD COLUMN position INTEGER NOT NULL DEFAULT 0').run();
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add projectFilter column to views table (migration)
    db.prepare('ALTER TABLE views ADD COLUMN projectFilter TEXT').run();
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add taskFilter column to views table (migration)
    db.prepare('ALTER TABLE views ADD COLUMN taskFilter TEXT').run();
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add boardColumnFilter column to views table (migration)
    db.prepare('ALTER TABLE views ADD COLUMN boardColumnFilter TEXT').run();
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add force_logout column to users table (migration)
    db.prepare('ALTER TABLE users ADD COLUMN force_logout INTEGER DEFAULT 0').run();
  } catch (error) {
    // Column already exists, ignore error
  }

  try {
    // Add is_archived column to columns table (migration)
    db.prepare('ALTER TABLE columns ADD COLUMN is_archived BOOLEAN DEFAULT 0').run();
  } catch (error) {
    // Column already exists, ignore error
  }


  // Clean up orphaned members (members without corresponding users)
  try {
    const orphanedMembers = db.prepare(`
      SELECT m.id 
      FROM members m 
      LEFT JOIN users u ON m.user_id = u.id 
      WHERE u.id IS NULL AND m.user_id IS NOT NULL
    `).all();

    if (orphanedMembers.length > 0) {
      const deleteMemberStmt = db.prepare('DELETE FROM members WHERE id = ?');
      orphanedMembers.forEach(member => {
        deleteMemberStmt.run(member.id);
      });

    }
  } catch (error) {
    console.error('Error cleaning up orphaned members:', error);
  }

  // Update APP_VERSION from environment variable on every startup (if present and different)
  if (process.env.APP_VERSION) {
    const currentVersion = db.prepare('SELECT value FROM settings WHERE key = ?').get('APP_VERSION');
    
    if (!currentVersion) {
      // APP_VERSION doesn't exist in settings, insert it
      db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
        .run('APP_VERSION', process.env.APP_VERSION);
      console.log(`✅ Initialized APP_VERSION=${process.env.APP_VERSION} from environment variable`);
    } else if (currentVersion.value !== process.env.APP_VERSION) {
      // APP_VERSION has changed, update it
      db.prepare('UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?')
        .run(process.env.APP_VERSION, 'APP_VERSION');
      console.log(`✅ Updated APP_VERSION from ${currentVersion.value} to ${process.env.APP_VERSION}`);
    }
  }
};

export default initializeDatabase;
