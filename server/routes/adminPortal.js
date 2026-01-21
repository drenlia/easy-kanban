// Admin Portal API Routes
// These endpoints allow external admin portal access using INSTANCE_TOKEN

import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { authenticateAdminPortal, adminPortalRateLimit } from '../middleware/adminAuth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import notificationService from '../services/notificationService.js';
import { getLicenseManager } from '../config/license.js';
import { getTranslator } from '../utils/i18n.js';
import { getTenantId, getRequestDatabase } from '../middleware/tenantRouting.js';
import { isPostgresDatabase } from '../utils/dbAsync.js';
// MIGRATED: Import sqlManager modules
import { users as userQueries, settings as settingsQueries, licenseSettings as licenseSettingsQueries, auth as authQueries, adminUsers as adminUserQueries, helpers } from '../utils/sqlManager/index.js';

const router = express.Router();

// Apply rate limiting to all admin portal routes
router.use(adminPortalRateLimit);

// OPTIONS requests are now handled by nginx - disable Express OPTIONS handler to avoid duplicate headers
// router.options('*', (req, res) => {
//   console.log('🔍 OPTIONS request received for:', req.path);
//   console.log('🔍 Origin:', req.headers.origin);
//   res.header('Access-Control-Allow-Origin', req.headers.origin);
//   res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//   res.header('Access-Control-Allow-Credentials', 'true');
//   res.status(200).end();
// });

// ================================
// INSTANCE INFORMATION
// ================================

// Get instance information
router.get('/info', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Read APP_URL from database settings using sqlManager
    const appUrlSetting = await helpers.getSetting(db, 'APP_URL');
    
    // In multi-tenant mode, get tenant ID from hostname
    const hostname = req.get('host') || req.hostname;
    const tenantId = req.tenantId || null;
    
    const instanceInfo = {
      instanceName: process.env.INSTANCE_NAME || 'easy-kanban-app',
      instanceToken: process.env.INSTANCE_TOKEN ? 'configured' : 'not-configured',
      domain: appUrlSetting || 'not-configured',
      hostname: hostname,
      tenantId: tenantId, // Include tenant ID in multi-tenant mode
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: instanceInfo
    });
  } catch (error) {
    console.error('Error fetching instance info:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToFetchInstanceInformation') 
    });
  }
});


// ================================
// INSTANCE OWNER MANAGEMENT
// ================================

// Get instance owner information
router.get('/owner-info', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Get OWNER setting using sqlManager
    const ownerSetting = await helpers.getSetting(db, 'OWNER');
    const ownerEmail = ownerSetting || null;
    
    res.json({
      success: true,
      data: {
        owner: ownerEmail,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error fetching owner info:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToFetchOwnerInformation') 
    });
  }
});

// Set instance owner (admin portal only)
router.put('/owner', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { email } = req.body;
    const t = await getTranslator(db);
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.ownerEmailRequired') 
      });
    }
    
    // MIGRATED: Validate that the user exists using sqlManager
    const user = await userQueries.getUserByEmail(db, email);
    if (!user) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.userWithEmailDoesNotExist') 
      });
    }
    
    // MIGRATED: Set owner in settings using sqlManager
    await settingsQueries.upsertSettingWithTimestamp(db, 'OWNER', email, new Date().toISOString());
    
    console.log(`✅ Admin portal set instance owner to: ${email}`);
    
    res.json({
      success: true,
      data: {
        owner: email,
        message: t('success.instanceOwnerSetSuccessfully'),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error setting instance owner:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToSetInstanceOwner') 
    });
  }
});

// Get all settings
router.get('/settings', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Get all settings using sqlManager
    const settings = await settingsQueries.getAllSettings(db);
    const settingsObj = {};
    settings.forEach(setting => {
      settingsObj[setting.key] = setting.value;
    });
    
    res.json({
      success: true,
      data: settingsObj
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToFetchSettings') 
    });
  }
});

