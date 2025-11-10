import crypto from 'crypto';
import bcrypt from 'bcrypt';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Utility function to create letter avatars
 */
function createLetterAvatar(letter, userId, color) {
  try {
    const size = 100;
    
    const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${color}"/>
      <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.6}" 
            fill="white" text-anchor="middle" dominant-baseline="central" font-weight="bold">${letter}</text>
    </svg>`;
    
    const filename = `demo-${letter.toLowerCase()}-${Date.now()}.svg`;
    const avatarsDir = join(dirname(__dirname), 'avatars');
    
    // Ensure avatars directory exists
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }
    
    const filePath = join(avatarsDir, filename);
    fs.writeFileSync(filePath, svg);
    
    console.log(`✅ Created demo avatar: ${filename}`);
    return `/avatars/${filename}`;
  } catch (error) {
    console.error('Error creating demo avatar:', error);
    return null;
  }
}

/**
 * Utility function to generate random passwords
 */
function generateRandomPassword(length = 12) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

/**
 * Create demo users (only called when DEMO_ENABLED=true)
 * @param {Object} db - Database instance
 * @returns {Array} Array of demo user objects with credentials
 */
export function createDemoUsers(db) {
  if (process.env.DEMO_ENABLED !== 'true') {
    return [];
  }

  console.log('👥 Creating demo users...');

  const demoUsers = [
    {
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@demo.local',
      color: '#3B82F6', // Blue - distinctive and professional
      letter: 'J'
    },
    {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@demo.local',
      color: '#10B981', // Green - fresh and vibrant
      letter: 'S'
    },
    {
      firstName: 'Mike',
      lastName: 'Davis',
      email: 'mike.davis@demo.local',
      color: '#F59E0B', // Amber/Orange - warm and energetic
      letter: 'M'
    }
  ];

  const userRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id;
  const createdUsers = [];

  demoUsers.forEach(user => {
    const userId = crypto.randomUUID();
    const password = generateRandomPassword(12);
    const passwordHash = bcrypt.hashSync(password, 10);
    const avatarPath = createLetterAvatar(user.letter, userId, user.color);

    // Create user
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path) 
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, user.email, passwordHash, user.firstName, user.lastName, avatarPath);

    // Assign user role
    db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)').run(userId, userRoleId);

    // Store password in settings for easy retrieval
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      `DEMO_PASSWORD_${user.email}`,
      password
    );

    createdUsers.push({
      id: userId,
      email: user.email,
      password,
      firstName: user.firstName,
      lastName: user.lastName,
      color: user.color
    });

    console.log(`✅ Created demo user: ${user.firstName} ${user.lastName} (${user.email})`);
  });

  return createdUsers;
}

/**
 * Initialize demo data for the application
 * Creates demo users and tasks for an existing board
 * @param {Object} db - Database instance
 * @param {string} boardId - Existing board ID to add demo data to
 * @param {Array} columns - Array of existing column objects
 */
export function initializeDemoData(db, boardId, columns) {
  if (process.env.DEMO_ENABLED !== 'true') {
    console.log('⏭️  Demo data initialization skipped (DEMO_ENABLED is not true)');
    return;
  }

  console.log('🎭 Initializing demo data...');
  
  // Initialize demo settings
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('STORAGE_USED', '0');
  console.log('✅ Set STORAGE_USED=0 for demo');
  
  // Create demo users first
  const demoUsers = createDemoUsers(db);
  if (demoUsers.length === 0) {
    console.log('⚠️  No demo users created, skipping demo data');
    return;
  }

  // Create members for demo users
  const members = demoUsers.map(user => {
    const memberId = crypto.randomUUID();
    db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)').run(
      memberId,
      `${user.firstName} ${user.lastName}`,
      user.color,
      user.id
    );
    return { id: memberId, name: `${user.firstName} ${user.lastName}`, userId: user.id };
  });

  console.log(`✅ Created ${members.length} team members`);

  // Get the project identifier for the board
  const board = db.prepare('SELECT project FROM boards WHERE id = ?').get(boardId);
  const projectIdentifier = board?.project || 'PROJ-0001';

  const now = new Date().toISOString();
  const today = new Date().toISOString().split('T')[0];
  
  // Calculate sprint start date for task timing (14 days ago)
  const sprintStartForTasks = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  // Demo tasks data - each assigned to a specific member
  // All tasks start at or before sprint start, so they appear in initial burndown
  const demoTasks = [
    // To Do Column (3 tasks) - not yet started or just started
    {
      title: 'Set up project documentation',
      description: 'Create comprehensive project documentation including README, API docs, and user guides.',
      priority: 'high',
      effort: 3,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
      assignedTo: 0 // John Smith
    },
    {
      title: 'Design user interface mockups',
      description: 'Create wireframes and mockups for the new dashboard interface.',
      priority: 'medium',
      effort: 2,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 days from now
      assignedTo: 1 // Sarah Johnson
    },
    {
      title: 'Research third-party integrations',
      description: 'Investigate available APIs and services for payment processing and analytics.',
      priority: 'low',
      effort: 1,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: null,
      assignedTo: 2 // Mike Davis
    },
    // In Progress Column (3 tasks) - actively being worked on
    {
      title: 'Implement user authentication',
      description: 'Build secure login system with JWT tokens and password hashing.',
      priority: 'urgent',
      effort: 5,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days from now
      assignedTo: 2 // Mike Davis
    },
    {
      title: 'Create database schema',
      description: 'Design and implement the database structure with proper relationships and indexes.',
      priority: 'high',
      effort: 4,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days from now
      assignedTo: 0 // John Smith
    },
    {
      title: 'Set up CI/CD pipeline',
      description: 'Configure automated testing and deployment workflows using GitHub Actions.',
      priority: 'medium',
      effort: 3,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 4 days from now
      assignedTo: 1 // Sarah Johnson
    },
    // Testing Column (3 tasks) - in testing phase
    {
      title: 'Write unit tests for API endpoints',
      description: 'Create comprehensive test coverage for all REST API endpoints.',
      priority: 'high',
      effort: 2,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 day from now
      assignedTo: 1 // Sarah Johnson
    },
    {
      title: 'Perform security audit',
      description: 'Review code for security vulnerabilities and implement necessary fixes.',
      priority: 'urgent',
      effort: 3,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days from now
      assignedTo: 2 // Mike Davis
    },
    {
      title: 'Test cross-browser compatibility',
      description: 'Ensure the application works correctly across different browsers and devices.',
      priority: 'medium',
      effort: 2,
      startDate: sprintStartForTasks, // Sprint start
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days from now
      assignedTo: 0 // John Smith
    },
    // Completed Column (3 tasks)
    {
      title: 'Project planning and requirements gathering',
      description: 'Conducted stakeholder interviews and documented all project requirements.',
      priority: 'medium',
      effort: 2,
      startDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Started 12 days ago
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Due 5 days ago
      completedDate: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Completed 6 days ago
      assignedTo: 0 // John Smith
    },
    {
      title: 'Set up development environment',
      description: 'Configured local development setup with all necessary tools and dependencies.',
      priority: 'low',
      effort: 1,
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Started 10 days ago
      dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Due 3 days ago
      completedDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Completed 4 days ago
      assignedTo: 1 // Sarah Johnson
    },
    {
      title: 'Create initial project structure',
      description: 'Set up the basic project architecture and folder structure.',
      priority: 'medium',
      effort: 1,
      startDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Started 9 days ago
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Due 2 days ago
      completedDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Completed 3 days ago
      assignedTo: 2 // Mike Davis
    },
    // Archive Column (3 tasks)
    {
      title: 'Legacy feature removal',
      description: 'Removed deprecated features that are no longer needed in the current version.',
      priority: 'low',
      effort: 1,
      startDate: new Date(Date.now() - 17 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Started 17 days ago
      dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Due 10 days ago
      completedDate: new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Completed 11 days ago
      assignedTo: 2 // Mike Davis
    },
    {
      title: 'Old documentation cleanup',
      description: 'Archived outdated documentation and updated references to current versions.',
      priority: 'low',
      effort: 1,
      startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Started 14 days ago
      dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Due 7 days ago
      completedDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Completed 8 days ago
      assignedTo: 0 // John Smith
    },
    {
      title: 'Deprecated API endpoint removal',
      description: 'Removed old API endpoints that have been replaced by newer versions.',
      priority: 'medium',
      effort: 2,
      startDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Started 20 days ago
      dueDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Due 14 days ago
      completedDate: new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Completed 13 days ago
      assignedTo: 1 // Sarah Johnson
    }
  ];

  // Insert demo tasks
  const taskStmt = db.prepare(`
    INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position, created_at, updated_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createdTasks = []; // Store task info for later use (relationships, leaderboard, etc.)
  
  demoTasks.forEach((task, index) => {
    const taskId = crypto.randomUUID();
    const ticketNumber = String(index + 1).padStart(5, '0'); // TASK-00001, TASK-00002, etc.
    const columnIndex = Math.floor(index / 3); // 0-4 for each column
    const positionInColumn = index % 3; // 0-2 within each column
    
    const assignedMember = members[task.assignedTo];
    
    taskStmt.run(
      taskId,
      task.title,
      task.description,
      `TASK-${ticketNumber}`, // Fixed format: TASK-00001, TASK-00002, etc.
      assignedMember.id,
      assignedMember.id, // Requester is same as assignee for demo
      task.startDate || today, // Use task's startDate if provided
      task.dueDate,
      task.effort,
      task.priority,
      columns[columnIndex].id,
      boardId,
      positionInColumn,
      now,
      now
    );
    
    // Store task info for later use
    createdTasks.push({
      id: taskId,
      ticket: `TASK-${ticketNumber}`,
      columnIndex: columnIndex,
      memberId: assignedMember.id,
      completedDate: task.completedDate || null,
      effort: task.effort
    });
  });

  console.log(`✅ Created ${demoTasks.length} demo tasks assigned to team members`);

  // Create a sprint with realistic dates (started 2 weeks ago, ends in 1 week)
  const sprintStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sprintEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sprintId = crypto.randomUUID();
  
  db.prepare(`
    INSERT INTO planning_periods (id, name, start_date, end_date, description, is_active, board_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sprintId,
    'Sprint 1 - Demo Sprint',
    sprintStartDate,
    sprintEndDate,
    'Complete initial project setup and core features',
    1, // is_active
    boardId, // board_id
    now,
    now
  );

  console.log(`✅ Created demo sprint: Sprint 1 (${sprintStartDate} to ${sprintEndDate})`);

  // Note: sprint_tasks table doesn't exist yet, so we're not assigning tasks to sprints
  // TODO: Uncomment when sprint_tasks table is created
  /*
  // Assign all tasks to the sprint
  const createdTaskIds = db.prepare('SELECT id FROM tasks WHERE boardId = ?').all(boardId).map(t => t.id);
  const sprintTaskStmt = db.prepare('INSERT INTO sprint_tasks (sprint_id, task_id) VALUES (?, ?)');
  createdTaskIds.forEach(taskId => {
    sprintTaskStmt.run(sprintId, taskId);
  });
  */

  // TODO: Update completed tasks with realistic completion dates
  // Disabled because completed_at column doesn't exist in tasks table yet
  /*
  const completedColumnId = columns.find(c => c.title === 'Completed')?.id;
  const completedTasks = db.prepare('SELECT id FROM tasks WHERE columnId = ? AND boardId = ?').all(completedColumnId, boardId);
  
  completedTasks.forEach((task, index) => {
    // Spread completions: 10 days ago, 8 days ago, 5 days ago
    const daysAgo = [10, 8, 5][index] || 3;
    const completedDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    
    db.prepare('UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?').run(
      completedDate,
      completedDate,
      task.id
    );
  });
  */

  // TODO: Update archived tasks with older completion dates
  // Disabled because completed_at column doesn't exist in tasks table yet
  /*
  const archiveColumnId = columns.find(c => c.title === 'Archive')?.id;
  const archivedTasks = db.prepare('SELECT id FROM tasks WHERE columnId = ? AND boardId = ?').all(archiveColumnId, boardId);
  
  archivedTasks.forEach((task, index) => {
    // Archived tasks completed 14, 12, 11 days ago
    const daysAgo = [14, 12, 11][index] || 10;
    const completedDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    
    db.prepare('UPDATE tasks SET completed_at = ?, updated_at = ? WHERE id = ?').run(
      completedDate,
      completedDate,
      task.id
    );
  });
  */

  // console.log(`✅ Updated ${completedTasks.length + archivedTasks.length} tasks with completion dates`);

  // Create tags
  const tags = [
    { name: 'frontend', color: '#3B82F6' },
    { name: 'backend', color: '#10B981' },
    { name: 'database', color: '#8B5CF6' },
    { name: 'security', color: '#EF4444' },
    { name: 'documentation', color: '#F59E0B' },
    { name: 'testing', color: '#EC4899' }
  ];

  const tagIds = {};
  tags.forEach(tagData => {
    const result = db.prepare('INSERT INTO tags (tag, color) VALUES (?, ?)').run(tagData.name, tagData.color);
    tagIds[tagData.name] = result.lastInsertRowid;
  });

  console.log(`✅ Created ${tags.length} tags`);

  // Assign tags to tasks (get fresh task list with IDs)
  const allTasks = db.prepare(`
    SELECT t.id, t.title 
    FROM tasks t 
    WHERE t.boardId = ? 
    ORDER BY t.position
  `).all(boardId);

  // Tag assignments (based on task titles/descriptions)
  const tagAssignments = [
    { taskIndex: 0, tags: ['documentation'] }, // Set up project documentation
    { taskIndex: 1, tags: ['frontend'] }, // Design user interface mockups
    { taskIndex: 2, tags: ['backend'] }, // Research third-party integrations
    { taskIndex: 3, tags: ['backend', 'security'] }, // Implement user authentication
    { taskIndex: 4, tags: ['database', 'backend'] }, // Create database schema
    { taskIndex: 5, tags: ['backend'] }, // Set up CI/CD pipeline
    { taskIndex: 6, tags: ['backend', 'testing'] }, // Write unit tests for API endpoints
    { taskIndex: 7, tags: ['security', 'backend'] }, // Perform security audit
    { taskIndex: 8, tags: ['frontend', 'testing'] }, // Test cross-browser compatibility
    { taskIndex: 9, tags: ['documentation'] }, // Project planning and requirements gathering
    { taskIndex: 12, tags: ['backend'] }, // Deprecated API endpoint removal
  ];

  const taskTagStmt = db.prepare('INSERT INTO task_tags (taskId, tagId) VALUES (?, ?)');
  tagAssignments.forEach(assignment => {
    if (allTasks[assignment.taskIndex]) {
      assignment.tags.forEach(tagName => {
        taskTagStmt.run(allTasks[assignment.taskIndex].id, tagIds[tagName]);
      });
    }
  });

  console.log(`✅ Assigned tags to tasks`);

  // Create task relationships (parent/child dependencies)
  const relationships = [
    // "Create database schema" is parent of "Implement user authentication" 
    { parentIndex: 4, childIndex: 3, type: 'parent' },
    // "Implement user authentication" is parent of "Write unit tests"
    { parentIndex: 3, childIndex: 6, type: 'parent' },
    // "Project planning" is parent of "Set up project documentation"
    { parentIndex: 9, childIndex: 0, type: 'parent' },
    // "Design user interface mockups" related to "Test cross-browser compatibility"
    { task1Index: 1, task2Index: 8, type: 'related' },
  ];

  const relationshipStmt = db.prepare(`
    INSERT INTO task_rels (task_id, relationship, to_task_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  let relationshipCount = 0;
  relationships.forEach(rel => {
    if (rel.type === 'parent' && allTasks[rel.parentIndex] && allTasks[rel.childIndex]) {
      // Create parent relationship
      relationshipStmt.run(
        allTasks[rel.parentIndex].id,
        'parent',
        allTasks[rel.childIndex].id,
        now,
        now
      );
      // Create inverse child relationship
      relationshipStmt.run(
        allTasks[rel.childIndex].id,
        'child',
        allTasks[rel.parentIndex].id,
        now,
        now
      );
      relationshipCount += 2;
    } else if (rel.type === 'related' && allTasks[rel.task1Index] && allTasks[rel.task2Index]) {
      // Create related relationship (bidirectional)
      relationshipStmt.run(
        allTasks[rel.task1Index].id,
        'related',
        allTasks[rel.task2Index].id,
        now,
        now
      );
      relationshipStmt.run(
        allTasks[rel.task2Index].id,
        'related',
        allTasks[rel.task1Index].id,
        now,
        now
      );
      relationshipCount += 2;
    }
  });

  console.log(`✅ Created ${relationshipCount} task relationships (${relationships.length} logical relationships)`);


  // Create comments on tasks
  const comments = [
    {
      taskIndex: 3,
      memberId: members[1].id, // Sarah
      text: 'Started implementing JWT token authentication. Should be ready by EOD tomorrow.',
      createdDaysAgo: 2
    },
    {
      taskIndex: 3,
      memberId: members[0].id, // John
      text: 'Great! Make sure to add refresh token functionality as well.',
      createdDaysAgo: 2
    },
    {
      taskIndex: 4,
      memberId: members[0].id, // John
      text: 'Database schema design is complete. Moving to implementation phase.',
      createdDaysAgo: 5
    },
    {
      taskIndex: 6,
      memberId: members[1].id, // Sarah
      text: 'Added test coverage for all authentication endpoints. Coverage is now at 85%.',
      createdDaysAgo: 1
    },
    {
      taskIndex: 7,
      memberId: members[2].id, // Mike
      text: 'Found a few SQL injection vulnerabilities. Creating tasks to fix them.',
      createdDaysAgo: 3
    },
    {
      taskIndex: 7,
      memberId: members[0].id, // John
      text: 'Thanks for catching those! Let\'s prioritize the fixes.',
      createdDaysAgo: 3
    },
    {
      taskIndex: 0,
      memberId: members[0].id, // John
      text: 'Working on API documentation. Will use OpenAPI/Swagger format.',
      createdDaysAgo: 1
    },
  ];

  const commentStmt = db.prepare(`
    INSERT INTO comments (id, taskId, authorId, text, createdAt, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  comments.forEach(comment => {
    if (allTasks[comment.taskIndex]) {
      const commentDate = new Date(Date.now() - comment.createdDaysAgo * 24 * 60 * 60 * 1000).toISOString();
      
      commentStmt.run(
        crypto.randomUUID(),
        allTasks[comment.taskIndex].id,
        comment.memberId, // authorId references members(id)
        comment.text,
        commentDate,
        commentDate
      );
    }
  });

  console.log(`✅ Created ${comments.length} comments on tasks`);

  // Create activity events for leaderboard data
  // These events track user actions and provide data for the leaderboard
  const activityEvents = [
    // Completed tasks (column 3 - indexes 9, 10, 11)
    { taskIndex: 9, memberId: members[0].id, action: 'completed', daysAgo: 6 }, // John completed Project planning
    { taskIndex: 10, memberId: members[1].id, action: 'completed', daysAgo: 4 }, // Sarah completed Set up dev environment
    { taskIndex: 11, memberId: members[2].id, action: 'completed', daysAgo: 3 }, // Mike completed Create initial structure
    
    // Archived tasks (column 4 - indexes 12, 13, 14)
    { taskIndex: 12, memberId: members[2].id, action: 'completed', daysAgo: 11 }, // Mike completed Legacy feature removal
    { taskIndex: 13, memberId: members[0].id, action: 'completed', daysAgo: 8 }, // John completed Old docs cleanup
    { taskIndex: 14, memberId: members[1].id, action: 'completed', daysAgo: 13 }, // Sarah completed Deprecated API removal
    
    // Task creations (distributed over last 2 weeks)
    { taskIndex: 0, memberId: members[0].id, action: 'created', daysAgo: 12 },
    { taskIndex: 1, memberId: members[1].id, action: 'created', daysAgo: 11 },
    { taskIndex: 2, memberId: members[2].id, action: 'created', daysAgo: 10 },
    { taskIndex: 3, memberId: members[2].id, action: 'created', daysAgo: 9 },
    { taskIndex: 4, memberId: members[0].id, action: 'created', daysAgo: 8 },
    { taskIndex: 5, memberId: members[1].id, action: 'created', daysAgo: 7 },
    
    // Comments (add some activity points for engagement)
    { taskIndex: 1, memberId: members[0].id, action: 'commented', daysAgo: 5 },
    { taskIndex: 3, memberId: members[1].id, action: 'commented', daysAgo: 4 },
    { taskIndex: 7, memberId: members[2].id, action: 'commented', daysAgo: 3 },
    { taskIndex: 7, memberId: members[0].id, action: 'commented', daysAgo: 3 },
    { taskIndex: 0, memberId: members[0].id, action: 'commented', daysAgo: 1 },
  ];

  const activityStmt = db.prepare(`
    INSERT INTO activity_events (
      id, event_type, user_id, user_name, user_email,
      task_id, task_title, task_ticket, board_id, board_name,
      effort_points, priority_name, created_at,
      period_year, period_month, period_week
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let activityCount = 0;
  activityEvents.forEach(event => {
    if (createdTasks[event.taskIndex]) {
      const task = createdTasks[event.taskIndex];
      const member = members.find(m => m.id === event.memberId);
      if (!member) return;
      
      const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(member.userId);
      if (!user) return;
      
      const eventTimestamp = new Date(Date.now() - event.daysAgo * 24 * 60 * 60 * 1000);
      const eventDate = eventTimestamp.toISOString();
      
      // Calculate period info
      const periodYear = eventTimestamp.getFullYear();
      const periodMonth = eventTimestamp.getMonth() + 1;
      const periodWeek = Math.ceil((eventTimestamp.getDate() + new Date(eventTimestamp.getFullYear(), eventTimestamp.getMonth(), 1).getDay()) / 7);
      
      let eventType = event.action;
      
      // Map actions to match activity_events event types
      if (event.action === 'completed') {
        eventType = 'task_completed';
      } else if (event.action === 'created') {
        eventType = 'task_created';
      } else if (event.action === 'commented') {
        eventType = 'comment_added';
      }
      
      activityStmt.run(
        crypto.randomUUID(),
        eventType,
        user.id,
        member.name,
        user.email,
        task.id,
        demoTasks[event.taskIndex].title,
        task.ticket,
        boardId,
        board?.name || 'Main Board',
        event.action === 'completed' ? task.effort : null,
        demoTasks[event.taskIndex].priority,
        eventDate,
        periodYear,
        periodMonth,
        periodWeek
      );
      
      activityCount++;
    }
  });

  console.log(`✅ Created ${activityCount} activity events for leaderboard`);

  // Populate user_points table for leaderboard
  console.log('📊 Populating user_points for leaderboard...');
  
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  // Get point values from settings (using defaults)
  const POINTS = {
    TASK_CREATED: 5,
    TASK_COMPLETED: 10,
    EFFORT_MULTIPLIER: 2,
    COMMENT_ADDED: 2
  };
  
  // Calculate points for each demo user
  const userPointsData = [];
  
  members.forEach(member => {
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(member.userId);
    if (!user) return;
    
    // Count activities for this user
    const userEvents = activityEvents.filter(e => e.memberId === member.id);
    
    let totalPoints = 0;
    let tasksCreated = 0;
    let tasksCompleted = 0;
    let totalEffortCompleted = 0;
    let commentsAdded = 0;
    
    userEvents.forEach(event => {
      const task = createdTasks[event.taskIndex];
      if (!task) return;
      
      if (event.action === 'created') {
        tasksCreated++;
        totalPoints += POINTS.TASK_CREATED;
      } else if (event.action === 'completed') {
        tasksCompleted++;
        const effort = task.effort || 0;
        totalEffortCompleted += effort;
        totalPoints += POINTS.TASK_COMPLETED + (effort * POINTS.EFFORT_MULTIPLIER);
      } else if (event.action === 'commented') {
        commentsAdded++;
        totalPoints += POINTS.COMMENT_ADDED;
      }
    });
    
    if (totalPoints > 0 || tasksCreated > 0 || tasksCompleted > 0) {
      userPointsData.push({
        userId: user.id,
        userName: member.name,
        totalPoints,
        tasksCreated,
        tasksCompleted,
        totalEffortCompleted,
        commentsAdded
      });
    }
  });
  
  // Insert user_points records
  const userPointsStmt = db.prepare(`
    INSERT INTO user_points (
      id, user_id, user_name, total_points, tasks_completed, 
      total_effort_completed, comments_added, tasks_created, collaborations,
      period_year, period_month, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  userPointsData.forEach(data => {
    userPointsStmt.run(
      crypto.randomUUID(),
      data.userId,
      data.userName,
      data.totalPoints,
      data.tasksCompleted,
      data.totalEffortCompleted,
      data.commentsAdded,
      data.tasksCreated,
      0, // collaborations
      currentYear,
      currentMonth,
      now
    );
  });
  
  console.log(`✅ Created ${userPointsData.length} user_points records for leaderboard`);
  
  // Populate task_snapshots for burndown chart
  console.log('📸 Creating task snapshots for burndown chart...');
  
  // Create snapshots for each day of the sprint
  const sprintStart = new Date(sprintStartDate);
  const sprintEnd = new Date(sprintEndDate);
  const todayDate = new Date();
  
  // Calculate how many days to create snapshots for (from sprint start to today or sprint end, whichever is earlier)
  const snapshotEndDate = todayDate < sprintEnd ? todayDate : sprintEnd;
  
  let snapshotCount = 0;
  let currentDate = new Date(sprintStart);
  
  while (currentDate <= snapshotEndDate) {
    const snapshotDateStr = currentDate.toISOString().split('T')[0];
    
    // For each task, create a snapshot showing its state on that date
    createdTasks.forEach((task, index) => {
      const taskData = demoTasks[index];
      const taskStartDate = new Date(taskData.startDate || sprintStartDate);
      
      // Only create snapshot if task was created by this date
      if (taskStartDate <= currentDate) {
        // Determine if task is completed by this date
        const taskCompletedDate = task.completedDate ? new Date(task.completedDate) : null;
        const isCompleted = taskCompletedDate && taskCompletedDate <= currentDate ? 1 : 0;
        
        // Get column based on completion status
        const column = columns[task.columnIndex];
        
        // Get tags for this task
        const taskTagsResult = db.prepare('SELECT tagId FROM task_tags WHERE taskId = ?').all(task.id);
        const taskTagsList = taskTagsResult.map(tt => {
          const tag = db.prepare('SELECT tag, color FROM tags WHERE id = ?').get(tt.tagId);
          return tag ? tag.tag : null;
        }).filter(Boolean);
        
        // Find the assignee member
        const assigneeMember = members.find(m => m.id === task.memberId);
        const assigneeName = assigneeMember ? assigneeMember.name : 'Unknown';
        
        db.prepare(`
          INSERT OR IGNORE INTO task_snapshots (
            id, snapshot_date, task_id, task_title, task_ticket, task_description,
            board_id, board_name, column_id, column_name,
            assignee_id, assignee_name, requester_id, requester_name,
            effort_points, priority_name, tags, status, is_completed, is_deleted, created_at, completed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          snapshotDateStr,
          task.id,
          taskData.title,
          task.ticket,
          taskData.description,
          boardId,
          board?.name || 'Main Board',
          column.id,
          column.title,
          task.memberId,
          assigneeName,
          task.memberId, // requester same as assignee for demo
          assigneeName,
          task.effort || 0,
          taskData.priority,
          taskTagsList.length > 0 ? JSON.stringify(taskTagsList) : null,
          isCompleted ? 'completed' : 'in_progress',
          isCompleted, // is_completed flag for burndown chart
          0, // is_deleted
          taskStartDate.toISOString(),
          taskCompletedDate ? taskCompletedDate.toISOString() : null
        );
        
        snapshotCount++;
      }
    });
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  console.log(`✅ Created ${snapshotCount} task snapshots for burndown chart`);

  console.log('');
  console.log('🎉 Demo data initialization complete!');
  console.log(`   📊 Sprint: ${sprintStartDate} to ${sprintEndDate}`);
  console.log(`   📝 ${demoTasks.length} tasks with historical completion data`);
  console.log(`   💬 ${comments.length} comments showing collaboration`);
  console.log(`   🏷️  ${tags.length} tags for organization`);
  console.log(`   🔗 ${relationships.length} task dependencies/blockers`);
  console.log(`   📈 ${activityCount} activity events for reporting`);
  console.log(`   🏆 ${userPointsData.length} user leaderboard entries`);
  console.log(`   📸 ${snapshotCount} task snapshots for burndown`);
}

