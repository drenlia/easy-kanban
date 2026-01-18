import express from 'express';
import { dbTransaction } from '../utils/dbAsync.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { avatarUpload } from '../config/multer.js';
import { getLicenseManager } from '../config/license.js';
import { createDefaultAvatar, getRandomColor } from '../utils/avatarGenerator.js';
// Note: Email notification service (getNotificationService) is not yet implemented
// import { getNotificationService } from '../services/notificationService.js';
import notificationService from '../services/notificationService.js';
import { getTranslator } from '../utils/i18n.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';
import { isPostgresDatabase } from '../utils/dbAsync.js';
// MIGRATED: Import sqlManager modules
import { users as userQueries, tasks as taskQueries, adminUsers as adminUserQueries, auth as authQueries, helpers } from '../utils/sqlManager/index.js';

const router = express.Router();

// Helper to get the actual notification system being used (for accurate logging)
const getNotificationSystem = () => {
  return process.env.DB_TYPE === 'postgresql' ? 'PostgreSQL' : 'Redis';
};

// Get all users (admin only)
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // Prevent browser caching of admin user data
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    
    // MIGRATED: Get all users with roles and member info using sqlManager
    const users = await userQueries.getAllUsersWithRolesAndMembers(db);

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
    const t = await getTranslator(db);
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
    
    // MIGRATED: Check for duplicate display name using sqlManager
    const existingMember = await userQueries.checkMemberNameExists(db, trimmedDisplayName, userId);
    
    if (existingMember) {
      return res.status(400).json({ error: t('errors.displayNameTaken') });
    }
    
    console.log('🏷️ Updating member name for user:', userId, 'to:', trimmedDisplayName);
    
    // MIGRATED: Get member info before update using sqlManager
    const member = await userQueries.getMemberByUserIdWithColor(db, userId);
    
    if (!member) {
      console.log('❌ No member found for user:', userId);
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // MIGRATED: Update the member's name using sqlManager
    const result = await userQueries.updateMemberName(db, userId, trimmedDisplayName);
    
    if (result.changes === 0) {
      console.log('❌ No member found for user:', userId);
      return res.status(404).json({ error: 'Member not found' });
    }
    
    // Publish notification for real-time updates (uses PostgreSQL or Redis based on DB_TYPE)
    console.log(`📤 Publishing member-updated via ${getNotificationSystem()} for name change`);
    await notificationService.publish('member-updated', {
      memberId: member.id,
      member: { id: member.id, name: trimmedDisplayName, color: member.color },
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log(`✅ Member-updated published via ${getNotificationSystem()}`);
    
    console.log('✅ Member name updated successfully');
    res.json({ 
      message: 'Member name updated successfully',
      displayName: trimmedDisplayName
    });
  } catch (error) {
    console.error('Member name update error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      userId: req.params.userId,
      displayName: req.body.displayName
    });
    res.status(500).json({ 
      error: 'Failed to update member name',
      details: error.message 
    });
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
    // MIGRATED: Get current user status using sqlManager
    const currentUser = await userQueries.getUserByIdForAdmin(db, userId);
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

    // MIGRATED: Check if email already exists using sqlManager
    const existingUser = await userQueries.checkEmailExists(db, email, userId);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // MIGRATED: Update user using sqlManager
    await userQueries.updateUser(db, userId, { email, firstName, lastName, isActive });

    // Note: Member name is updated separately via /api/admin/users/:userId/member-name
    // This allows for custom display names that differ from firstName + lastName

    // Publish notification for real-time updates (uses PostgreSQL or Redis based on DB_TYPE)
    console.log(`📤 Publishing user-updated via ${getNotificationSystem()}`);
    await notificationService.publish('user-updated', {
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

    // MIGRATED: Get current role using sqlManager
    const currentRole = await userQueries.getUserRole(db, userId);

    if (currentRole !== role) {
      // MIGRATED: Remove current role using sqlManager
      await userQueries.deleteUserRoles(db, userId);
      
      // MIGRATED: Assign new role using sqlManager
      const roleObj = await userQueries.getRoleByName(db, role);
      if (roleObj) {
        await userQueries.addUserRole(db, userId, roleObj.id);
      }

      // MIGRATED: Update the user's updated_at timestamp using sqlManager
      await userQueries.updateUserTimestamp(db, userId);

      console.log(`🔄 User ${userId} role changed to ${role} - no logout required`);
      
      // Publish notification for real-time updates
      console.log(`📤 Publishing user-role-updated via ${getNotificationSystem()}`);
      await notificationService.publish('user-role-updated', {
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
    // MIGRATED: Get APP_URL setting using sqlManager
    const appUrlSetting = await helpers.getSetting(db, 'APP_URL');
    
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
    
    // MIGRATED: Check if email already exists using sqlManager
    const existingUser = await userQueries.checkEmailExists(db, email);
    if (existingUser) {
      return res.status(400).json({ error: `User with email ${email} already exists` });
    }
    
    // Generate user ID
    const userId = crypto.randomUUID();
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // MIGRATED: Create user using sqlManager
    await userQueries.createUser(db, userId, email, passwordHash, firstName, lastName, isActive, 'local');
    
    // MIGRATED: Assign role using sqlManager
    const roleObj = await userQueries.getRoleByName(db, role);
    if (roleObj) {
      await userQueries.addUserRole(db, userId, roleObj.id);
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
    // MIGRATED: Create member using auth.createMemberForUser (includes user_id)
    await authQueries.createMemberForUser(db, memberId, memberName, memberColor, userId);
    
    // Generate default avatar SVG for new local users with matching background color
    // Use tenant-specific path if in multi-tenant mode
    const tenantId = getTenantId(req);
    const avatarPath = createDefaultAvatar(memberName, userId, memberColor, tenantId);
    if (avatarPath) {
      // MIGRATED: Update user with default avatar path using sqlManager
      await userQueries.updateUserAvatar(db, userId, avatarPath);
    }
    
    // Only generate invitation token and send email if user is not active
    let emailSent = false;
    let emailError = null;
    
    if (!isActive) {
      // Generate invitation token for email verification
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      // MIGRATED: Store invitation token using sqlManager
      await adminUserQueries.createUserInvitation(
        db,
        crypto.randomUUID(),
        userId,
        inviteToken,
        tokenExpiry.toISOString()
      );
      
      // MIGRATED: Get admin user info using sqlManager
      const adminUser = await userQueries.getUserByIdForAdmin(db, req.user.userId);
      const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Administrator';
      
      // Send invitation email
      // Note: Email notification service (getNotificationService) is not yet implemented
      try {
        // TODO: Implement email notification service when needed
        // const notificationService = getNotificationService();
        // const emailResult = await notificationService.sendUserInvitation(userId, inviteToken, adminName, baseUrl);
        // if (emailResult.success) {
        //   emailSent = true;
        //   console.log('✅ Invitation email sent for new user:', email);
        // } else {
        //   emailError = emailResult.reason || 'Email service unavailable';
        //   console.warn('⚠️ Failed to send invitation email:', emailError);
        // }
        console.log('⚠️ Email notification service not implemented - invitation email not sent');
      } catch (emailErr) {
        console.warn('⚠️ Failed to send invitation email:', emailErr.message);
        emailError = emailErr.message;
      }
    }
    
    // Publish notification for real-time updates
    console.log(`📤 Publishing user-created via ${getNotificationSystem()}`);
    await notificationService.publish('user-created', {
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
    
    // Publish member-created event for real-time member list updates
    console.log(`📤 Publishing member-created via ${getNotificationSystem()}`);
    await notificationService.publish('member-created', {
      member: {
        id: memberId,
        name: memberName,
        color: memberColor,
        userId: userId
      },
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
    // MIGRATED: Get APP_URL setting using sqlManager
    const appUrlSetting = await helpers.getSetting(db, 'APP_URL');
    
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
    // MIGRATED: Get user details using sqlManager
    const user = await userQueries.getUserByIdForAdmin(db, userId);

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

    // MIGRATED: Delete any existing invitation tokens for this user using sqlManager
    await adminUserQueries.deleteUserInvitations(db, userId);

    // Generate new invitation token
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    // MIGRATED: Store new invitation token using sqlManager
    await adminUserQueries.createUserInvitation(
      db,
      crypto.randomUUID(),
      userId,
      inviteToken,
      tokenExpiry.toISOString()
    );
    
      // MIGRATED: Get admin user info using sqlManager
      const adminUser = await userQueries.getUserByIdForAdmin(db, req.user.userId);
      const adminName = adminUser ? `${adminUser.first_name} ${adminUser.last_name}` : 'Administrator';
    
    // Send invitation email
    // Note: Email notification service (getNotificationService) is not yet implemented
    try {
      // TODO: Implement email notification service when needed
      // const notificationService = getNotificationService();
      // const emailResult = await notificationService.sendUserInvitation(userId, inviteToken, adminName, baseUrl);
      // 
      // if (emailResult && emailResult.success) {
      //   console.log('✅ Invitation resent successfully for user:', user.email);
      //   res.json({ 
      //     success: true,
      //     message: 'Invitation email sent successfully',
      //     email: user.email
      //   });
      //   return;
      // }
      console.log('⚠️ Email notification service not implemented - invitation email not sent');
      res.json({ 
        success: true,
        message: 'User invitation prepared (email service not available)',
        email: user.email
      });
      
      // Original code (commented out until email service is implemented):
      // if (emailResult && emailResult.success) {
      //   console.log('✅ Invitation resent successfully for user:', user.email);
      //   res.json({ 
      //     success: true,
      //     message: 'Invitation email sent successfully',
      //     email: user.email
      //   });
      //   return;
      // } else {
      //   // Email service returned a failure result
      //   const errorMessage = emailResult?.reason || emailResult?.error || 'Failed to send invitation email';
      //   console.error('⚠️ Failed to send invitation email:', errorMessage);
      //   res.status(500).json({ 
      //     success: false,
      //     error: errorMessage,
      //     details: emailResult?.details || null
      //   });
      // }
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
router.get('/:userId/task-count', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { userId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Get member ID using sqlManager
    const member = await userQueries.getMemberByUserId(db, userId);
    
    let taskCount = 0;
    if (member) {
      // MIGRATED: Get task count using sqlManager
      taskCount = await userQueries.getTaskCountForMember(db, member.id);
    }
    
    res.json({ count: taskCount });
  } catch (error) {
    console.error('Error getting user task count:', error);
    res.status(500).json({ error: 'Failed to get task count' });
  }
});

// Delete user
router.delete("/:userId", authenticateToken, requireRole(["admin"]), async (req, res) => {
  const { userId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // Check if user is trying to delete themselves
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // MIGRATED: Get user details before deletion using sqlManager
    const user = await userQueries.getUserByIdForAdmin(db, userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the SYSTEM user ID (00000000-0000-0000-0000-000000000000)
    const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
    const systemMemberId = '00000000-0000-0000-0000-000000000001';
    const tenantId = getTenantId(req);
    
    // MIGRATED: Get the member ID using sqlManager
    const userMember = await userQueries.getMemberByUserId(db, userId);
    
    // MIGRATED: Get all tasks that will be reassigned using sqlManager
    let tasksToReassign = [];
    if (userMember) {
      tasksToReassign = await userQueries.getTasksForMember(db, userMember.id);
      console.log(`📋 Found ${tasksToReassign.length} tasks to reassign from user ${userId} to SYSTEM`);
    }
    
    // Begin transaction for cascading deletion
    await dbTransaction(db, async () => {
      // 0. MIGRATED: Ensure SYSTEM account exists using sqlManager
      const existingSystemMember = await userQueries.getMemberById(db, systemMemberId);
      if (!existingSystemMember) {
        console.log('⚠️  SYSTEM account not found, creating it...');
        
        // MIGRATED: Check if SYSTEM user exists using sqlManager
        const existingSystemUser = await userQueries.getUserByIdForAdmin(db, SYSTEM_USER_ID);
        
        if (!existingSystemUser) {
          // Create SYSTEM user account
          const systemPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10); // Random unguessable password
          const systemAvatarPath = createDefaultAvatar('System', SYSTEM_USER_ID, '#1E40AF', tenantId);
          
          // MIGRATED: Create SYSTEM user using sqlManager
          await userQueries.createUser(db, SYSTEM_USER_ID, 'system@local', systemPasswordHash, 'System', 'User', false, 'local');
          
          // MIGRATED: Update avatar using sqlManager
          await userQueries.updateUserAvatar(db, SYSTEM_USER_ID, systemAvatarPath);
          
          // MIGRATED: Assign user role using sqlManager
          const userRole = await userQueries.getRoleByName(db, 'user');
          if (userRole) {
            await userQueries.addUserRole(db, SYSTEM_USER_ID, userRole.id);
          }
        }
        
        // MIGRATED: Create system member record using sqlManager
        await adminUserQueries.createSystemMember(db, systemMemberId, SYSTEM_USER_ID);
        
        console.log('✅ SYSTEM account created successfully');
      }
      
      // MIGRATED: Delete activity records using sqlManager
      await adminUserQueries.deleteUserActivity(db, userId);
        
        // MIGRATED: Delete comments made by the user using sqlManager
        if (userMember) {
          await adminUserQueries.deleteCommentsByMember(db, userMember.id);
        }
        
        // MIGRATED: Delete watchers using sqlManager
        if (userMember) {
          await adminUserQueries.deleteWatchersByMember(db, userMember.id);
        }
        
        // MIGRATED: Delete collaborators using sqlManager
        if (userMember) {
          await adminUserQueries.deleteCollaboratorsByMember(db, userMember.id);
        }
        
        // MIGRATED: Update planning_periods using sqlManager
        await adminUserQueries.clearPlanningPeriodsCreatedBy(db, userId);
        
        // MIGRATED: Delete user roles using sqlManager
        await userQueries.deleteUserRoles(db, userId);
        
        // MIGRATED: Delete user settings using sqlManager
        await adminUserQueries.deleteAllUserSettings(db, userId);
        
        // MIGRATED: Delete views using sqlManager
        await adminUserQueries.deleteViewsByUser(db, userId);
        
        // MIGRATED: Delete password reset tokens using sqlManager
        await adminUserQueries.deletePasswordResetTokensByUser(db, userId);
        
        // MIGRATED: Delete user invitations using sqlManager
        await adminUserQueries.deleteUserInvitations(db, userId);
        
        // MIGRATED: Reassign tasks assigned to the user to the system account using sqlManager
        if (userMember) {
          await adminUserQueries.reassignTasksToSystemMember(db, systemMemberId, userMember.id);
          
          // MIGRATED: Reassign tasks requested by the user to the system account using sqlManager
          await adminUserQueries.reassignTaskRequestersToSystemMember(db, systemMemberId, userMember.id);
        }
        
        // MIGRATED: Delete the member record using sqlManager
        if (userMember) {
          await adminUserQueries.deleteMemberByUserId(db, userId);
        }
        
        // MIGRATED: Finally, delete the user account using sqlManager
        await adminUserQueries.deleteUser(db, userId);
        
        console.log(`🗑️ User deleted successfully: ${user.email}`);
    });
    
    // Publish task-updated events for all reassigned tasks (for real-time updates)
    if (tasksToReassign.length > 0) {
      // MIGRATED: Get system member using sqlManager
      const systemMember = await userQueries.getMemberById(db, '00000000-0000-0000-0000-000000000001');
      
      if (systemMember) {
        console.log(`📤 Publishing ${tasksToReassign.length} task-updated events via ${getNotificationSystem()}`);
        for (const task of tasksToReassign) {
          // MIGRATED: Get the full updated task details using sqlManager
          const updatedTask = await taskQueries.getTaskWithRelationships(db, task.id);
          
          if (updatedTask) {
            // Task already has proper structure from getTaskWithRelationships
            // No need to parse JSON or transform
            
            notificationService.publish('task-updated', {
              boardId: task.boardId,
              task: updatedTask,
              timestamp: new Date().toISOString()
            }, getTenantId(req)).catch(err => {
              console.error('Failed to publish task-updated event:', err);
            });
          }
        }
        
        console.log(`✅ Published ${tasksToReassign.length} task-updated events via ${getNotificationSystem()}`);
      }
    }
    
    // Publish member-deleted event for real-time updates
    if (userMember) {
      console.log(`📤 Publishing member-deleted via ${getNotificationSystem()} for user deletion`);
      await notificationService.publish('member-deleted', {
        memberId: userMember.id,
        timestamp: new Date().toISOString()
      }, getTenantId(req));
      console.log(`✅ Member-deleted published via ${getNotificationSystem()}`);
    }
    
    // Publish user-deleted event for real-time updates
    console.log(`📤 Publishing user-deleted via ${getNotificationSystem()}`);
    await notificationService.publish('user-deleted', {
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
    // MIGRATED: Get member info before update using sqlManager
    const member = await userQueries.getMemberByUserIdWithColor(db, userId);
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found for this user' });
    }
    
    // MIGRATED: Update member color using sqlManager
    const result = await userQueries.updateMemberColor(db, userId, color);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Member not found for this user' });
    }
    
    // Publish notification for real-time updates
    console.log(`📤 Publishing member-updated via ${getNotificationSystem()} for color change`);
    await notificationService.publish('member-updated', {
      memberId: member.id,
      member: { id: member.id, name: member.name, color: color },
      timestamp: new Date().toISOString()
    }, getTenantId(req));
    console.log(`✅ Member-updated published via ${getNotificationSystem()}`);
    
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
    // MIGRATED: Update user's avatar_path using sqlManager
    await userQueries.updateUserAvatar(db, userId, avatarPath);
    
    // MIGRATED: Get the member ID using sqlManager
    const member = await userQueries.getMemberByUserId(db, userId);
    
    // Publish notification for real-time updates
    if (member) {
      console.log(`📤 Publishing user-profile-updated via ${getNotificationSystem()} for user:`, userId);
      await notificationService.publish('user-profile-updated', {
        userId: userId,
        memberId: member.id,
        avatarPath: avatarPath,
        timestamp: new Date().toISOString()
      }, getTenantId(req));
      console.log(`✅ User-profile-updated published via ${getNotificationSystem()}`);
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
router.delete("/:userId/avatar", authenticateToken, requireRole(["admin"]), async (req, res) => {
  const { userId } = req.params;
  const db = getRequestDatabase(req);
  
  try {
    // MIGRATED: Clear avatar_path using sqlManager
    await userQueries.updateUserAvatar(db, userId, null);
    
    // MIGRATED: Get the member ID using sqlManager
    const member = await userQueries.getMemberByUserId(db, userId);
    
    // Publish notification for real-time updates
    if (member) {
      console.log(`📤 Publishing user-profile-updated via ${getNotificationSystem()} for user:`, userId);
      await notificationService.publish('user-profile-updated', {
        userId: userId,
        memberId: member.id,
        avatarPath: null,
        timestamp: new Date().toISOString()
      }, getTenantId(req));
      console.log(`✅ User-profile-updated published via ${getNotificationSystem()}`);
    }
    
    res.json({ message: 'Avatar removed successfully' });
  } catch (error) {
    console.error('Error removing admin avatar:', error);
    res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

export default router;