// Update a single setting
router.put('/settings/:key', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { key } = req.params;
    const { value } = req.body;
    
    const t = await getTranslator(db);
    
    if (value === undefined || value === null) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.settingValueRequired') 
      });
    }
    
    // MIGRATED: Upsert setting using sqlManager
    const result = await settingsQueries.upsertSetting(db, key, value);
    
    console.log(`✅ Admin portal updated setting: ${key} = ${value}`);
    
    res.json({
      success: true,
      message: t('success.settingUpdatedSuccessfully'),
      data: { key, value }
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToUpdateSetting') 
    });
  }
});

// Update multiple settings
router.put('/settings', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const settings = req.body;
    
    const t = await getTranslator(db);
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: t('errors.settingsObjectRequired') 
      });
    }
    
    const results = [];
    
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined && value !== null) {
        // MIGRATED: Upsert setting using sqlManager
        await settingsQueries.upsertSetting(db, key, value);
        
        results.push({ key, value });
        console.log(`✅ Admin portal updated setting: ${key} = ${value}`);
      }
    }
    
    res.json({
      success: true,
      message: t('success.settingsUpdatedSuccessfully', { count: results.length }),
      data: results
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToUpdateSettings') 
    });
  }
});

// ================================
// USER MANAGEMENT
// ================================

// Get all users
router.get('/users', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Get all users with roles using sqlManager
    const usersRaw = await userQueries.getAllUsersWithRolesAndMembers(db);
    
    // Transform to match expected format (without member info for admin portal)
    const users = usersRaw.map(user => ({
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      is_active: user.is_active,
      created_at: user.created_at,
      roles: user.roles || ''
    }));
    
    // Format users data
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isActive: Boolean(user.is_active),
      roles: user.roles ? user.roles.split(',') : [],
      createdAt: user.created_at
    }));
    
    res.json({
      success: true,
      data: formattedUsers
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    const db = getRequestDatabase(req);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToFetchUsers') 
    });
  }
});

