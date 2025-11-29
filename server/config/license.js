// License configuration and management
import { wrapQuery } from '../utils/queryLogger.js';
import { getStorageUsage as getStorageUsageFromUtils } from '../utils/storageUtils.js';

class LicenseManager {
  constructor(db) {
    this.db = db;
    this.enabled = process.env.LICENSE_ENABLED === 'true';
    
    // Default limits from environment variables
    this.defaultLimits = {
      USER_LIMIT: parseInt(process.env.USER_LIMIT) || 5,
      TASK_LIMIT: parseInt(process.env.TASK_LIMIT) || 100,
      BOARD_LIMIT: parseInt(process.env.BOARD_LIMIT) || 10,
      STORAGE_LIMIT: parseInt(process.env.STORAGE_LIMIT) || 1073741824, // 1GB default
      SUPPORT_TYPE: process.env.SUPPORT_TYPE || 'basic'
    };
  }

  // Get current license limits (from database if available, otherwise from environment)
  async getLimits() {
    if (!this.enabled) {
      return null; // No limits when licensing is disabled
    }

    const isMultiTenant = process.env.MULTI_TENANT === 'true';

    try {
      // Try to get limits from license_settings table first
      const licenseSettings = await wrapQuery(
        this.db.prepare('SELECT setting_key, setting_value FROM license_settings'),
        'SELECT'
      ).all();

      if (licenseSettings.length > 0) {
        // In multi-tenant mode, only use database values (no fallback to env vars)
        // In single-tenant mode, merge database values with env var defaults
        const limits = isMultiTenant ? {} : { ...this.defaultLimits };
        
        licenseSettings.forEach(setting => {
          const key = setting.setting_key;
          const value = setting.setting_value;
          
          if (key === 'SUPPORT_TYPE') {
            limits[key] = value;
          } else {
            limits[key] = parseInt(value);
          }
        });
        
        return limits;
      }
    } catch (error) {
      console.warn('Failed to read license settings from database:', error.message);
    }

    // In multi-tenant mode, never fallback to environment variables
    // Each tenant must have their license settings in the database
    if (isMultiTenant) {
      return null;
    }

    // Fallback to environment variables (only in single-tenant mode)
    return this.defaultLimits;
  }

  // Check if licensing is enabled
  isEnabled() {
    return this.enabled;
  }

  // Get user count (excluding system user)
  async getUserCount() {
    try {
      const systemUserId = '00000000-0000-0000-0000-000000000000';
      const result = await wrapQuery(
        this.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1 AND id != ?'),
        'SELECT'
      ).get(systemUserId);
      return result.count;
    } catch (error) {
      console.error('Error getting user count:', error);
      return 0;
    }
  }

  // Get task count for a specific board
  async getTaskCount(boardId) {
    try {
      const result = await wrapQuery(
        this.db.prepare('SELECT COUNT(*) as count FROM tasks WHERE boardId = ?'),
        'SELECT'
      ).get(boardId);
      return result.count;
    } catch (error) {
      console.error('Error getting task count:', error);
      return 0;
    }
  }

  // Get total task count across all boards
  async getTotalTaskCount() {
    try {
      const result = await wrapQuery(
        this.db.prepare('SELECT COUNT(*) as count FROM tasks'),
        'SELECT'
      ).get();
      return result.count;
    } catch (error) {
      console.error('Error getting total task count:', error);
      return 0;
    }
  }

  // Get board count
  async getBoardCount() {
    try {
      const result = await wrapQuery(
        this.db.prepare('SELECT COUNT(*) as count FROM boards'),
        'SELECT'
      ).get();
      return result.count;
    } catch (error) {
      console.error('Error getting board count:', error);
      return 0;
    }
  }

  // Get storage usage (uses STORAGE_USED setting which is maintained by storageUtils)
  async getStorageUsage() {
    try {
      // Use the storageUtils function which reads from STORAGE_USED setting
      // This is maintained by updateStorageUsage() whenever attachments are added/removed
      return getStorageUsageFromUtils(this.db);
    } catch (error) {
      console.error('Error getting storage usage:', error);
      return 0;
    }
  }

  // Check user limit
  async checkUserLimit() {
    if (!this.enabled) return true;

    const limits = await this.getLimits();
    if (!limits) return true;

    const userCount = await this.getUserCount();
    if (userCount >= limits.USER_LIMIT) {
      throw new Error(`User limit exceeded. Current: ${userCount}, Maximum: ${limits.USER_LIMIT}`);
    }
    return true;
  }

