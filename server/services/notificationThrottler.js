import { wrapQuery } from '../utils/queryLogger.js';

/**
 * Notification Throttler Service
 * Handles throttling of notifications to prevent spam
 * Accumulates changes and sends consolidated notifications
 */
class NotificationThrottler {
  constructor(db) {
    this.db = db;
    this.pendingNotifications = new Map(); // userId -> taskId -> notification data
    this.throttleTimers = new Map(); // userId -> taskId -> timer
  }

  /**
   * Get notification delay setting from database
   */
  getNotificationDelay() {
    try {
      const setting = wrapQuery(
        this.db.prepare('SELECT value FROM settings WHERE key = ?'),
        'SELECT'
      ).get('NOTIFICATION_DELAY');
      
      return setting ? parseInt(setting.value, 10) : 30; // Default 30 minutes
    } catch (error) {
      console.warn('Failed to get notification delay setting:', error.message);
      return 30; // Default 30 minutes
    }
  }

  /**
   * Add a notification to the throttling queue
   */
  addNotification(userId, taskId, notificationData) {
    const delay = this.getNotificationDelay();
    
    // If delay is 0, send immediately
    if (delay === 0) {
      return this.sendImmediateNotification(userId, taskId, notificationData);
    }

    // Create key for this user-task combination
    const key = `${userId}-${taskId}`;
    
    // Initialize pending notifications for this user if not exists
    if (!this.pendingNotifications.has(userId)) {
      this.pendingNotifications.set(userId, new Map());
    }
    
    const userNotifications = this.pendingNotifications.get(userId);
    
    // If this is the first notification for this task, create the entry
    if (!userNotifications.has(taskId)) {
      userNotifications.set(taskId, {
        task: notificationData.task,
        changes: [],
        participants: notificationData.participants,
        actor: notificationData.actor,
        notificationType: notificationData.notificationType,
        firstChangeTime: new Date()
      });
    }
    
    // Add this change to the accumulated changes
    const taskNotification = userNotifications.get(taskId);
    taskNotification.changes.push({
      action: notificationData.action,
      details: notificationData.details,
      oldValue: notificationData.oldValue,
      newValue: notificationData.newValue,
      timestamp: new Date()
    });
    
    // Clear existing timer for this user-task combination
    if (this.throttleTimers.has(key)) {
      clearTimeout(this.throttleTimers.get(key));
    }
    
    // Set new timer to send notification after delay
    const timer = setTimeout(() => {
      this.sendThrottledNotification(userId, taskId);
    }, delay * 60 * 1000); // Convert minutes to milliseconds
    
    this.throttleTimers.set(key, timer);
    
    console.log(`📧 [THROTTLER] Notification queued for user ${userId}, task ${taskId}. Will send in ${delay} minutes.`);
  }

  /**
   * Send immediate notification (when delay is 0)
   */
  async sendImmediateNotification(userId, taskId, notificationData) {
    try {
      console.log(`📧 [THROTTLER] Sending immediate notification to user ${userId} for task ${taskId} (delay=0)`);
      const { getNotificationService } = await import('./notificationService.js');
      const notificationService = getNotificationService();
      
      if (notificationService) {
        // Send email directly without going through the main notification flow
        await notificationService.sendEmailDirectly(notificationData);
        console.log(`✅ [THROTTLER] Immediate notification sent successfully to user ${userId} for task ${taskId}`);
      } else {
        console.warn(`⚠️ [THROTTLER] Notification service not available for immediate notification to user ${userId}`);
      }
    } catch (error) {
      console.error(`❌ [THROTTLER] Failed to send immediate notification to user ${userId}:`, error);
    }
  }