// Create a new user
router.post('/users', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { email, password, firstName, lastName, role, sendInvitation = true, isActive = false } = req.body;
    
    // Validate required fields
    if (!email || !password || !firstName || !lastName || !role) {
      const t = await getTranslator(db);
      return res.status(400).json({ 
        success: false,
        error: t('errors.emailPasswordFirstNameLastNameRoleRequired') 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const t = await getTranslator(db);
      return res.status(400).json({ 
        success: false,
        error: t('errors.invalidEmailAddressFormat') 
      });
    }
    
    // MIGRATED: Check if email already exists using sqlManager
    const existingUser = await userQueries.checkEmailExists(db, email);
    if (existingUser) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.userWithEmailAlreadyExists') 
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // MIGRATED: Create user using sqlManager
    const userId = crypto.randomUUID();
    await userQueries.createUser(db, userId, email, passwordHash, firstName, lastName, isActive, 'local');
    
    // MIGRATED: Assign role using sqlManager
    const roleObj = await userQueries.getRoleByName(db, role);
    if (roleObj) {
      await userQueries.addUserRole(db, userId, roleObj.id);
    }
    
    // Create member for the user
    const memberId = crypto.randomUUID();
    const memberColor = '#4ECDC4'; // Default color
    // Ensure member name doesn't exceed 30 characters
    let memberName = `${firstName} ${lastName}`.trim();
    if (memberName.length > 30) {
      memberName = memberName.substring(0, 30);
    }
    // MIGRATED: Create member using auth.createMemberForUser
    await authQueries.createMemberForUser(db, memberId, memberName, memberColor, userId);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    console.log('📤 Publishing user-created and member-created to Redis for admin portal');
    await notificationService.publish('user-created', {
      user: { 
        id: userId, 
        email, 
        firstName, 
        lastName, 
        role, 
        isActive: !!isActive,
        displayName: memberName,
        memberColor: memberColor,
        authProvider: 'local',
        createdAt: new Date().toISOString(),
        joined: new Date().toISOString()
      },
      member: { id: memberId, name: memberName, color: memberColor },
      timestamp: new Date().toISOString()
    }, tenantId).catch(err => {
      console.error('Failed to publish user-created event:', err);
    });
    
    await notificationService.publish('member-created', {
      member: {
        id: memberId,
        name: memberName,
        color: memberColor,
        userId: userId
      },
      timestamp: new Date().toISOString()
    }, tenantId).catch(err => {
      console.error('Failed to publish member-created event:', err);
    });
    
    console.log(`✅ Admin portal created user: ${email} (${firstName} ${lastName})`);
    
    const t = await getTranslator(db);
    res.json({
      success: true,
      message: t('success.userCreatedSuccessfully'),
      data: {
        id: userId,
        email,
        firstName,
        lastName,
        role,
        isActive: !!isActive
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    try {
      const db = getRequestDatabase(req);
      const t = await getTranslator(db);
      res.status(500).json({ 
        success: false,
        error: t('errors.failedToCreateUser') 
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to create user' 
      });
    }
  }
});

// Update user
router.put('/users/:userId', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { userId } = req.params;
    const { email, firstName, lastName, role, isActive } = req.body;
    
    // MIGRATED: Check if user exists using sqlManager
    const user = await userQueries.getUserByIdForAdmin(db, userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }
    
    // MIGRATED: Update user fields using sqlManager
    await userQueries.updateUser(db, userId, { email, firstName, lastName, isActive });
    
    // MIGRATED: Update role if provided using sqlManager
    let roleChanged = false;
    if (role !== undefined) {
      // Get current role to check if it changed
      const currentRole = await userQueries.getUserRole(db, userId);
      
      if (currentRole !== role) {
        roleChanged = true;
        // Remove existing roles
        await userQueries.deleteUserRoles(db, userId);
        
        // Add new role
        const roleObj = await userQueries.getRoleByName(db, role);
        if (roleObj) {
          await userQueries.addUserRole(db, userId, roleObj.id);
        }
      }
    }
    
    // MIGRATED: Get updated user data using sqlManager
    const updatedUser = await userQueries.getUserByIdForAdmin(db, userId);
    
    // Get user's roles as comma-separated string (matching GET /users format)
    const userRolesResult = await userQueries.getUserRole(db, userId);
    const rolesArray = userRolesResult ? [userRolesResult] : [];
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    console.log('📤 Publishing user-updated to Redis for admin portal user update');
    await notificationService.publish('user-updated', {
      user: {
        id: updatedUser.id,
        email: updatedUser.email || email,
        firstName: updatedUser.first_name || firstName,
        lastName: updatedUser.last_name || lastName,
        isActive: Boolean(updatedUser.is_active),
        authProvider: updatedUser.auth_provider || null,
        googleAvatarUrl: updatedUser.google_avatar_url || null,
        createdAt: updatedUser.created_at,
        joined: updatedUser.created_at
      },
      timestamp: new Date().toISOString()
    }, tenantId).catch(err => {
      console.error('Failed to publish user-updated event:', err);
    });
    
    // Publish role update if role changed
    if (roleChanged) {
      console.log('📤 Publishing user-role-updated to Redis for admin portal role change');
      await notificationService.publish('user-role-updated', {
        userId: userId,
        role: role,
        timestamp: new Date().toISOString()
      }, tenantId).catch(err => {
        console.error('Failed to publish user-role-updated event:', err);
      });
    }
    
    console.log(`✅ Admin portal updated user: ${userId}`);
    
    const t = await getTranslator(db);
    res.json({
      success: true,
      message: t('success.userUpdatedSuccessfully'),
      data: {
        id: updatedUser.id,
        email: updatedUser.email || email,
        firstName: updatedUser.first_name || firstName,
        lastName: updatedUser.last_name || lastName,
        roles: rolesArray,
        isActive: Boolean(updatedUser.is_active),
        createdAt: updatedUser.created_at
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    try {
      const db = getRequestDatabase(req);
      const t = await getTranslator(db);
      res.status(500).json({ 
        success: false,
        error: t('errors.failedToUpdateUser') 
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to update user' 
      });
    }
  }
});

// Delete user
router.delete('/users/:userId', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { userId } = req.params;
    
    const t = await getTranslator(db);
    
    // MIGRATED: Check if user exists using sqlManager
    const user = await userQueries.getUserByIdForAdmin(db, userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: t('errors.userNotFound') 
      });
    }
    
    // MIGRATED: Delete user using adminUsers.deleteUser
    await adminUserQueries.deleteUser(db, userId);
    
    console.log(`✅ Admin portal deleted user: ${userId} (${user.email})`);
    
    res.json({
      success: true,
      message: t('success.userDeletedSuccessfully')
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToDeleteUser') 
    });
  }
});

