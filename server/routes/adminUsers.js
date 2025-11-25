import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { avatarUpload } from '../config/multer.js';
import { getLicenseManager } from '../config/license.js';
import { createDefaultAvatar, getRandomColor } from '../utils/avatarGenerator.js';
import { getNotificationService } from '../services/notificationService.js';
import redisService from '../services/redisService.js';
import { getTranslator } from '../utils/i18n.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

// Get all users (admin only)
router.get('/', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // Prevent browser caching of admin user data
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    const users = wrapQuery(db.prepare(`
      SELECT u.*, GROUP_CONCAT(r.name) as roles, m.name as member_name, m.color as member_color
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      LEFT JOIN members m ON u.id = m.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `), 'SELECT').all();

    const transformedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      displayName: user.member_name || `${user.first_name} ${user.last_name}`,
      roles: user.roles ? user.roles.split(',') : [],
      isActive: !!user.is_active,
      createdAt: user.created_at,
      joined: user.created_at,
      avatarUrl: user.avatar_path,
      authProvider: user.auth_provider || 'local',
      googleAvatarUrl: user.google_avatar_url,
      memberName: user.member_name,
      memberColor: user.member_color
    }));

    res.json(transformedUsers);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin member name update endpoint (MUST come before /:userId route)
router.put('/:userId/member-name', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const t = getTranslator(db);
    const { userId } = req.params;
    const { displayName } = req.body;
    
    if (!displayName || displayName.trim().length === 0) {
      return res.status(400).json({ error: t('errors.displayNameRequired') });
    }
    
    // Validate display name length (max 30 characters)
    const trimmedDisplayName = displayName.trim();
    if (trimmedDisplayName.length > 30) {
      return res.status(400).json({ error: t('errors.displayNameTooLong') });
    }
    
    // Check for duplicate display name (excluding current user)
    const existingMember = wrapQuery(
      db.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?) AND user_id != ?'), 
      'SELECT'
    ).get(trimmedDisplayName, userId);
    
    if (existingMember) {
      return res.status(400).json({ error: t('errors.displayNameTaken') });
    }
    
    console.log('🏷️ Updating member name for user:', userId, 'to:', trimmedDisplayName);
    
    // Get member info before update for Redis publishing
    const member = wrapQuery(db.prepare('SELECT id, color FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    if (!member) {
      console.log('❌ No member found for user:', userId);
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Update the member's name in the members table
    const updateMemberStmt = wrapQuery(db.prepare('UPDATE members SET name = ? WHERE user_id = ?'), 'UPDATE');
    const result = updateMemberStmt.run(trimmedDisplayName, userId);
    
    if (result.changes === 0) {
      console.log('❌ No member found for user:', userId);
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing member-updated to Redis for name change');
    await redisService.publish('member-updated', {
      memberId: member.id,
      member: { id: member.id, name: trimmedDisplayName, color: member.color },
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log('✅ Member-updated published to Redis');
    
    console.log('✅ Member name updated successfully');
    res.json({ 
      message: 'Member name updated successfully',
      displayName: trimmedDisplayName
    });
  } catch (error) {
    console.error('Member name update error:', error);
    res.status(500).json({ error: 'Failed to update member name' });
  }
});

// Update user details (MUST come after more specific routes)
router.put('/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const { email, firstName, lastName, isActive } = req.body;
  const db = getRequestDatabase(req);
  const { getTranslator } = await import('../utils/i18n.js');
  const t = getTranslator(db);
  
  if (!email || !firstName || !lastName) {
    return res.status(400).json({ error: t('errors.emailFirstNameLastNameRequired') });
  }

  try {
    // Get current user status to check if they're being activated
    const currentUser = wrapQuery(db.prepare('SELECT is_active FROM users WHERE id = ?'), 'SELECT').get(userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is being activated (changing from inactive to active)
    const isBeingActivated = !currentUser.is_active && isActive;
    
    if (isBeingActivated) {
      // Check user limit before allowing activation (only if licensing is enabled)
      const licenseEnabled = process.env.LICENSE_ENABLED === 'true';
      if (licenseEnabled) {
        const licenseManager = getLicenseManager(db);
        try {
          await licenseManager.checkUserLimit();
        } catch (limitError) {
          console.warn('User limit check failed during activation:', limitError.message);
          return res.status(403).json({ 
            error: 'User limit reached',
            message: limitError.message,
            details: 'Your current plan does not allow activating more users. Please upgrade your plan or contact support.'
          });
        }
      }
    }

    // Check if email already exists for another user
    const existingUser = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ? AND id != ?'), 'SELECT').get(email, userId);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Update user
    wrapQuery(db.prepare(`
      UPDATE users SET email = ?, first_name = ?, last_name = ?, is_active = ? 
      WHERE id = ?
    `), 'UPDATE').run(email, firstName, lastName, isActive ? 1 : 0, userId);

    // Note: Member name is updated separately via /api/admin/users/:userId/member-name
    // This allows for custom display names that differ from firstName + lastName

    // Publish to Redis for real-time updates
    console.log('📤 Publishing user-updated to Redis');
    await redisService.publish('user-updated', {
      user: { 
        id: userId, 
        email, 
        firstName, 
        lastName, 
        isActive: !!isActive,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    }, getTenantId(req));

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Update user role
router.put('/:userId/role', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const { role } = req.body;
  const db = getRequestDatabase(req);
  
  if (!role) {
    return res.status(400).json({ error: 'Role is required' });
  }

  try {
    // Prevent users from demoting themselves
    if (userId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'Cannot change your own admin role' });
    }

    // Get current role
    const currentRoles = wrapQuery(db.prepare(`
      SELECT r.name FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `), 'SELECT').all(userId);

    if (currentRoles.length > 0 && currentRoles[0].name !== role) {
      // Remove current role
      wrapQuery(db.prepare('DELETE FROM user_roles WHERE user_id = ?'), 'DELETE').run(userId);
      
      // Assign new role
      const roleId = wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get(role)?.id;
      if (roleId) {
        wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(userId, roleId);
      }

      // Update the user's updated_at timestamp
      wrapQuery(db.prepare(`
        UPDATE users 
        SET updated_at = datetime('now')
        WHERE id = ?
      `), 'UPDATE').run(userId);

      console.log(`🔄 User ${userId} role changed to ${role} - no logout required`);
      
      // Publish to Redis for real-time updates
      console.log('📤 Publishing user-role-updated to Redis');
      await redisService.publish('user-role-updated', {
        userId: userId,
        role: role,
        timestamp: new Date().toISOString()
      }, getTenantId(req));
    }

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

// Check if user can be created (for pre-validation)
router.get('/can-create', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    
    // Check if licensing is enabled first (before creating license manager)
    // If LICENSE_ENABLED is not set or is 'false', treat as disabled
    const licenseEnabled = process.env.LICENSE_ENABLED === 'true';
    if (!licenseEnabled) {
      return res.json({ canCreate: true, reason: null });
    }
    
    // Only check limits if licensing is enabled
    // Safely get license manager - if db is not available, allow creation
    if (!db) {
      console.warn('Database not available for license check, allowing user creation');
      return res.json({ canCreate: true, reason: null });
    }
    
    const licenseManager = getLicenseManager(db);
    if (!licenseManager.isEnabled()) {
      return res.json({ canCreate: true, reason: null });
    }
    
    try {
      await licenseManager.checkUserLimit();
      res.json({ canCreate: true, reason: null });
    } catch (limitError) {
      // This is expected when limit is reached - return success response with canCreate: false
      try {
        const limits = await licenseManager.getLimits();
        const userCount = await licenseManager.getUserCount();
        res.json({ 
          canCreate: false, 
          reason: 'User limit reached',
          message: `Your current plan allows ${limits.USER_LIMIT} active users. You currently have ${userCount}. Please upgrade your plan or contact support.`,
          current: userCount,
          limit: limits.USER_LIMIT
        });
      } catch (detailsError) {
        // If we can't get details, still return the limit error
        res.json({ 
          canCreate: false, 
          reason: 'User limit reached',
          message: limitError.message
        });
      }
    }
  } catch (error) {
    console.error('Error checking user limit:', error);
    // If licensing is disabled, allow user creation even if there's an error
    const licenseEnabled = process.env.LICENSE_ENABLED === 'true';
    if (!licenseEnabled) {
      return res.json({ canCreate: true, reason: null });
    }
    // For any other error when licensing is enabled, return error
    res.status(500).json({ error: 'Failed to check user limit' });
  }
});

// Create new user
router.post('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { email, password, firstName, lastName, role, displayName, baseUrl: baseUrlFromBody, isActive } = req.body;
  const db = getRequestDatabase(req);
  const t = getTranslator(db);
  
  // Get baseUrl for invitation emails - use APP_URL from database (tenant-specific)
  // Priority: 1) APP_URL from database, 2) baseUrl from request body, 3) Construct from tenantId, 4) Fallback
  let baseUrl = baseUrlFromBody;
  if (!baseUrl) {
    const appUrlSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('APP_URL');
    
    if (appUrlSetting?.value) {
      baseUrl = appUrlSetting.value.replace(/\/$/, '');
    } else {
      // Construct from tenantId if available (multi-tenant mode)
      const tenantId = req.tenantId;
      if (tenantId) {
        const domain = process.env.TENANT_DOMAIN || 'ezkan.cloud';
        baseUrl = `https://${tenantId}.${domain}`;
      } else {
        // Fallback to request origin
        baseUrl = req.get('origin') || 'http://localhost:3000';
      }
    }
  }
  
  // Validate required fields with specific error messages
  if (!email) {
    return res.status(400).json({ error: 'Email address is required' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (!firstName) {
    return res.status(400).json({ error: 'First name is required' });
  }
  if (!lastName) {
    return res.status(400).json({ error: 'Last name is required' });
  }
  if (!role) {
    return res.status(400).json({ error: 'User role is required' });
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }
  
  try {
    // Check user limit before creating new user (only if licensing is enabled)
    const licenseEnabled = process.env.LICENSE_ENABLED === 'true';
    if (licenseEnabled) {
      const licenseManager = getLicenseManager(db);
      try {
        await licenseManager.checkUserLimit();
      } catch (limitError) {
        console.warn('User limit check failed:', limitError.message);
        return res.status(403).json({ 
          error: 'User limit reached',
          message: limitError.message,
          details: 'Your current plan does not allow creating more users. Please upgrade your plan or contact support.'
        });
      }
    }
    
    // Check if email already exists
    const existingUser = wrapQuery(db.prepare('SELECT id FROM users WHERE email = ?'), 'SELECT').get(email);
    if (existingUser) {
      return res.status(400).json({ error: `User with email ${email} already exists` });
    }
    
    // Generate user ID
    const userId = crypto.randomUUID();
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user (active if specified, otherwise inactive and requires email verification)
    const userIsActive = isActive ? 1 : 0;
    wrapQuery(db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_active, auth_provider) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `), 'INSERT').run(userId, email, passwordHash, firstName, lastName, userIsActive, 'local');
    
    // Assign role
    const roleId = wrapQuery(db.prepare('SELECT id FROM roles WHERE name = ?'), 'SELECT').get(role)?.id;
    if (roleId) {
      wrapQuery(db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)'), 'INSERT').run(userId, roleId);
    }
    
    // Create team member automatically with custom display name if provided and random color
    const memberId = crypto.randomUUID();
    let memberName = displayName || `${firstName} ${lastName}`;
    
    // Validate display name length (max 30 characters) if provided
    if (displayName) {
      const trimmedDisplayName = displayName.trim();
      if (trimmedDisplayName.length > 30) {
        return res.status(400).json({ error: t('errors.displayNameTooLong') });
      }
      memberName = trimmedDisplayName;
    } else {
      // If no display name provided, use firstName + lastName, but truncate if needed
      const fullName = `${firstName} ${lastName}`.trim();
      if (fullName.length > 30) {
        memberName = fullName.substring(0, 30);
      } else {
        memberName = fullName;
      }
    }
    
    const memberColor = getRandomColor(); // Random color from palette
    wrapQuery(db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)'), 'INSERT')
      .run(memberId, memberName, memberColor, userId);
    
    // Generate default avatar SVG for new local users with matching background color
    // Use tenant-specific path if in multi-tenant mode
    const tenantId = getTenantId(req);
    const avatarPath = createDefaultAvatar(memberName, userId, memberColor, tenantId);
    if (avatarPath) {
      // Update user with default avatar path
      wrapQuery(db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?'), 'UPDATE').run(avatarPath, userId);
    }
    
    // Only generate invitation token and send email if user is not active
    let emailSent = false;
    let emailError = null;
    
    if (!isActive) {
      // Generate invitation token for email verification
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      // Store invitation token
      wrapQuery(db.prepare(`
        INSERT INTO user_invitations (id, user_id, token, expires_at, created_at) 
        VALUES (?, ?, ?, ?, datetime('now'))
      `), 'INSERT').run(
        crypto.randomUUID(),
        userId,
        inviteToken,
        tokenExpiry.toISOString()
      );
      
      // Get admin user info for email
      const adminUser = wrapQuery(
        db.prepare('SELECT first_name, last_name FROM users WHERE id = ?'), 
        'SELECT'
      ).get(req.user.userId);
      const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Administrator';
      
      // Send invitation email
      try {
        const notificationService = getNotificationService();
        const emailResult = await notificationService.sendUserInvitation(userId, inviteToken, adminName, baseUrl);
        if (emailResult.success) {
          emailSent = true;
          console.log('✅ Invitation email sent for new user:', email);
        } else {
          emailError = emailResult.reason || 'Email service unavailable';
          console.warn('⚠️ Failed to send invitation email:', emailError);
        }
      } catch (emailErr) {
        console.warn('⚠️ Failed to send invitation email:', emailErr.message);
        emailError = emailErr.message;
      }
    }
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing user-created to Redis');
    await redisService.publish('user-created', {
      user: { 
        id: userId, 
        email, 
        firstName, 
        lastName, 
        role, 
        isActive: isActive || false,
        displayName: memberName,
        memberColor: memberColor,
        authProvider: 'local',
        createdAt: new Date().toISOString(),
        joined: new Date().toISOString()
      },
      member: { id: memberId, name: memberName, color: memberColor },
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    
    // Prepare response message based on creation mode
    let message = 'User created successfully.';
    if (isActive) {
      message += ' User is active and can log in immediately.';
    } else if (emailSent) {
      message += ' An invitation email has been sent.';
    } else {
      message += ` Note: Invitation email could not be sent (${emailError || 'Email service unavailable'}). The user will need to be manually activated or you can resend the invitation once email is configured.`;
    }

    res.json({ 
      message,
      user: { id: userId, email, firstName, lastName, role, isActive: isActive || false },
      emailSent,
      emailError: emailError || null
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Resend user invitation
router.post('/:userId/resend-invitation', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const { baseUrl: baseUrlFromBody } = req.body;
  const db = getRequestDatabase(req);
  
  // Get baseUrl for invitation emails - use APP_URL from database (tenant-specific)
  // Priority: 1) APP_URL from database, 2) baseUrl from request body, 3) Construct from tenantId, 4) Fallback
  let baseUrl = baseUrlFromBody;
  if (!baseUrl) {
    const appUrlSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'),
      'SELECT'
    ).get('APP_URL');
    
    if (appUrlSetting?.value) {
      baseUrl = appUrlSetting.value.replace(/\/$/, '');
    } else {
      // Construct from tenantId if available (multi-tenant mode)
      const tenantId = req.tenantId;
      if (tenantId) {
        const domain = process.env.TENANT_DOMAIN || 'ezkan.cloud';
        baseUrl = `https://${tenantId}.${domain}`;
      } else {
        // Fallback to request origin
        baseUrl = req.get('origin') || 'http://localhost:3000';
      }
    }
  }
  
  try {
    // Get user details
    const user = wrapQuery(
      db.prepare('SELECT id, email, first_name, last_name, is_active, auth_provider FROM users WHERE id = ?'), 
      'SELECT'
    ).get(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only allow resending for inactive local users
    if (user.auth_provider !== 'local') {
      return res.status(400).json({ error: 'Cannot resend invitation for non-local accounts' });
    }

    if (user.is_active) {
      return res.status(400).json({ error: 'User account is already active' });
    }

    // Delete any existing invitation tokens for this user
    wrapQuery(db.prepare('DELETE FROM user_invitations WHERE user_id = ?'), 'DELETE').run(userId);

    // Generate new invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    // Store new invitation token
    wrapQuery(db.prepare(`
      INSERT INTO user_invitations (id, user_id, token, expires_at, created_at) 
      VALUES (?, ?, ?, ?, datetime('now'))
    `), 'INSERT').run(
      crypto.randomUUID(),
      userId,
      inviteToken,
      tokenExpiry.toISOString()
    );
    
    // Get admin user info for email
    const adminUser = wrapQuery(
      db.prepare('SELECT first_name, last_name FROM users WHERE id = ?'), 
      'SELECT'
    ).get(req.user.userId);
    const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Administrator';
    
    // Send invitation email
    try {
      const notificationService = getNotificationService();
      const emailResult = await notificationService.sendUserInvitation(userId, inviteToken, adminName, baseUrl);
      
      if (emailResult && emailResult.success) {
        console.log('✅ Invitation resent successfully for user:', user.email);
        res.json({ 
          success: true,
          message: 'Invitation email sent successfully',
          email: user.email
        });
      } else {
        // Email service returned a failure result
        const errorMessage = emailResult?.reason || emailResult?.error || 'Failed to send invitation email';
        console.error('⚠️ Failed to send invitation email:', errorMessage);
        res.status(500).json({ 
          success: false,
          error: errorMessage,
          details: emailResult?.details || null
        });
      }
    } catch (emailError) {
      console.error('⚠️ Failed to send invitation email:', emailError.message);
      res.status(500).json({ 
        success: false,
        error: emailError.message || 'Failed to send invitation email'
      });
    }
    
  } catch (error) {
    console.error('Resend invitation error:', error);
    res.status(500).json({ error: 'Failed to resend invitation' });
  }
});

// Get task count for a user (for deletion confirmation)
router.get('/:userId/task-count', authenticateToken, requireRole(['admin']), (req, res) => {
  const { userId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // Count tasks where this user is either the assignee (memberId) or requester (requesterId)
    // First get the member ID for this user
    const member = wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    let taskCount = 0;
    if (member) {
      const assignedTasks = wrapQuery(db.prepare('SELECT COUNT(*) as count FROM tasks WHERE memberId = ?'), 'SELECT').get(member.id);
      const requestedTasks = wrapQuery(db.prepare('SELECT COUNT(*) as count FROM tasks WHERE requesterId = ?'), 'SELECT').get(member.id);
      taskCount = (assignedTasks?.count || 0) + (requestedTasks?.count || 0);
    }
    
    res.json({ count: taskCount }); // Fixed: return 'count' instead of 'taskCount'
  } catch (error) {
    console.error('Error getting user task count:', error);
    res.status(500).json({ error: 'Failed to get task count' });
  }
});

// Delete user
router.delete('/:userId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // Check if user is trying to delete themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Get user details before deletion (needed for response)
    const user = wrapQuery(db.prepare('SELECT id, email, first_name, last_name, is_active, auth_provider FROM users WHERE id = ?'), 'SELECT').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the SYSTEM user ID (00000000-0000-0000-0000-000000000000)
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
    
    // Get the member ID for the user being deleted (before deletion)
    const userMember = wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    // Get all tasks that will be reassigned (for WebSocket notifications)
    let tasksToReassign = [];
    if (userMember) {
      tasksToReassign = wrapQuery(
        db.prepare('SELECT id, boardId FROM tasks WHERE memberId = ? OR requesterId = ?'), 
        'SELECT'
      ).all(userMember.id, userMember.id);
      console.log(`📋 Found ${tasksToReassign.length} tasks to reassign from user ${userId} to SYSTEM`);
    }
    
    // Begin transaction for cascading deletion
    const transaction = db.transaction(() => {
      try {
        // 1. Delete activity records (no FK constraint, so won't cascade)
        wrapQuery(db.prepare('DELETE FROM activity WHERE userId = ?'), 'DELETE').run(userId);
        
        // 2. Delete comments made by the user (references members without CASCADE)
        if (userMember) {
          wrapQuery(db.prepare('DELETE FROM comments WHERE authorId = ?'), 'DELETE').run(userMember.id);
        }
        
        // 3. Delete watchers (should cascade but let's be explicit)
        if (userMember) {
          wrapQuery(db.prepare('DELETE FROM watchers WHERE memberId = ?'), 'DELETE').run(userMember.id);
        }
        
        // 4. Delete collaborators (should cascade but let's be explicit)
        if (userMember) {
          wrapQuery(db.prepare('DELETE FROM collaborators WHERE memberId = ?'), 'DELETE').run(userMember.id);
        }
        
        // 5. Update planning_periods to set created_by to NULL (references users without CASCADE)
        wrapQuery(db.prepare('UPDATE planning_periods SET created_by = NULL WHERE created_by = ?'), 'UPDATE').run(userId);
        
        // 6. Delete user roles (should cascade but let's be explicit)
        wrapQuery(db.prepare('DELETE FROM user_roles WHERE user_id = ?'), 'DELETE').run(userId);
        
        // 7. Delete user settings (should cascade but let's be explicit)
        wrapQuery(db.prepare('DELETE FROM user_settings WHERE userId = ?'), 'DELETE').run(userId);
        
        // 8. Delete views (should cascade but let's be explicit)
        wrapQuery(db.prepare('DELETE FROM views WHERE userId = ?'), 'DELETE').run(userId);
        
        // 9. Delete password reset tokens (should cascade but let's be explicit)
        wrapQuery(db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?'), 'DELETE').run(userId);
        
        // 10. Delete user invitations (should cascade but let's be explicit)
        wrapQuery(db.prepare('DELETE FROM user_invitations WHERE user_id = ?'), 'DELETE').run(userId);
        
        // 11. Reassign tasks assigned to the user to the system account (preserve task history)
        const systemMemberId = '00000000-0000-0000-0000-000000000001';
        
        if (userMember) {
          wrapQuery(
            db.prepare('UPDATE tasks SET memberId = ? WHERE memberId = ?'), 
            'UPDATE'
          ).run(systemMemberId, userMember.id);
          
          // 12. Reassign tasks requested by the user to the system account
          wrapQuery(
            db.prepare('UPDATE tasks SET requesterId = ? WHERE requesterId = ?'), 
            'UPDATE'
          ).run(systemMemberId, userMember.id);
        }
        
        // 13. Delete the member record
        if (userMember) {
          wrapQuery(db.prepare('DELETE FROM members WHERE user_id = ?'), 'DELETE').run(userId);
        }
        
        // 14. Finally, delete the user account
        wrapQuery(db.prepare('DELETE FROM users WHERE id = ?'), 'DELETE').run(userId);
        
        console.log(`🗑️ User deleted successfully: ${user.email}`);
        
      } catch (error) {
        console.error('Error during user deletion transaction:', error);
        throw error;
      }
    });
    
    // Execute the transaction
    transaction();
    
    // Publish task-updated events for all reassigned tasks (for real-time updates)
    if (tasksToReassign.length > 0) {
      const systemMember = wrapQuery(db.prepare('SELECT id FROM members WHERE id = ?'), 'SELECT').get('00000000-0000-0000-0000-000000000001');
      
      if (systemMember) {
        console.log(`📤 Publishing ${tasksToReassign.length} task-updated events to Redis`);
        for (const task of tasksToReassign) {
          // Get the full updated task details with priority info
          const updatedTask = wrapQuery(
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
            
            redisService.publish('task-updated', {
              boardId: task.boardId,
              task: updatedTask,
              timestamp: new Date().toISOString()
            }, getTenantId(req)).catch(err => {
              console.error('Failed to publish task-updated event:', err);
            });
          }
        }
        
        console.log(`📤 Published ${tasksToReassign.length} task-updated events to Redis`);
      }
    }
    
    // Publish member-deleted event for real-time updates
    if (userMember) {
      console.log('📤 Publishing member-deleted to Redis for user deletion');
      await redisService.publish('member-deleted', {
        memberId: userMember.id,
        timestamp: new Date().toISOString()
      }, getTenantId(req));
      console.log('✅ Member-deleted published to Redis');
    }
    
    // Publish user-deleted event for real-time updates
    console.log('📤 Publishing user-deleted to Redis');
    await redisService.publish('user-deleted', {
      userId: userId,
      user: {
        id: userId,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isActive: !!user.is_active,
        authProvider: user.auth_provider
      },
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Update member color
router.put('/:userId/color', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const { color } = req.body;
  const db = getRequestDatabase(req);
  
  if (!color) {
    return res.status(400).json({ error: 'Color is required' });
  }

  // Validate color format (hex color)
  if (!/^#[0-9A-F]{6}$/i.test(color)) {
    return res.status(400).json({ error: 'Invalid color format. Use hex format like #FF5733' });
  }

  try {
    // Get member info before update for Redis publishing
    const member = wrapQuery(db.prepare('SELECT id, name FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found for this user' });
    }
    
    // Update member color
    const result = wrapQuery(db.prepare('UPDATE members SET color = ? WHERE user_id = ?'), 'UPDATE').run(color, userId);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found for this user' });
    }
    
    // Publish to Redis for real-time updates
    console.log('📤 Publishing member-updated to Redis for color change');
    await redisService.publish('member-updated', {
      memberId: member.id,
      member: { id: member.id, name: member.name, color: color },
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log('✅ Member-updated published to Redis');
    
    res.json({ message: 'Member color updated successfully' });
  } catch (error) {
    console.error('Error updating member color:', error);
    res.status(500).json({ error: 'Failed to update member color' });
  }
});

// Admin avatar upload endpoint
router.post('/:userId/avatar', authenticateToken, requireRole(['admin']), avatarUpload.single('avatar'), async (req, res) => {
  const { userId } = req.params;
  const db = getRequestDatabase(req);
  
  if (!req.file) {
    return res.status(400).json({ error: 'No avatar file uploaded' });
  }

  try {
    const avatarPath = `/avatars/${req.file.filename}`;
    // Update user's avatar_path in database
    wrapQuery(db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?'), 'UPDATE').run(avatarPath, userId);
    
    // Get the member ID for Redis publishing
    const member = wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    // Publish to Redis for real-time updates
    if (member) {
      console.log('📤 Publishing user-profile-updated to Redis for user:', userId);
      await redisService.publish('user-profile-updated', {
        userId: userId,
        memberId: member.id,
        avatarPath: avatarPath,
        timestamp: new Date().toISOString()
      }, getTenantId(req));
      console.log('✅ User-profile-updated published to Redis');
    }
    
    res.json({
      message: 'Avatar uploaded successfully',
      avatarUrl: avatarPath
    });
  } catch (error) {
    console.error('Error uploading admin avatar:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

// Admin avatar removal endpoint
router.delete('/:userId/avatar', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // Clear avatar_path in database
    wrapQuery(db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?'), 'UPDATE').run(userId);
    
    // Get the member ID for Redis publishing
    const member = wrapQuery(db.prepare('SELECT id FROM members WHERE user_id = ?'), 'SELECT').get(userId);
    
    // Publish to Redis for real-time updates
    if (member) {
      console.log('📤 Publishing user-profile-updated to Redis for user:', userId);
      await redisService.publish('user-profile-updated', {
        userId: userId,
        memberId: member.id,
        avatarPath: null,
        timestamp: new Date().toISOString()
      }, getTenantId(req));
      console.log('✅ User-profile-updated published to Redis');
    }
    
    res.json({ message: 'Avatar removed successfully' });
  } catch (error) {
    console.error('Error removing admin avatar:', error);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

export default router;

