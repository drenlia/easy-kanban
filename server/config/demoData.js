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
      color: '#4ECDC4',
      letter: 'J'
    },
    {
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@demo.local',
      color: '#95E1D3',
      letter: 'S'
    },
    {
      firstName: 'Mike',
      lastName: 'Davis',
      email: 'mike.davis@demo.local',
      color: '#F38181',
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
  
  // Demo tasks data - each assigned to a specific member
  const demoTasks = [
    // To Do Column (3 tasks)
    {
      title: 'Set up project documentation',
      description: 'Create comprehensive project documentation including README, API docs, and user guides.',
      priority: 'high',
      effort: 3,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from now
      assignedTo: 0 // John Smith
    },
    {
      title: 'Design user interface mockups',
      description: 'Create wireframes and mockups for the new dashboard interface.',
      priority: 'medium',
      effort: 2,
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 days from now
      assignedTo: 1 // Sarah Johnson
    },
    {
      title: 'Research third-party integrations',
      description: 'Investigate available APIs and services for payment processing and analytics.',
      priority: 'low',
      effort: 1,
      dueDate: null,
      assignedTo: 2 // Mike Davis
    },
    // In Progress Column (3 tasks)
    {
      title: 'Implement user authentication',
      description: 'Build secure login system with JWT tokens and password hashing.',
      priority: 'urgent',
      effort: 5,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days from now
      assignedTo: 2 // Mike Davis
    },
    {
      title: 'Create database schema',
      description: 'Design and implement the database structure with proper relationships and indexes.',
      priority: 'high',
      effort: 4,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days from now
      assignedTo: 0 // John Smith
    },
    {
      title: 'Set up CI/CD pipeline',
      description: 'Configure automated testing and deployment workflows using GitHub Actions.',
      priority: 'medium',
      effort: 3,
      dueDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 4 days from now
      assignedTo: 1 // Sarah Johnson
    },
    // Testing Column (3 tasks)
    {
      title: 'Write unit tests for API endpoints',
      description: 'Create comprehensive test coverage for all REST API endpoints.',
      priority: 'high',
      effort: 2,
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 day from now
      assignedTo: 1 // Sarah Johnson
    },
    {
      title: 'Perform security audit',
      description: 'Review code for security vulnerabilities and implement necessary fixes.',
      priority: 'urgent',
      effort: 3,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days from now
      assignedTo: 2 // Mike Davis
    },
    {
      title: 'Test cross-browser compatibility',
      description: 'Ensure the application works correctly across different browsers and devices.',
      priority: 'medium',
      effort: 2,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days from now
      assignedTo: 0 // John Smith
    },
    // Completed Column (3 tasks)
    {
      title: 'Project planning and requirements gathering',
      description: 'Conducted stakeholder interviews and documented all project requirements.',
      priority: 'medium',
      effort: 2,
      dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 5 days ago
      assignedTo: 0 // John Smith
    },
    {
      title: 'Set up development environment',
      description: 'Configured local development setup with all necessary tools and dependencies.',
      priority: 'low',
      effort: 1,
      dueDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days ago
      assignedTo: 1 // Sarah Johnson
    },
    {
      title: 'Create initial project structure',
      description: 'Set up the basic project architecture and folder structure.',
      priority: 'medium',
      effort: 1,
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 2 days ago
      assignedTo: 2 // Mike Davis
    },
    // Archive Column (3 tasks)
    {
      title: 'Legacy feature removal',
      description: 'Removed deprecated features that are no longer needed in the current version.',
      priority: 'low',
      effort: 1,
      dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 10 days ago
      assignedTo: 2 // Mike Davis
    },
    {
      title: 'Old documentation cleanup',
      description: 'Archived outdated documentation and updated references to current versions.',
      priority: 'low',
      effort: 1,
      dueDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
      assignedTo: 0 // John Smith
    },
    {
      title: 'Deprecated API endpoint removal',
      description: 'Removed old API endpoints that have been replaced by newer versions.',
      priority: 'medium',
      effort: 2,
      dueDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 14 days ago
      assignedTo: 1 // Sarah Johnson
    }
  ];

  // Insert demo tasks
  const taskStmt = db.prepare(`
    INSERT INTO tasks (id, title, description, ticket, memberId, requesterId, startDate, dueDate, effort, priority, columnId, boardId, position, created_at, updated_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

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
      `${projectIdentifier}-${ticketNumber}`,
      assignedMember.id,
      assignedMember.id, // Requester is same as assignee for demo
      today,
      task.dueDate,
      task.effort,
      task.priority,
      columns[columnIndex].id,
      boardId,
      positionInColumn,
      now,
      now
    );
  });

  console.log(`✅ Created ${demoTasks.length} demo tasks assigned to team members`);

  // Create a sprint with realistic dates (started 2 weeks ago, ends in 1 week)
  const sprintStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sprintEndDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sprintId = crypto.randomUUID();
  
  db.prepare(`
    INSERT INTO sprints (id, name, start_date, end_date, goal, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sprintId,
    'Sprint 1 - Demo Sprint',
    sprintStartDate,
    sprintEndDate,
    'Complete initial project setup and core features',
    now,
    now
  );

  console.log(`✅ Created demo sprint: Sprint 1 (${sprintStartDate} to ${sprintEndDate})`);

  // Assign all tasks to the sprint
  const createdTaskIds = db.prepare('SELECT id FROM tasks WHERE boardId = ?').all(boardId).map(t => t.id);
  const sprintTaskStmt = db.prepare('INSERT INTO sprint_tasks (sprint_id, task_id) VALUES (?, ?)');
  createdTaskIds.forEach(taskId => {
    sprintTaskStmt.run(sprintId, taskId);
  });

  // Update completed tasks with realistic completion dates (spread over the last 2 weeks)
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

  // Update archived tasks with older completion dates
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

  console.log(`✅ Updated ${completedTasks.length + archivedTasks.length} tasks with completion dates`);

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
  tags.forEach(tag => {
    const tagId = crypto.randomUUID();
    db.prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)').run(tagId, tag.name, tag.color);
    tagIds[tag.name] = tagId;
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

  const taskTagStmt = db.prepare('INSERT INTO task_tags (task_id, tag_id) VALUES (?, ?)');
  tagAssignments.forEach(assignment => {
    if (allTasks[assignment.taskIndex]) {
      assignment.tags.forEach(tagName => {
        taskTagStmt.run(allTasks[assignment.taskIndex].id, tagIds[tagName]);
      });
    }
  });

  console.log(`✅ Assigned tags to tasks`);

  // Create task relationships (dependencies and blockers)
  const relationships = [
    // "Create database schema" blocks "Implement user authentication"
    { blockerIndex: 4, blockedIndex: 3, type: 'blocks' },
    // "Implement user authentication" depends on "Create database schema"
    { blockerIndex: 4, blockedIndex: 3, type: 'depends_on' },
    // "Write unit tests" depends on "Implement user authentication"
    { blockerIndex: 3, blockedIndex: 6, type: 'depends_on' },
    // "Project planning" blocks "Set up project documentation"
    { blockerIndex: 9, blockedIndex: 0, type: 'blocks' },
  ];

  const relationshipStmt = db.prepare(`
    INSERT INTO task_relationships (id, source_task_id, target_task_id, relationship_type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  relationships.forEach(rel => {
    if (allTasks[rel.blockerIndex] && allTasks[rel.blockedIndex]) {
      relationshipStmt.run(
        crypto.randomUUID(),
        allTasks[rel.blockerIndex].id,
        allTasks[rel.blockedIndex].id,
        rel.type,
        now
      );
    }
  });

  console.log(`✅ Created ${relationships.length} task relationships`);

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
    INSERT INTO comments (id, task_id, user_id, comment, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  comments.forEach(comment => {
    if (allTasks[comment.taskIndex]) {
      const commentDate = new Date(Date.now() - comment.createdDaysAgo * 24 * 60 * 60 * 1000).toISOString();
      const member = members.find(m => m.id === comment.memberId);
      
      commentStmt.run(
        crypto.randomUUID(),
        allTasks[comment.taskIndex].id,
        demoUsers.find(u => `${u.firstName} ${u.lastName}` === member.name).id,
        comment.text,
        commentDate,
        commentDate
      );
    }
  });

  console.log(`✅ Created ${comments.length} comments on tasks`);

  console.log('');
  console.log('🎉 Demo data initialization complete!');
  console.log(`   📊 Sprint: ${sprintStartDate} to ${sprintEndDate}`);
  console.log(`   📝 ${demoTasks.length} tasks with historical completion data`);
  console.log(`   💬 ${comments.length} comments showing collaboration`);
  console.log(`   🏷️  ${tags.length} tags for organization`);
  console.log(`   🔗 ${relationships.length} task dependencies/blockers`);
}