// ================================
// HEALTH CHECK
// ================================

// Health check endpoint
router.get('/health', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // Check database connection
    // MIGRATED: Simple health check - use a simple query
    // For health check, we can just try to get a setting or use a simple query
    const dbCheck = await helpers.getSetting(db, 'APP_URL');
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: dbCheck ? 'connected' : 'disconnected',
      instanceToken: 'configured'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// ================================
// PLAN MANAGEMENT
// ================================

// Get plan information and limits
router.get('/plan', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // Get LicenseManager instance
    const licenseManager = getLicenseManager(db);
    
    console.log('🔍 LicenseManager created, checking license info...');
    
    // Get actual license information with current usage
    const licenseInfo = await licenseManager.getLicenseInfo();
    console.log('🔍 License info:', JSON.stringify(licenseInfo, null, 2));
    
    if (!licenseInfo.enabled) {
      const isDemoMode = process.env.DEMO_ENABLED === 'true';
      return res.json({
        success: true,
        data: {
          plan: 'unlimited',
          message: isDemoMode 
            ? 'Licensing disabled (demo mode - resets hourly)'
            : 'Licensing disabled (self-hosted mode)',
          features: []
        }
      });
    }

    if (!licenseInfo.limits) {
      return res.json({
        success: true,
        data: {
          plan: 'unlimited',
          message: 'No limits configured',
          features: []
        }
      });
    }

    const isMultiTenant = process.env.MULTI_TENANT === 'true';
    
    // Get database values from license_settings table
    const dbSettings = {};
    try {
      // MIGRATED: Get all license settings using sqlManager
      const licenseSettings = await licenseSettingsQueries.getAllLicenseSettings(db);
      licenseSettings.forEach(setting => {
        if (['USER_LIMIT', 'TASK_LIMIT', 'BOARD_LIMIT', 'STORAGE_LIMIT', 'SUPPORT_TYPE'].includes(setting.settingKey)) {
          // Parse numeric values, keep string values as-is
          if (setting.settingKey === 'SUPPORT_TYPE') {
            dbSettings[setting.settingKey] = setting.settingValue;
          } else {
            dbSettings[setting.settingKey] = parseInt(setting.settingValue);
          }
        }
      });
    } catch (error) {
      console.warn('License settings table not found or accessible:', error.message);
    }

    // Format storage size for display
    const formatBytes = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    // In multi-tenant mode, database values are the source of truth
    // In single-tenant mode, licenseInfo.limits already merges db with env vars
    // For display purposes, prioritize database values when available
    const getDisplayValue = (key) => {
      if (isMultiTenant) {
        // In multi-tenant mode, always use database value if available
        return dbSettings[key] !== undefined ? dbSettings[key] : licenseInfo.limits[key];
      } else {
        // In single-tenant mode, licenseInfo.limits already has the merged value
        return licenseInfo.limits[key];
      }
    };

    const planInfo = {
      plan: getDisplayValue('SUPPORT_TYPE') || 'basic',
      usage: licenseInfo.usage,
      limitsReached: licenseInfo.limitsReached,
      // For backward compatibility, also include the limits object with display values
      limits: {
        USER_LIMIT: getDisplayValue('USER_LIMIT'),
        TASK_LIMIT: getDisplayValue('TASK_LIMIT'),
        BOARD_LIMIT: getDisplayValue('BOARD_LIMIT'),
        STORAGE_LIMIT: getDisplayValue('STORAGE_LIMIT'),
        SUPPORT_TYPE: getDisplayValue('SUPPORT_TYPE')
      },
      features: [
        {
          key: 'USER_LIMIT',
          value: getDisplayValue('USER_LIMIT'),
          inMemory: isMultiTenant ? null : licenseInfo.limits.USER_LIMIT, // Only show in-memory in single-tenant
          database: dbSettings.USER_LIMIT !== undefined ? dbSettings.USER_LIMIT : null,
          currentUsage: licenseInfo.usage.users,
          limitReached: licenseInfo.limitsReached.users
        },
        {
          key: 'TASK_LIMIT',
          value: getDisplayValue('TASK_LIMIT'),
          inMemory: isMultiTenant ? null : licenseInfo.limits.TASK_LIMIT,
          database: dbSettings.TASK_LIMIT !== undefined ? dbSettings.TASK_LIMIT : null,
          currentUsage: licenseInfo.usage.totalTasks,
          limitReached: false // Task limit is per board, not global
        },
        {
          key: 'BOARD_LIMIT',
          value: getDisplayValue('BOARD_LIMIT'),
          inMemory: isMultiTenant ? null : licenseInfo.limits.BOARD_LIMIT,
          database: dbSettings.BOARD_LIMIT !== undefined ? dbSettings.BOARD_LIMIT : null,
          currentUsage: licenseInfo.usage.boards,
          limitReached: licenseInfo.limitsReached.boards
        },
        {
          key: 'STORAGE_LIMIT',
          value: getDisplayValue('STORAGE_LIMIT'),
          inMemory: isMultiTenant ? null : licenseInfo.limits.STORAGE_LIMIT,
          database: dbSettings.STORAGE_LIMIT !== undefined ? dbSettings.STORAGE_LIMIT : null,
          currentUsage: licenseInfo.usage.storage,
          currentUsageFormatted: formatBytes(licenseInfo.usage.storage),
          limitReached: licenseInfo.limitsReached.storage
        },
        {
          key: 'SUPPORT_TYPE',
          value: getDisplayValue('SUPPORT_TYPE'),
          inMemory: isMultiTenant ? null : licenseInfo.limits.SUPPORT_TYPE,
          database: dbSettings.SUPPORT_TYPE !== undefined ? dbSettings.SUPPORT_TYPE : null
        }
      ],
      boardTaskCounts: licenseInfo.boardTaskCounts
    };

    res.json({
      success: true,
      data: planInfo
    });
  } catch (error) {
    console.error('Error fetching plan info:', error);
    
    const isMultiTenant = process.env.MULTI_TENANT === 'true';
    
    // In multi-tenant mode, never fallback to environment variables
    // Each tenant must have their license settings in the database
    if (isMultiTenant) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch license information. License settings must be configured in the database for this tenant.',
        message: 'In multi-tenant mode, license settings are tenant-specific and must be stored in the database.'
      });
    }
    
    // Fallback to environment variables only in single-tenant mode
    console.log('🔄 Falling back to environment variables (single-tenant mode)...');
    const fallbackLimits = {
      USER_LIMIT: parseInt(process.env.USER_LIMIT) || 5,
      TASK_LIMIT: parseInt(process.env.TASK_LIMIT) || 100,
      BOARD_LIMIT: parseInt(process.env.BOARD_LIMIT) || 10,
      STORAGE_LIMIT: parseInt(process.env.STORAGE_LIMIT) || 1073741824,
      SUPPORT_TYPE: process.env.SUPPORT_TYPE || 'basic'
    };

    const fallbackInfo = {
      plan: fallbackLimits.SUPPORT_TYPE,
      features: [
        {
          key: 'USER_LIMIT',
          inMemory: fallbackLimits.USER_LIMIT,
          database: null,
          currentUsage: 'N/A',
          limitReached: false
        },
        {
          key: 'TASK_LIMIT',
          inMemory: fallbackLimits.TASK_LIMIT,
          database: null,
          currentUsage: 'N/A',
          limitReached: false
        },
        {
          key: 'BOARD_LIMIT',
          inMemory: fallbackLimits.BOARD_LIMIT,
          database: null,
          currentUsage: 'N/A',
          limitReached: false
        },
        {
          key: 'STORAGE_LIMIT',
          inMemory: fallbackLimits.STORAGE_LIMIT,
          database: null,
          currentUsage: 'N/A',
          currentUsageFormatted: 'N/A',
          limitReached: false
        },
        {
          key: 'SUPPORT_TYPE',
          inMemory: fallbackLimits.SUPPORT_TYPE,
          database: null
        }
      ]
    };

    res.json({
      success: true,
      data: fallbackInfo,
      warning: 'Using fallback data - LicenseManager failed'
    });
  }
});

