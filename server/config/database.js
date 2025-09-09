import Database from 'better-sqlite3';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  return process.env.NODE_ENV === 'development' && process.env.DOCKER_ENV 
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
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

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_watchers_taskId ON watchers(taskId);
    CREATE INDEX IF NOT EXISTS idx_watchers_memberId ON watchers(memberId);
    CREATE INDEX IF NOT EXISTS idx_collaborators_taskId ON collaborators(taskId);
    CREATE INDEX IF NOT EXISTS idx_collaborators_memberId ON collaborators(memberId);
    CREATE INDEX IF NOT EXISTS idx_user_settings_userId ON user_settings(userId);
  `);
};

// Initialize default data
const initializeDefaultData = (db) => {
  // Initialize authentication data if no roles exist
  const rolesCount = db.prepare('SELECT COUNT(*) as count FROM roles').get().count;
  if (rolesCount === 0) {
    // Insert default roles
    db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run('admin', 'Administrator role');
    db.prepare('INSERT INTO roles (name, description) VALUES (?, ?)').run('user', 'Regular user role');

    // Create default admin user
    const adminId = crypto.randomUUID();
    const adminPasswordHash = bcrypt.hashSync('admin', 10);
    
    // Create admin avatar
    const adminAvatarPath = createLetterAvatar('A', adminId, 'admin');
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(adminId, 'admin@example.com', adminPasswordHash, 'Admin', 'User', adminAvatarPath);

    // Assign admin role to default user
    const adminRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('admin').id;
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(adminId, adminRoleId);

    // Initialize default settings
    const defaultSettings = [
      ['SITE_NAME', 'Easy Kanban'],
      ['SITE_URL', '/'],
      ['MAIL_ENABLED', 'false'],
      ['MAIL_HOST', ''],
      ['MAIL_PORT', '587'],
      ['MAIL_USER', ''],
      ['MAIL_PASS', ''],
      ['MAIL_FROM', ''],
      ['GOOGLE_CLIENT_ID', ''],
      ['GOOGLE_CLIENT_SECRET', ''],
      ['GOOGLE_SSO_DEBUG', 'false'],
      // Admin-configurable user preference defaults
      ['DEFAULT_VIEW_MODE', 'kanban'], // Default view mode for new users
      ['DEFAULT_TASK_VIEW_MODE', 'expand'], // Default task view mode for new users
      ['DEFAULT_ACTIVITY_FEED_POSITION', '{"x": 0, "y": 443}'], // Default activity feed position
      ['DEFAULT_ACTIVITY_FEED_WIDTH', '180'], // Default activity feed width
      ['DEFAULT_ACTIVITY_FEED_HEIGHT', '400'], // Default activity feed height
      // Project and task identification settings
      ['USE_PREFIXES', 'true'], // Enable project and task identification by default
      ['DEFAULT_PROJ_PREFIX', 'PROJ-'], // Default project prefix
      ['DEFAULT_TASK_PREFIX', 'TASK-'] // Default task prefix
    ];

    const settingsStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
    defaultSettings.forEach(([key, value]) => {
      settingsStmt.run(key, value);
    });

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
    // Create default demo user account
    const demoUserId = crypto.randomUUID();
    const demoPasswordHash = bcrypt.hashSync('demo', 10);
    
    const existingDemoUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@example.com');
    if (!existingDemoUser) {
      // Create demo avatar
      const demoAvatarPath = createLetterAvatar('D', demoUserId, 'demo');
      
      db.prepare(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path) 
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(demoUserId, 'demo@example.com', demoPasswordHash, 'Demo', 'User', demoAvatarPath);

      // Assign user role to demo user
      const userRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id;
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(demoUserId, userRoleId);

      // Create team member for demo user
      const demoMemberId = crypto.randomUUID();
      db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
        demoMemberId, 
        'Demo User', 
        '#4ECDC4', 
        demoUserId
      );
    }

    // Create default board
    const boardId = crypto.randomUUID();
    db.prepare('INSERT INTO boards (id, title, position) VALUES (?, ?, ?)').run(
      boardId, 
      'Project Board', 
      0
    );

    // Create default columns
    const defaultColumns = [
      { id: `todo-${boardId}`, title: 'To Do', position: 0 },
      { id: `progress-${boardId}`, title: 'In Progress', position: 1 },
      { id: `testing-${boardId}`, title: 'Testing', position: 2 },
      { id: `completed-${boardId}`, title: 'Completed', position: 3 }
    ];

    const columnStmt = db.prepare('INSERT INTO columns (id, boardId, title, position) VALUES (?, ?, ?, ?)');
    defaultColumns.forEach(col => {
      columnStmt.run(col.id, boardId, col.title, col.position);
    });

    // Create a sample task
    const demoMember = db.prepare('SELECT id FROM members WHERE user_id = ?').get(demoUserId);
    if (demoMember) {
      const taskId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO tasks (id, title, description, memberId, requesterId, startDate, effort, priority, columnId, boardId, position) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        'Welcome to Easy Kanban!',
        'This is a sample task to get you started. You can edit, move, or delete this task.',
        demoMember.id,
        demoMember.id,
        new Date().toISOString().split('T')[0],
        1,
        'medium',
        defaultColumns[0].id,
        boardId,
        0
      );
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
};

export default initializeDatabase;
