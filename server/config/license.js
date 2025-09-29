// License configuration and management
import { wrapQuery } from '../utils/database.js';

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

    try {
      // Try to get limits from license_settings table first
      const licenseSettings = wrapQuery(
        this.db.prepare('SELECT setting_key, setting_value FROM license_settings'),
        'SELECT'
      ).all();

      if (licenseSettings.length > 0) {
        const limits = { ...this.defaultLimits };
        
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

    // Fallback to environment variables
    return this.defaultLimits;
  }

  // Check if licensing is enabled
  isEnabled() {
    return this.enabled;
  }

  // Get user count
  async getUserCount() {
    try {
      const result = wrapQuery(
        this.db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1'),
        'SELECT'
      ).get();
      return result.count;
    } catch (error) {
      console.error('Error getting user count:', error);
      return 0;
    }
  }

  // Get task count for a specific board
  async getTaskCount(boardId) {
    try {
      const result = wrapQuery(
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
      const result = wrapQuery(
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
      const result = wrapQuery(
        this.db.prepare('SELECT COUNT(*) as count FROM boards'),
        'SELECT'
      ).get();
      return result.count;
    } catch (error) {
      console.error('Error getting board count:', error);
      return 0;
    }
  }

  // Get storage usage (placeholder - would need actual file size calculation)
  async getStorageUsage() {
    try {
      // This is a placeholder - in a real implementation, you'd calculate actual file sizes
      const result = wrapQuery(
        this.db.prepare('SELECT SUM(size) as total_size FROM attachments'),
        'SELECT'
      ).get();
      return result.total_size || 0;
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
      wrapQuery(
        this.db.prepare('INSERT OR REPLACE INTO license_settings (setting_key, setting_value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'),
        'INSERT'
      ).run(key, value);
    } catch (error) {
      console.error('Error updating license setting:', error);
      throw error;
    }
  }

  // Get license information for admin display
  async getLicenseInfo() {
    if (!this.enabled) {
      return {
        enabled: false,
        message: 'Licensing is disabled (self-hosted mode)'
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
        }
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

// Create singleton instance
let licenseManager = null;

export const getLicenseManager = (db) => {
  if (!licenseManager) {
    licenseManager = new LicenseManager(db);
  }
  return licenseManager;
};

export default LicenseManager;