// Update plan setting
router.put('/plan/:key', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { key } = req.params;
    const { value } = req.body;

    const t = await getTranslator(db);
    
    // Validate key
    const allowedKeys = ['USER_LIMIT', 'TASK_LIMIT', 'BOARD_LIMIT', 'STORAGE_LIMIT', 'SUPPORT_TYPE'];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.invalidPlanSettingKey') 
      });
    }

    // Validate value based on key type
    if (key !== 'SUPPORT_TYPE' && value !== null) {
      const numValue = parseInt(value);
      if (isNaN(numValue) || numValue < -1) {
        return res.status(400).json({ 
          success: false,
          error: t('errors.valueMustBePositiveNumber') 
        });
      }
    }

    // MIGRATED: Update or insert license setting using sqlManager
    await licenseSettingsQueries.upsertLicenseSetting(db, key, value);

    console.log(`✅ Admin portal updated plan setting: ${key} = ${value}`);

    res.json({
      success: true,
      message: t('success.planSettingUpdatedSuccessfully'),
      data: { key, value }
    });
  } catch (error) {
    console.error('Error updating plan setting:', error);
    try {
      const db = getRequestDatabase(req);
      const t = await getTranslator(db);
      res.status(500).json({ 
        success: false,
        error: t('errors.failedToUpdatePlanSetting') 
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to update plan setting' 
      });
    }
  }
});