  /**
   * Send throttled notification (consolidated changes)
   */
  async sendThrottledNotification(userId, taskId) {
    try {
      console.log(`📧 [THROTTLER] Processing throttled notification for user ${userId}, task ${taskId}`);
      
      const userNotifications = this.pendingNotifications.get(userId);
      if (!userNotifications || !userNotifications.has(taskId)) {
        console.warn(`⚠️ [THROTTLER] No pending notification found for user ${userId}, task ${taskId}`);
        return;
      }
      
      const taskNotification = userNotifications.get(taskId);
      console.log(`📧 [THROTTLER] Found ${taskNotification.changes.length} changes to consolidate for user ${userId}, task ${taskId}`);
      
      const { getNotificationService } = await import('./notificationService.js');
      const notificationService = getNotificationService();
      
      if (!notificationService) {
        console.warn('⚠️ [THROTTLER] Notification service not available');
        return;
      }
      
      // Create consolidated notification data
      const consolidatedData = {
        userId,
        taskId,
        action: 'consolidated_update',
        details: this.formatConsolidatedChanges(taskNotification.changes),
        task: taskNotification.task,
        participants: taskNotification.participants,
        actor: taskNotification.actor,
        notificationType: taskNotification.notificationType,
        changeCount: taskNotification.changes.length,
        timeSpan: this.calculateTimeSpan(taskNotification.firstChangeTime, new Date())
      };
      
      console.log(`📧 [THROTTLER] Sending consolidated notification to user ${userId} for task ${taskId} with ${taskNotification.changes.length} changes`);
      
      // Send the consolidated notification
      await notificationService.sendTaskNotification(consolidatedData);
      
      // Clean up
      userNotifications.delete(taskId);
      if (userNotifications.size === 0) {
        this.pendingNotifications.delete(userId);
      }
      
      const key = `${userId}-${taskId}`;
      this.throttleTimers.delete(key);
      
      console.log(`✅ [THROTTLER] Consolidated notification sent successfully to user ${userId} for task ${taskId} (${taskNotification.changes.length} changes)`);
      
    } catch (error) {
      console.error(`❌ [THROTTLER] Failed to send throttled notification to user ${userId}, task ${taskId}:`, error);
    }
  }

  /**
   * Format consolidated changes for display
   */
  formatConsolidatedChanges(changes) {
    if (changes.length === 1) {
      return changes[0].details;
    }
    
    const changeTypes = changes.map(change => change.action).filter((value, index, self) => self.indexOf(value) === index);
    const timeSpan = this.calculateTimeSpan(changes[0].timestamp, changes[changes.length - 1].timestamp);
    
    return `${changes.length} changes made (${changeTypes.join(', ')}) over ${timeSpan}`;
  }

  /**
   * Calculate human-readable time span
   */
  calculateTimeSpan(startTime, endTime) {
    const diffMs = endTime - startTime;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) {
      return 'less than a minute';
    } else if (diffMinutes === 1) {
      return '1 minute';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} minutes`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      return diffHours === 1 ? '1 hour' : `${diffHours} hours`;
    }
  }

  /**
   * Force send all pending notifications (for shutdown, etc.)
   */
  async flushAllNotifications() {
    console.log('🔄 Flushing all pending notifications...');
    
    for (const [userId, userNotifications] of this.pendingNotifications) {
      for (const [taskId, taskNotification] of userNotifications) {
        await this.sendThrottledNotification(userId, taskId);
      }
    }
    
    // Clear all timers
    for (const timer of this.throttleTimers.values()) {
      clearTimeout(timer);
    }
    
    this.pendingNotifications.clear();
    this.throttleTimers.clear();
    
    console.log('✅ All pending notifications flushed');
  }

  /**
   * Get pending notifications count for a user
   */
  getPendingCount(userId) {
    const userNotifications = this.pendingNotifications.get(userId);
    return userNotifications ? userNotifications.size : 0;
  }

  /**
   * Get all pending notifications for debugging
   */
  getPendingNotifications() {
    const result = {};
    for (const [userId, userNotifications] of this.pendingNotifications) {
      result[userId] = {};
      for (const [taskId, taskNotification] of userNotifications) {
        result[userId][taskId] = {
          changeCount: taskNotification.changes.length,
          firstChangeTime: taskNotification.firstChangeTime,
          notificationType: taskNotification.notificationType
        };
      }
    }
    return result;
  }
}

// Export singleton instance
let notificationThrottler = null;

export const initNotificationThrottler = (db) => {
  notificationThrottler = new NotificationThrottler(db);
  return notificationThrottler;
};

export const getNotificationThrottler = () => {
  return notificationThrottler;
};

export { NotificationThrottler };