  // Check task limit for a board
  async checkTaskLimit(boardId) {
    if (!this.enabled) return true;

    const limits = await this.getLimits();
    if (!limits || limits.TASK_LIMIT === -1) return true; // -1 means unlimited

    const taskCount = await this.getTaskCount(boardId);
    if (taskCount >= limits.TASK_LIMIT) {
      throw new Error(`Task limit exceeded for this board. Current: ${taskCount}, Maximum: ${limits.TASK_LIMIT}`);
    }
    return true;
  }

  // Check board limit
  async checkBoardLimit() {
    if (!this.enabled) return true;

    const limits = await this.getLimits();
    if (!limits || limits.BOARD_LIMIT === -1) return true; // -1 means unlimited

    const boardCount = await this.getBoardCount();
    if (boardCount >= limits.BOARD_LIMIT) {
      throw new Error(`Board limit exceeded. Current: ${boardCount}, Maximum: ${limits.BOARD_LIMIT}`);
    }
    return true;
  }

  // Check storage limit
  async checkStorageLimit() {
    if (!this.enabled) return true;

    const limits = await this.getLimits();
    if (!limits) return true;

    const storageUsage = await this.getStorageUsage();
    if (storageUsage >= limits.STORAGE_LIMIT) {
      throw new Error(`Storage limit exceeded. Current: ${storageUsage} bytes, Maximum: ${limits.STORAGE_LIMIT} bytes`);
    }
    return true;
  }

  // Update license settings in database
  async updateLicenseSetting(key, value) {
    if (!this.enabled) return;

    try {
      await wrapQuery(
        this.db.prepare('INSERT OR REPLACE INTO license_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'),
        'INSERT'
      ).run(key, value);
    } catch (error) {
      console.error('Error updating license setting:', error);
      throw error;
    }
  }

  // Get board task counts for detailed breakdown
  async getBoardTaskCounts() {
    try {
      const boards = await wrapQuery(
        this.db.prepare(`
          SELECT 
            b.id,
            b.title,
            COUNT(t.id) as taskCount
          FROM boards b
          LEFT JOIN tasks t ON b.id = t.boardId
          GROUP BY b.id, b.title
          ORDER BY taskCount DESC, b.title ASC
        `),
        'SELECT'
      ).all();
      
      return boards.map(board => ({
        id: board.id,
        title: board.title,
        taskCount: board.taskCount
      }));
    } catch (error) {
      console.error('Error getting board task counts:', error);
      return [];
    }
  }

  // Get license information for admin display
  async getLicenseInfo() {
    if (!this.enabled) {
      const isDemoMode = process.env.DEMO_ENABLED === 'true';
      return {
        enabled: false,
        message: isDemoMode 
          ? 'Licensing is disabled (demo mode - resets hourly)'
          : 'Licensing is disabled (self-hosted mode)'
      };
    }

    try {
      const limits = await this.getLimits();
      if (!limits) {
        return {
          enabled: true,
          message: 'License limits not configured'
        };
      }

      return {
        enabled: true,
        limits: limits,
        usage: {
          users: await this.getUserCount(),
          boards: await this.getBoardCount(),
          totalTasks: await this.getTotalTaskCount(),
          storage: await this.getStorageUsage()
        },
        limitsReached: {
          users: (await this.getUserCount()) >= limits.USER_LIMIT,
          boards: (await this.getBoardCount()) >= limits.BOARD_LIMIT,
          storage: (await this.getStorageUsage()) >= limits.STORAGE_LIMIT
        },
        boardTaskCounts: await this.getBoardTaskCounts()
      };
    } catch (error) {
      console.error('Error getting license info:', error);
      return {
        enabled: true,
        error: error.message
      };
    }
  }
}

// Cache LicenseManager instances per database
// In multi-tenant mode, each tenant needs its own LicenseManager instance
// Use a WeakMap to cache instances per database object
const licenseManagerCache = new WeakMap();

export const getLicenseManager = (db) => {
  if (!db) {
    throw new Error('Database is required for LicenseManager');
  }
  
  // Check if we already have a LicenseManager for this database
  if (licenseManagerCache.has(db)) {
    return licenseManagerCache.get(db);
  }
  
  // Create new LicenseManager instance for this database
  const licenseManager = new LicenseManager(db);
  licenseManagerCache.set(db, licenseManager);
  return licenseManager;
};

export default LicenseManager;