// Delete plan setting (remove database override)
router.delete('/plan/:key', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { key } = req.params;

    const t = await getTranslator(db);
    
    // Validate key
    const allowedKeys = ['USER_LIMIT', 'TASK_LIMIT', 'BOARD_LIMIT', 'STORAGE_LIMIT', 'SUPPORT_TYPE'];
    if (!allowedKeys.includes(key)) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.invalidPlanSettingKey') 
      });
    }

    // MIGRATED: Delete the license setting using sqlManager
    const result = await licenseSettingsQueries.deleteLicenseSetting(db, key);

    if (result.changes === 0) {
      return res.status(404).json({ 
        success: false,
        error: t('errors.planSettingNotFound') 
      });
    }

    console.log(`✅ Admin portal deleted plan setting override: ${key}`);

    res.json({
      success: true,
      message: t('success.planSettingOverrideDeletedSuccessfully'),
      data: { key }
    });
  } catch (error) {
    console.error('Error deleting plan setting:', error);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToDeletePlanSetting') 
    });
  }
});

// ================================
// ENHANCED SETTINGS MANAGEMENT
// ================================

// Delete a setting
router.delete('/settings/:key', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { key } = req.params;

    const t = await getTranslator(db);
    // MIGRATED: Delete setting using sqlManager
    const result = await settingsQueries.deleteSetting(db, key);
    
    if (result.changes === 0) {
      return res.status(404).json({ 
        success: false,
        error: t('errors.settingNotFound') 
      });
    }

    console.log(`✅ Admin portal deleted setting: ${key}`);

    res.json({
      success: true,
      message: t('success.settingDeletedSuccessfully')
    });
  } catch (error) {
    console.error('Error deleting setting:', error);
    try {
      const db = getRequestDatabase(req);
      const t = await getTranslator(db);
      res.status(500).json({ 
        success: false,
        error: t('errors.failedToDeleteSetting') 
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to delete setting' 
      });
    }
  }
});

// Add a new setting
router.post('/settings', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { key, value } = req.body;

    const t = await getTranslator(db);
    
    if (!key || value === undefined) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.keyAndValueRequired') 
      });
    }

    // MIGRATED: Check if setting already exists using sqlManager
    const existingSetting = await settingsQueries.checkSettingExists(db, key);
    if (existingSetting) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.settingWithKeyAlreadyExists') 
      });
    }

    // MIGRATED: Insert new setting using sqlManager
    await settingsQueries.createSetting(db, key, value);

    console.log(`✅ Admin portal created setting: ${key} = ${value}`);

    res.json({
      success: true,
      message: t('success.settingCreatedSuccessfully'),
      data: { key, value }
    });
  } catch (error) {
    console.error('Error creating setting:', error);
    try {
      const db = getRequestDatabase(req);
      const t = await getTranslator(db);
      res.status(500).json({ 
        success: false,
        error: t('errors.failedToCreateSetting') 
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to create setting' 
      });
    }
  }
});

