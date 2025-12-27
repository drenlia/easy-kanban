/**
 * SQL Manager - Centralized Query Management
 * 
 * This module provides centralized PostgreSQL-native queries organized by domain.
 * All queries use PostgreSQL syntax ($1, $2, $3 placeholders, json_agg, etc.)
 * 
 * Usage:
 *   import { tasks } from '../utils/sqlManager/index.js';
 *   const task = await tasks.getTaskById(db, taskId);
 */

import * as tasks from './tasks.js';
import * as helpers from './helpers.js';
import * as boards from './boards.js';
import * as comments from './comments.js';

// Export all domain managers
export const sqlManager = {
  tasks,
  helpers,
  boards,
  comments,
  // Add more domains as they're created:
  // users,
  // priorities,
  // etc.
};

// Also export individual domains for convenience
export { tasks, helpers, boards, comments };
// export { users };
// etc.

export default sqlManager;

