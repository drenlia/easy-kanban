#!/usr/bin/env node

/**
 * Script to generate SQL INSERT statements for 25 generic QA users
 * 
 * Usage (inside Docker container):
 *   1. docker exec -it easy-kanban node /app/server/scripts/generate-qa-users.js > qa-users.sql
 *   2. Get the user role ID: docker exec -it easy-kanban sqlite3 /app/server/data/kanban.db "SELECT id FROM roles WHERE name = 'user';"
 *   3. Replace <ROLE_ID> in qa-users.sql with the actual role ID
 *   4. Execute: docker exec -i easy-kanban sqlite3 /app/server/data/kanban.db < qa-users.sql
 * 
 * Or run interactively:
 *   docker exec -it easy-kanban node /app/server/scripts/generate-qa-users.js
 *   (then copy/paste the output and replace <ROLE_ID>)
 * 
 * Password for all users: TestPassword123!
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Generate a password hash (same password for all QA users)
const password = 'TestPassword123!';

// Color palette for member colors
const colors = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E', '#EF4444', '#F97316', '#F59E0B',
  '#EAB308', '#84CC16', '#22C55E', '#10B981', '#14B8A6'
];

const firstNames = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 
  'Frank', 'Grace', 'Henry', 'Ivy', 'Jack', 
  'Kate', 'Liam', 'Mia', 'Noah', 'Olivia', 
  'Paul', 'Quinn', 'Rachel', 'Sam', 'Tina', 
  'Uma', 'Victor', 'Wendy', 'Xavier', 'Yara'
];

const lastNames = [
  'Anderson', 'Brown', 'Clark', 'Davis', 'Evans', 
  'Foster', 'Green', 'Harris', 'Irwin', 'Jones', 
  'King', 'Lee', 'Miller', 'Nelson', 'Owens', 
  'Parker', 'Quinn', 'Roberts', 'Smith', 'Taylor', 
  'Underwood', 'Vance', 'White', 'Xavier', 'Young'
];

async function generateSQL() {
  // Generate password hash
  const passwordHash = await bcrypt.hash(password, 10);
  
  console.log('-- ============================================');
  console.log('-- SQL statements to create 25 generic QA users');
  console.log('-- ============================================');
  console.log('-- Password for all users: TestPassword123!');
  console.log('--');
  console.log('-- IMPORTANT: Before running these statements:');
  console.log('--   1. Get the user role ID: SELECT id FROM roles WHERE name = \'user\';');
  console.log('--   2. Replace <ROLE_ID> below with the actual role ID');
  console.log('--   3. Execute the statements in your database');
  console.log('--');
  console.log('-- To execute in Docker:');
  console.log('--   docker exec -i easy-kanban sqlite3 /app/server/data/kanban.db < output.sql');
  console.log('--');
  console.log('-- Or connect to the database and paste these statements');
  console.log('-- ============================================');
  console.log('');
  
  for (let i = 0; i < 25; i++) {
    const userId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const firstName = firstNames[i];
    const lastName = lastNames[i];
    const email = `qa.user${i+1}@test.local`;
    const memberName = `${firstName} ${lastName}`;
    const color = colors[i];
    
    console.log(`-- User ${i+1}: ${firstName} ${lastName} (${email})`);
    console.log(`INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, auth_provider, created_at, updated_at) VALUES ('${userId}', '${email}', '${passwordHash}', '${firstName}', '${lastName}', 1, 'local', datetime('now'), datetime('now'));`);
    console.log(`INSERT INTO user_roles (user_id, role_id, created_at, updated_at) VALUES ('${userId}', <ROLE_ID>, datetime('now'), datetime('now'));`);
    console.log(`INSERT INTO members (id, name, color, user_id, created_at, updated_at) VALUES ('${memberId}', '${memberName}', '${color}', '${userId}', datetime('now'), datetime('now'));`);
    console.log('');
  }
  
  console.log('-- ============================================');
  console.log('-- Summary: 25 users created');
  console.log('-- All users have password: TestPassword123!');
  console.log('-- All users are active (is_active = 1)');
  console.log('-- All users have role: user (replace <ROLE_ID> with actual ID)');
  console.log('-- ============================================');
}

generateSQL().catch(error => {
  console.error('Error generating SQL:', error);
  process.exit(1);
});