// ================================
// INSTANCE STATUS MANAGEMENT
// ================================

// Update instance status in settings
router.put('/instance-status', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { status } = req.body;

    const t = await getTranslator(db);
    
    // Validate status
    const validStatuses = ['deploying', 'active', 'suspended', 'terminated', 'failed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.invalidStatus') 
      });
    }

    // Update or insert INSTANCE_STATUS setting
    // MIGRATED: Upsert instance status using sqlManager
    await settingsQueries.upsertSetting(db, 'INSTANCE_STATUS', status);

    console.log(`✅ Admin portal updated instance status to: ${status}`);

    // Publish instance status update to Redis for real-time updates
    const tenantId = getTenantId(req);
    notificationService.publish('instance-status-updated', {
      status,
      timestamp: new Date().toISOString()
    }, tenantId);

    res.json({
      success: true,
      message: t('success.instanceStatusUpdatedSuccessfully'),
      data: { status }
    });
  } catch (error) {
    console.error('Error updating instance status:', error);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToUpdateInstanceStatus') 
    });
  }
});

// Get current instance status
router.get('/instance-status', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    // MIGRATED: Get instance status using sqlManager
    const statusSetting = await helpers.getSetting(db, 'INSTANCE_STATUS');
    const status = statusSetting || 'active';

    res.json({
      success: true,
      data: { status }
    });
  } catch (error) {
    console.error('Error fetching instance status:', error);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToFetchInstanceStatus') 
    });
  }
});

// ================================
// USER MANAGEMENT ENHANCEMENTS
// ================================

// Update user
router.put('/users/:userId', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { userId } = req.params;
    const { email, firstName, lastName, role, isActive } = req.body;
    
    const t = await getTranslator(db);
    
    // Validate required fields
    if (!email || !firstName || !lastName || !role) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.emailFirstNameLastNameRoleRequired') 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.invalidEmailAddressFormat') 
      });
    }
    
    // MIGRATED: Check if user exists using sqlManager
    const existingUser = await userQueries.getUserByIdForAdmin(db, userId);
    if (!existingUser) {
      return res.status(404).json({ 
        success: false,
        error: t('errors.userNotFound') 
      });
    }
    
    // MIGRATED: Check if email is already taken using sqlManager
    const emailTaken = await userQueries.checkEmailExists(db, email, userId);
    if (emailTaken) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.emailAlreadyTakenByAnotherUser') 
      });
    }
    
    // MIGRATED: Update user using sqlManager
    await userQueries.updateUser(db, userId, { email, firstName, lastName, isActive });
    
    // MIGRATED: Update role using sqlManager
    const roleObj = await userQueries.getRoleByName(db, role);
    if (roleObj) {
      // Remove existing roles
      await userQueries.deleteUserRoles(db, userId);
      // Add new role
      await userQueries.addUserRole(db, userId, roleObj.id);
    }
    
    // MIGRATED: Update member name using sqlManager
    await userQueries.updateMemberName(db, userId, `${firstName} ${lastName}`);
    
    // MIGRATED: Get updated user data using sqlManager
    const updatedUser = await userQueries.getUserByIdForAdmin(db, userId);
    
    // Publish to Redis for real-time updates
    const tenantId = getTenantId(req);
    console.log('📤 Publishing user-updated and user-role-updated to Redis for admin portal user update');
    await notificationService.publish('user-updated', {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.first_name,
        lastName: updatedUser.last_name,
        isActive: Boolean(updatedUser.is_active),
        authProvider: updatedUser.auth_provider || null,
        googleAvatarUrl: updatedUser.google_avatar_url || null,
        createdAt: updatedUser.created_at,
        joined: updatedUser.created_at
      },
      timestamp: new Date().toISOString()
    }, tenantId).catch(err => {
      console.error('Failed to publish user-updated event:', err);
    });
    
    // Publish role update
    await notificationService.publish('user-role-updated', {
      userId: userId,
      role: role,
      timestamp: new Date().toISOString()
    }, tenantId).catch(err => {
      console.error('Failed to publish user-role-updated event:', err);
    });
    
    console.log(`✅ Admin portal updated user: ${email} (${firstName} ${lastName})`);
    
    res.json({
      success: true,
      message: t('success.userUpdatedSuccessfully'),
      data: {
        id: userId,
        email,
        firstName,
        lastName,
        role,
        isActive: !!isActive
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    try {
      const db = getRequestDatabase(req);
      const t = await getTranslator(db);
      res.status(500).json({ 
        success: false,
        error: t('errors.failedToUpdateUser') 
      });
    } catch (fallbackError) {
      res.status(500).json({ 
        success: false,
        error: 'Failed to update user' 
      });
    }
  }
});

