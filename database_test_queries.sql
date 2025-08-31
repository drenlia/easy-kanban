-- ================================
-- DATABASE TEST QUERIES
-- Run these in SQLite prompt to verify the new schema
-- ================================

-- 1. Check all table schemas
.schema tasks
.schema tags  
.schema views
.schema activity

-- 2. Verify dueDate column was added to tasks
SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks';

-- 3. Test inserting sample data into new tables

-- Insert sample tags
INSERT INTO tags (tag, description, color) VALUES 
  ('urgent', 'High priority items requiring immediate attention', '#FF3B30'),
  ('bug', 'Software defects that need fixing', '#FF9500'),
  ('feature', 'New functionality to be implemented', '#007AFF'),
  ('documentation', 'Documentation updates and improvements', '#4CD964');

-- Insert sample view (filter configuration)
INSERT INTO views (filterName, userId, shared, textFilter, dateFromFilter, dateToFilter, memberFilters, priorityFilters) VALUES 
  ('My Urgent Tasks', 'admin-user', 0, 'urgent', '2025-01-01', '2025-12-31', '["admin-member"]', '["high", "critical"]'),
  ('Team Review Items', 'admin-user', 1, '', '', '', '[]', '["medium", "high"]');

-- Insert sample activity logs
INSERT INTO activity (userId, action, taskId, boardId) VALUES 
  ('admin-user', 'task_created', NULL, 'default-board'),
  ('admin-user', 'board_accessed', NULL, 'default-board'),
  ('admin-user', 'filter_applied', NULL, NULL);

-- 4. Test queries to verify functionality

-- Check all tags
SELECT * FROM tags;

-- Check all views
SELECT * FROM views;

-- Check recent activity
SELECT 
  a.*, 
  u.email as user_email,
  u.first_name || ' ' || u.last_name as user_name
FROM activity a 
JOIN users u ON a.userId = u.id 
ORDER BY a.created_at DESC 
LIMIT 10;

-- Check tasks with new dueDate field
SELECT id, title, startDate, dueDate, priority FROM tasks LIMIT 5;

-- Count records in each new table
SELECT 'tags' as table_name, COUNT(*) as count FROM tags
UNION ALL
SELECT 'views' as table_name, COUNT(*) as count FROM views  
UNION ALL
SELECT 'activity' as table_name, COUNT(*) as count FROM activity;

-- 5. Test foreign key relationships

-- Check if activity properly links to users
SELECT 
  a.action,
  u.email,
  COUNT(*) as activity_count
FROM activity a
JOIN users u ON a.userId = u.id
GROUP BY a.action, u.email;

-- Check shared vs private views
SELECT 
  filterName,
  u.email as owner,
  CASE WHEN shared = 1 THEN 'Shared' ELSE 'Private' END as visibility
FROM views v
JOIN users u ON v.userId = u.id;

-- 6. Test data cleanup (optional - shows orphaned records)

-- Check for any orphaned activity records
SELECT COUNT(*) as orphaned_activities 
FROM activity a 
LEFT JOIN users u ON a.userId = u.id 
WHERE u.id IS NULL;

-- ================================
-- SAMPLE QUERIES FOR FUTURE FEATURES
-- ================================

-- Get user's saved filters
SELECT * FROM views WHERE userId = 'admin-user' ORDER BY created_at DESC;

-- Get shared filters available to all users  
SELECT * FROM views WHERE shared = 1 ORDER BY created_at DESC;

-- Get user activity for a specific board
SELECT * FROM activity WHERE userId = 'admin-user' AND boardId = 'default-board' ORDER BY created_at DESC;

-- Get most used tags
SELECT tag, COUNT(*) as usage_count FROM tags GROUP BY tag ORDER BY usage_count DESC;

-- Get user activity summary
SELECT 
  action,
  COUNT(*) as count,
  MAX(created_at) as last_performed
FROM activity 
WHERE userId = 'admin-user' 
GROUP BY action 
ORDER BY count DESC;
