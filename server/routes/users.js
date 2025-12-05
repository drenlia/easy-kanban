import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { authenticateToken } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { avatarUpload, createAttachmentUploadMiddleware } from '../config/multer.js';
import { createDefaultAvatar } from '../utils/avatarGenerator.js';
import { dbTransaction, dbExec, isPostgresDatabase, convertSqlToPostgres } from '../utils/dbAsync.js';
import notificationService from '../services/notificationService.js';
import { getTranslator } from '../utils/i18n.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

// Middleware factory: creates multer middleware dynamically based on admin settings
// This must run BEFORE the route handler so multer can process the multipart stream
const createUploadMiddleware = async (req, res, next) => {
  try {
    const db = getRequestDatabase(req);
    // Create multer instance with admin settings (pre-loaded for synchronous filter)
    const attachmentUploadWithValidation = await createAttachmentUploadMiddleware(db);
    
    // Use multer as middleware - this processes the multipart stream
    attachmentUploadWithValidation.single('file')(req, res, (err) => {
      if (err) {
        console.error('File upload validation error:', err.message);
        // Handle multer errors (file too large, invalid type, etc.)
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large' });
        }
        return res.status(400).json({ error: err.message });
      }
      // File processed successfully, continue to route handler
      next();
    });
  } catch (error) {
    console.error('File upload middleware error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
};

// File upload endpoint
// Note: Multer middleware must run BEFORE the route handler to process multipart stream
router.post('/upload', authenticateToken, createUploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate authenticated URL with token
    const token = req.headers.authorization?.replace('Bearer ', '');
    const authenticatedUrl = token ? `/api/files/attachments/${req.file.filename}?token=${encodeURIComponent(token)}` : `/attachments/${req.file.filename}`;
    
    res.json({
      id: crypto.randomUUID(),
      name: req.file.originalname,
      url: authenticatedUrl,
      type: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

// Avatar upload endpoint
router.post('/avatar', authenticateToken, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No avatar file uploaded' });
  }

  try {
    const db = getRequestDatabase(req);
    const avatarPath = `/avatars/${req.file.filename}`;
    await wrapQuery(db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?'), 'UPDATE').run(avatarPath, req.user.id);
    
    // Get the member ID for Redis publishing
    const member = await wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(req.user.id);
    
    // Publish to Redis for real-time updates
    if (member) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing user-profile-updated to Redis for user:', req.user.id);
      await notificationService.publish('user-profile-updated', {
        userId: req.user.id,
        memberId: member.id,
        avatarPath: avatarPath,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ User-profile-updated published to Redis');
    }
    
    // Generate authenticated URL with token
    const token = req.headers.authorization?.replace('Bearer ', '');
    const authenticatedUrl = token ? `/api/files/avatars/${req.file.filename}?token=${encodeURIComponent(token)}` : avatarPath;
    
    res.json({
      message: 'Avatar uploaded successfully',
      avatarUrl: authenticatedUrl
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Delete avatar endpoint
router.delete('/avatar', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    await wrapQuery(db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?'), 'UPDATE').run(req.user.id);
    
    // Get the member ID for Redis publishing
    const member = await wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(req.user.id);
    
    // Publish to Redis for real-time updates
    if (member) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing user-profile-updated to Redis for user:', req.user.id);
      await notificationService.publish('user-profile-updated', {
        userId: req.user.id,
        memberId: member.id,
        avatarPath: null,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ User-profile-updated published to Redis');
    }
    
    res.json({ message: 'Avatar removed successfully' });
  } catch (error) {
    console.error('Error removing avatar:', error);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

// Update user profile (display name)
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    const { displayName } = req.body;
    const userId = req.user.id;
    
    if (!displayName || displayName.trim().length === 0) {
      return res.status(400).json({ error: t('errors.displayNameRequired') });
    }
    
    // Validate display name length (max 30 characters)
    const trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName.length > 30) {
      return res.status(400).json({ error: t('errors.displayNameTooLong') });
    }
    
    // Check for duplicate display name (excluding current user)
    const existingMember = await wrapQuery(
      db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?) AND user_id != ?'), 
      'SELECT'
    ).get(trimmedDisplayName, userId);
    
    if (existingMember) {
      return res.status(400).json({ error: t('errors.displayNameTaken') });
    }
    
    // Update the member's name in the members table
    const updateMemberStmt = db.prepare('UPDATE members SET name = ? WHERE user_id = ?');
    await wrapQuery(updateMemberStmt, 'UPDATE').run(trimmedDisplayName, userId);
    
    // Get the member ID for Redis publishing
    const member = await wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    // Publish to Redis for real-time updates
    if (member) {
      const tenantId = getTenantId(req);
      console.log('📤 Publishing user-profile-updated to Redis for user:', userId);
      await notificationService.publish('user-profile-updated', {
        userId: userId,
        memberId: member.id,
        displayName: trimmedDisplayName,
        timestamp: new Date().toISOString()
      }, tenantId);
      console.log('✅ User-profile-updated published to Redis');
    }
    
    res.json({ 
      message: 'Profile updated successfully',
      displayName: trimmedDisplayName
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Delete user account
router.delete("/account", authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const userId = req.user.id;
    
    // Security validation: ensure user can only delete their own account
    // The authenticateToken middleware already validates the JWT and sets req.user
    // No additional user ID parameter needed - use the authenticated user's ID
    
    // Check if user exists and is active
    const user = await wrapQuery(db.prepare('SELECT id, email, first_name, last_name FROM users WHERE id = ? AND is_active = 1'), 'SELECT').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found or already inactive' });
    }
    
    // Get the SYSTEM user ID (00000000-0000-0000-0000-000000000000)
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
    const systemMemberId = '00000000-0000-0000-0000-000000000001';
    const tenantId = getTenantId(req);
    
    // Get the member ID for the user being deleted (before deletion)
    const userMember = await wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    // Get all tasks that will be reassigned (for WebSocket notifications)
    let tasksToReassign = [];
    if (userMember) {
      tasksToReassign = await wrapQuery(
        db.prepare('SELECT id, boardId FROM tasks WHERE memberId = ? OR requesterId = ?'), 
        'SELECT'
      ).all(userMember.id, userMember.id);
      console.log(`📋 Found ${tasksToReassign.length} tasks to reassign from user ${userId} to SYSTEM`);
    }
    
    // Begin transaction for cascading deletion
    await dbTransaction(db, async () => {
      // 0. Ensure SYSTEM account exists (create if missing, e.g., if it was deleted)
      const existingSystemMember = await wrapQuery(db.prepare('SELECT id FROM members WHERE id = ?'), 'SELECT').get(systemMemberId);
      if (!existingSystemMember) {
        console.log('⚠️  SYSTEM account not found, creating it...');
        
        // Check if SYSTEM user exists
        const existingSystemUser = await wrapQuery(db.prepare('SELECT id FROM users WHERE id = ?'), 'SELECT').get(SYSTEM_USER_ID);
        
        if (!existingSystemUser) {
          // Create SYSTEM user account
          const systemPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10); // Random unguessable password
          const systemAvatarPath = createDefaultAvatar('System', SYSTEM_USER_ID, '#1E40AF', tenantId);
          
          await wrapQuery(db.prepare(`
            INSERT INTO users (id, email, password_hash, first_name, last_name, avatar_path, auth_provider, is_active) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `), 'INSERT').run(SYSTEM_USER_ID, 'system@local', systemPasswordHash, 'System', 'User', systemAvatarPath, 'local', 0);
          
          // Assign user role to system account
          const userRole = await wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get('user');
          if (userRole) {
            await wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(SYSTEM_USER_ID, userRole.id);
          }
        }
        
        // Create system member record
        await wrapQuery(db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)'), 'INSERT').run(
          systemMemberId, 
          'SYSTEM', 
          '#1E40AF', // Blue color
          SYSTEM_USER_ID
        );
        
        console.log('✅ SYSTEM account created successfully');
      }
      
      // 1. Delete user roles
      await wrapQuery(db.prepare('DELETE FROM user_roles WHERE user_id = ?'), 'DELETE').run(userId);
      
      // 2. Delete comments made by the user
      await wrapQuery(db.prepare('DELETE FROM comments WHERE authorId = (SELECT id FROM members WHERE user_id = ?)'), 'DELETE').run(userId);
      
      // 3. Reassign tasks assigned to the user to the system account (preserve task history)
      await wrapQuery(
        db.prepare('UPDATE tasks SET memberId = ? WHERE memberId = (SELECT id FROM members WHERE user_id = ?)'), 
        'UPDATE'
      ).run(systemMemberId, userId);
      
      // 4. Reassign tasks requested by the user to the system account
      await wrapQuery(
        db.prepare('UPDATE tasks SET requesterId = ? WHERE requesterId = (SELECT id FROM members WHERE user_id = ?)'), 
        'UPDATE'
      ).run(systemMemberId, userId);
      
      // 5. Delete the member record
        await wrapQuery(db.prepare('DELETE FROM members WHERE user_id = ?'), 'DELETE').run(userId);
        
        // 6. Finally, delete the user account
        await wrapQuery(db.prepare('DELETE FROM users WHERE id = ?'), 'DELETE').run(userId);
        
        console.log(`🗑️ Account deleted successfully for user: ${user.email}`);
    });
    
    // Publish task-updated events for all reassigned tasks (for real-time updates)
    if (tasksToReassign.length > 0) {
      const systemMember = await wrapQuery(db.prepare('SELECT id FROM members WHERE id = ?'), 'SELECT').get('00000000-0000-0000-0000-000000000001');
      
      if (systemMember) {
        console.log(`📤 Publishing ${tasksToReassign.length} task-updated events to Redis`);
        for (const task of tasksToReassign) {
          // Get the full updated task details with priority info
          const updatedTask = await wrapQuery(
            db.prepare(`
              SELECT t.*, 
                     p.id as priorityId,
                     p.priority as priorityName,
                     p.color as priorityColor,
                     json_group_array(
                       DISTINCT CASE WHEN tag.id IS NOT NULL THEN json_object(
                         'id', tag.id,
                         'tag', tag.tag,
                         'description', tag.description,
                         'color', tag.color
                       ) ELSE NULL END
                     ) as tags,
                     json_group_array(
                       DISTINCT CASE WHEN watcher.id IS NOT NULL THEN json_object(
                         'id', watcher.id,
                         'name', watcher.name,
                         'color', watcher.color
                       ) ELSE NULL END
                     ) as watchers,
                     json_group_array(
                       DISTINCT CASE WHEN collaborator.id IS NOT NULL THEN json_object(
                         'id', collaborator.id,
                         'name', collaborator.name,
                         'color', collaborator.color
                       ) ELSE NULL END
                     ) as collaborators
              FROM tasks t
              LEFT JOIN task_tags tt ON tt.taskId = t.id
              LEFT JOIN tags tag ON tag.id = tt.tagId
              LEFT JOIN watchers w ON w.taskId = t.id
              LEFT JOIN members watcher ON watcher.id = w.memberId
              LEFT JOIN collaborators col ON col.taskId = t.id
              LEFT JOIN members collaborator ON collaborator.id = col.memberId
              LEFT JOIN priorities p ON (p.id = t.priority_id OR (t.priority_id IS NULL AND p.priority = t.priority))
              WHERE t.id = ?
              GROUP BY t.id, p.id
            `),
            'SELECT'
          ).get(task.id);
          
          if (updatedTask) {
            updatedTask.tags = updatedTask.tags === '[null]' ? [] : JSON.parse(updatedTask.tags).filter(Boolean);
            updatedTask.watchers = updatedTask.watchers === '[null]' ? [] : JSON.parse(updatedTask.watchers).filter(Boolean);
            updatedTask.collaborators = updatedTask.collaborators === '[null]' ? [] : JSON.parse(updatedTask.collaborators).filter(Boolean);
            
            // Use priorityName from JOIN (current name) or fallback to stored priority
            updatedTask.priority = updatedTask.priorityName || updatedTask.priority || null;
            updatedTask.priorityId = updatedTask.priorityId || null;
            updatedTask.priorityName = updatedTask.priorityName || updatedTask.priority || null;
            updatedTask.priorityColor = updatedTask.priorityColor || null;
            
            notificationService.publish('task-updated', {
              boardId: task.boardId,
              task: updatedTask,
              timestamp: new Date().toISOString()
            }, tenantId).catch(err => {
              console.error('Failed to publish task-updated event:', err);
            });
          }
        }
        console.log(`✅ Published ${tasksToReassign.length} task-updated events to Redis`);
      } else {
        console.warn('⚠️ SYSTEM user member not found, tasks reassigned but no WebSocket events published');
      }
    }
    
    // Publish to Redis for real-time updates to admins viewing user list
    console.log('📤 Publishing member-deleted and user-deleted to Redis for user:', userId);
    
    // Publish member-deleted for task/member updates
    notificationService.publish('member-deleted', {
      userId: userId,
      memberId: null, // User deleted themselves, member record is already gone
      userName: `${user.first_name} ${user.last_name}`,
      userEmail: user.email,
      timestamp: new Date().toISOString()
    }, tenantId).catch(err => {
      console.error('Failed to publish member-deleted event:', err);
      // Don't fail the deletion if Redis publish fails
    });
    
    // Publish user-deleted for admin UI updates
    notificationService.publish('user-deleted', {
      userId: userId,
      user: {
        id: userId,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name
      },
      timestamp: new Date().toISOString()
    }, tenantId).catch(err => {
      console.error('Failed to publish user-deleted event:', err);
      // Don't fail the deletion if Redis publish fails
    });
    
    console.log('✅ Member-deleted and user-deleted published to Redis');
    
    res.json({ 
      message: 'Account deleted successfully',
      deletedUser: {
        email: user.email,
        name: `${user.first_name} ${user.last_name}`
      }
    });
    
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// User Settings endpoints
router.get('/settings', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const db = getRequestDatabase(req);
  
  try {
    const isPostgres = isPostgresDatabase(db);
    // Create user_settings table if it doesn't exist
    const createTableSql = convertSqlToPostgres(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(userId, setting_key)
      )
    `, isPostgres);
    await dbExec(db, createTableSql);
    
    const settings = await wrapQuery(db.prepare(`
      SELECT setting_key, setting_value 
      FROM user_settings 
      WHERE userId = ?
    `), 'SELECT').all(userId);
    
    // Convert to object format
    const settingsObj = settings.reduce((acc, setting) => {
      let value = setting.setting_value;
      
      // Convert booleans
      if (value === 'true') {
        value = true;
      } else if (value === 'false') {
        value = false;
      } else if (!isNaN(value) && !isNaN(parseFloat(value))) {
        // Convert numbers (but only if it's actually a pure number)
        value = parseFloat(value);
      }
      // Leave strings (including JSON strings) as strings
      
      acc[setting.setting_key] = value;
      return acc;
    }, {});
    
    // Don't set defaults here - let the client handle smart merging
    // This allows the client to properly merge cookie vs database values
    res.json(settingsObj);
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ error: 'Failed to fetch user settings' });
  }
});

router.put('/settings', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { setting_key, setting_value } = req.body;
  const db = getRequestDatabase(req);
  
  try {
    // Handle undefined values (skip them)
    if (setting_value === undefined) {
      console.warn(`Skipping save for ${setting_key}: value is undefined`);
      return res.json({ message: 'Setting skipped (undefined value)' });
    }
    
    // Allow null for selectedSprintId (represents "All Sprints")
    // For other settings, skip null values
    if (setting_value === null && setting_key !== 'selectedSprintId') {
      console.warn(`Skipping save for ${setting_key}: value is null`);
      return res.json({ message: 'Setting skipped (null value)' });
    }
    
    // Special handling for selectedSprintId null value - delete the row to represent "All Sprints"
    if (setting_value === null && setting_key === 'selectedSprintId') {
      const isPostgres = isPostgresDatabase(db);
      const deleteSql = isPostgres
        ? `DELETE FROM user_settings WHERE userId = $1 AND setting_key = $2`
        : `DELETE FROM user_settings WHERE userId = ? AND setting_key = ?`;
      
      await wrapQuery(db.prepare(deleteSql), 'DELETE').run(userId, setting_key);
      
      return res.json({ message: 'Setting cleared successfully (null value stored as deletion)' });
    }
    
    // Convert value to string safely
    const valueString = typeof setting_value === 'string' ? setting_value : String(setting_value);
    
    const isPostgres = isPostgresDatabase(db);
    const insertSql = isPostgres
      ? `INSERT INTO user_settings (userId, setting_key, setting_value, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (userId, setting_key) 
         DO UPDATE SET setting_value = $3, updated_at = CURRENT_TIMESTAMP`
      : `INSERT OR REPLACE INTO user_settings (userId, setting_key, setting_value, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
    
    await wrapQuery(db.prepare(insertSql), 'INSERT').run(userId, setting_key, valueString);
    
    res.json({ message: 'Setting updated successfully' });
  } catch (error) {
    console.error('Error updating user setting:', error);
    res.status(500).json({ error: 'Failed to update user setting' });
  }
});

export default router;