// Send invitation email to user
router.post('/send-invitation', authenticateAdminPortal, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const { email, adminName } = req.body;
    
    const t = await getTranslator(db);
    
    if (!email) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.emailRequired') 
      });
    }
    
    // Find user by email
    // MIGRATED: Get user by email using sqlManager
    const user = await userQueries.getUserByEmail(db, email);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: t('errors.userNotFound') 
      });
    }
    
    // Check if user is already active
    if (user.is_active) {
      return res.status(400).json({ 
        success: false,
        error: t('errors.userAlreadyActive') 
      });
    }
    
    // Generate invitation token
    const inviteToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    
    // Store invitation token
    // MIGRATED: Create user invitation using sqlManager
    const invitationId = crypto.randomUUID();
    await adminUserQueries.createUserInvitation(db, invitationId, user.id, inviteToken, expiresAt.toISOString());
    
    // MIGRATED: Get site name from settings using sqlManager
    const siteNameSetting = await helpers.getSetting(db, 'SITE_NAME');
    const siteName = siteNameSetting || 'Easy Kanban';
    
    // MIGRATED: Generate invitation URL using tenant-specific URL using sqlManager
    // Priority: 1) APP_URL from database (tenant-specific, set by frontend), 2) Construct from tenantId, 3) Fallback
    const appUrlSetting = await helpers.getSetting(db, 'APP_URL');
    let baseUrl = process.env.BASE_URL;
    
    if (!baseUrl) {
      if (appUrlSetting) {
        // Use APP_URL from database (most reliable - tenant-specific)
        baseUrl = appUrlSetting;
      } else {
        // Construct from tenantId if available (multi-tenant mode)
        const tenantId = req.tenantId;
        if (tenantId) {
          const domain = process.env.TENANT_DOMAIN || 'ezkan.cloud';
          baseUrl = `https://${tenantId}.${domain}`;
        } else {
          // Single-tenant fallback
          const instanceName = process.env.INSTANCE_NAME || 'easy-kanban-app';
          const domain = process.env.TENANT_DOMAIN || 'ezkan.cloud';
          baseUrl = `https://${instanceName}.${domain}`;
        }
      }
    }
    
    // Remove trailing slash if present
    baseUrl = baseUrl.replace(/\/$/, '');
    const inviteUrl = `${baseUrl}/invite/${inviteToken}`;
    
    // Send invitation email using a fresh notification service instance
    // This ensures it reads the latest email settings from the database
    try {
      const { NotificationService } = await import('../services/notificationService.js');
      const notificationService = new NotificationService(db);
      await notificationService.sendUserInvitation(user.id, inviteToken, adminName || 'Admin', baseUrl);
    } catch (importError) {
      console.error('Error importing NotificationService:', importError);
      // Note: Email notification service (getNotificationService) is not yet implemented
      // Fallback is not available - email service needs to be implemented
      console.warn('⚠️ Email notification service not available - invitation email not sent');
    }
    
    console.log(`✅ Invitation sent to user: ${email}`);
    
    res.json({
      success: true,
      message: t('success.invitationSentSuccessfully'),
      data: {
        email: user.email,
        inviteUrl: inviteUrl,
        expiresAt: expiresAt.toISOString()
      }
    });
  } catch (error) {
    console.error('Error sending invitation:', error);
    const t = await getTranslator(db);
    res.status(500).json({ 
      success: false,
      error: t('errors.failedToSendInvitation') 
    });
  }
});

export default router;
