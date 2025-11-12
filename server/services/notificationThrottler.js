import { wrapQuery } from '../utils/queryLogger.js';
import crypto from 'crypto';

/**
 * Notification Throttler Service
 * Handles throttling of notifications to prevent spam
 * Accumulates changes and sends consolidated notifications
 * NOW WITH DATABASE PERSISTENCE - survives server restarts!
 */
class NotificationThrottler {
  constructor(db) {
    this.db = db;
    this.processingInterval = null;
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
   * Start the notification processing interval
   * Checks every minute for notifications ready to be sent
   */
  startProcessing() {
    if (this.processingInterval) {
      return; // Already running
    }

    console.log('📧 [THROTTLER] Starting notification queue processor (checks every 60 seconds)');
    
    // Process immediately on start (to catch any missed notifications)
    this.processReadyNotifications();
    
    // Then check every minute
    this.processingInterval = setInterval(() => {
      this.processReadyNotifications();
    }, 60 * 1000); // Every 60 seconds
  }

  /**
   * Stop the notification processing interval
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('📧 [THROTTLER] Notification queue processor stopped');
    }
  }

  /**
   * Add a notification to the throttling queue (DATABASE BACKED)
   */
  addNotification(userId, taskId, notificationData) {
    // Skip notifications in demo mode
    if (process.env.DEMO_ENABLED === 'true') {
      console.log('📧 [THROTTLER] Skipping notification in demo mode');
      return Promise.resolve();
    }
    
    const delay = this.getNotificationDelay();
    
    // If delay is 0, send immediately
    if (delay === 0) {
      return this.sendImmediateNotification(userId, taskId, notificationData);
    }

    try {
      const now = new Date();
      const scheduledSendTime = new Date(now.getTime() + delay * 60 * 1000);
      
      // Check if there's already a pending notification for this user-task combo
      const existing = wrapQuery(
        this.db.prepare(`
          SELECT id, change_count, first_change_time, task_data, participants_data, actor_data
          FROM notification_queue
          WHERE user_id = ? AND task_id = ? AND status = 'pending'
        `),
        'SELECT'
      ).get(userId, taskId);

      if (existing) {
        // Update existing notification - accumulate changes
        const taskData = JSON.parse(existing.task_data);
        const participantsData = JSON.parse(existing.participants_data);
        
        // Merge changes (keep most recent actor and data)
        wrapQuery(
          this.db.prepare(`
            UPDATE notification_queue
            SET 
              action = ?,
              details = ?,
              old_value = ?,
              new_value = ?,
              task_data = ?,
              participants_data = ?,
              actor_data = ?,
              last_change_time = ?,
              scheduled_send_time = ?,
              change_count = change_count + 1,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `),
          'UPDATE'
        ).run(
          notificationData.action,
          notificationData.details,
          notificationData.oldValue || null,
          notificationData.newValue || null,
          JSON.stringify(notificationData.task),
          JSON.stringify(notificationData.participants),
          JSON.stringify(notificationData.actor),
          now.toISOString(),
          scheduledSendTime.toISOString(),
          existing.id
        );

        console.log(`📧 [THROTTLER] Updated existing notification ${existing.id} for user ${userId}, task ${taskId}. Change count: ${existing.change_count + 1}`);
      } else {
        // Create new notification entry
        const notificationId = crypto.randomUUID();
        
        wrapQuery(
          this.db.prepare(`
            INSERT INTO notification_queue (
              id, user_id, task_id, notification_type, action, details,
              old_value, new_value, task_data, participants_data, actor_data,
              status, scheduled_send_time, first_change_time, last_change_time,
              change_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `),
          'INSERT'
        ).run(
          notificationId,
          userId,
          taskId,
          notificationData.notificationType,
          notificationData.action,
          notificationData.details,
          notificationData.oldValue || null,
          notificationData.newValue || null,
          JSON.stringify(notificationData.task),
          JSON.stringify(notificationData.participants),
          JSON.stringify(notificationData.actor),
          'pending',
          scheduledSendTime.toISOString(),
          now.toISOString(),
          now.toISOString(),
          1
        );

        console.log(`📧 [THROTTLER] Created notification ${notificationId} for user ${userId}, task ${taskId}. Will send at ${scheduledSendTime.toISOString()}`);
      }
    } catch (error) {
      console.error(`❌ [THROTTLER] Failed to queue notification for user ${userId}, task ${taskId}:`, error);
    }
  }

  /**
   * Process notifications that are ready to be sent
   * Groups notifications by user_id and task_id, sending consolidated emails
   */
  async processReadyNotifications() {
    try {
      const now = new Date().toISOString();
      
      // Find all notifications scheduled to be sent now or earlier
      const readyNotifications = wrapQuery(
        this.db.prepare(`
          SELECT *
          FROM notification_queue
          WHERE status = 'pending' AND scheduled_send_time <= ?
          ORDER BY scheduled_send_time ASC
          LIMIT 50
        `),
        'SELECT'
      ).all(now);

      if (readyNotifications.length === 0) {
        return; // Nothing to process
      }

      console.log(`📧 [THROTTLER] Processing ${readyNotifications.length} ready notification(s)`);

      // Group notifications by user_id and task_id
      const groupedNotifications = new Map();
      
      for (const notification of readyNotifications) {
        const key = `${notification.user_id}:${notification.task_id}`;
        if (!groupedNotifications.has(key)) {
          groupedNotifications.set(key, []);
        }
        groupedNotifications.get(key).push(notification);
      }

      // Process each group (user-task combination)
      for (const [key, notifications] of groupedNotifications.entries()) {
        // Sort by last_change_time DESC (reverse chronological - most recent first)
        notifications.sort((a, b) => {
          const timeA = new Date(a.last_change_time).getTime();
          const timeB = new Date(b.last_change_time).getTime();
          return timeB - timeA; // Descending order
        });

        // Send consolidated notification for this user-task group
        await this.sendGroupedNotification(notifications);
      }

    } catch (error) {
      console.error('❌ [THROTTLER] Error processing ready notifications:', error);
    }
  }

  /**
   * Send a grouped notification (multiple changes to the same task for the same user)
   */
  async sendGroupedNotification(notifications) {
    if (notifications.length === 0) return;

    // Use the most recent notification as the base
    const baseNotification = notifications[0];
    
    try {
      console.log(`📧 [THROTTLER] Sending grouped notification for user ${baseNotification.user_id}, task ${baseNotification.task_id} (${notifications.length} change(s))`);
      
      const { getNotificationService } = await import('./notificationService.js');
      const notificationService = getNotificationService();
      
      if (!notificationService) {
        throw new Error('Notification service not available');
      }

      // Parse stored JSON data from the most recent notification
      const task = JSON.parse(baseNotification.task_data);
      const participants = JSON.parse(baseNotification.participants_data);
      const actor = JSON.parse(baseNotification.actor_data);

      // Create consolidated notification data with all changes
      const consolidatedData = {
        userId: baseNotification.user_id,
        taskId: baseNotification.task_id,
        action: notifications.length > 1 ? 'consolidated_update' : baseNotification.action,
        details: notifications.length > 1 
          ? `${notifications.length} changes made to this task` 
          : baseNotification.details,
        oldValue: baseNotification.old_value,
        newValue: baseNotification.new_value,
        task,
        participants,
        actor,
        notificationType: baseNotification.notification_type,
        changeCount: notifications.length,
        timeSpan: this.calculateTimeSpan(
          new Date(notifications[notifications.length - 1].first_change_time),
          new Date(baseNotification.last_change_time)
        ),
        timestamp: baseNotification.last_change_time, // Use most recent timestamp
        allChanges: notifications.map(n => ({
          action: n.action,
          details: n.details,
          oldValue: n.old_value,
          newValue: n.new_value,
          timestamp: n.last_change_time,
          actor: JSON.parse(n.actor_data)
        }))
      };

      // Send the consolidated notification
      await notificationService.sendEmailDirectly(consolidatedData);

      // Mark all notifications in the group as sent
      const notificationIds = notifications.map(n => n.id);
      const placeholders = notificationIds.map(() => '?').join(',');
      
      wrapQuery(
        this.db.prepare(`
          UPDATE notification_queue
          SET status = 'sent', sent_at = CURRENT_TIMESTAMP
          WHERE id IN (${placeholders})
        `),
        'UPDATE'
      ).run(...notificationIds);

      console.log(`✅ [THROTTLER] Grouped notification sent successfully (${notifications.length} change(s))`);

    } catch (error) {
      console.error(`❌ [THROTTLER] Failed to send grouped notification:`, error);

      // Mark all as failed
      const notificationIds = notifications.map(n => n.id);
      const placeholders = notificationIds.map(() => '?').join(',');
      
      wrapQuery(
        this.db.prepare(`
          UPDATE notification_queue
          SET status = 'failed', error_message = ?, retry_count = retry_count + 1
          WHERE id IN (${placeholders})
        `),
        'UPDATE'
      ).run(error.message, ...notificationIds);
    }
  }

  /**
   * Send a notification from the queue
   */
  async sendNotificationFromQueue(queuedNotification) {
    try {
      console.log(`📧 [THROTTLER] Sending notification ${queuedNotification.id} to user ${queuedNotification.user_id} for task ${queuedNotification.task_id}`);
      
      const { getNotificationService } = await import('./notificationService.js');
      const notificationService = getNotificationService();
      
      if (!notificationService) {
        throw new Error('Notification service not available');
      }

      // Parse stored JSON data
      const task = JSON.parse(queuedNotification.task_data);
      const participants = JSON.parse(queuedNotification.participants_data);
      const actor = JSON.parse(queuedNotification.actor_data);

      // Create consolidated notification data
      // Note: userId here should be the RECIPIENT (queuedNotification.user_id), not the actor
      // The actor is in the actor object
      const consolidatedData = {
        userId: queuedNotification.user_id, // This is the recipient's user ID
        taskId: queuedNotification.task_id,
        action: queuedNotification.change_count > 1 ? 'consolidated_update' : queuedNotification.action,
        details: queuedNotification.details,
        oldValue: queuedNotification.old_value,
        newValue: queuedNotification.new_value,
        task,
        participants,
        actor,
        notificationType: queuedNotification.notification_type,
        changeCount: queuedNotification.change_count,
        timeSpan: this.calculateTimeSpan(
          new Date(queuedNotification.first_change_time),
          new Date(queuedNotification.last_change_time)
        )
      };

      // Send the notification directly (don't queue it again!)
      // sendEmailDirectly expects userId to be the recipient's user ID
      await notificationService.sendEmailDirectly(consolidatedData);

      // Mark as sent
      wrapQuery(
        this.db.prepare(`
          UPDATE notification_queue
          SET status = 'sent', sent_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `),
        'UPDATE'
      ).run(queuedNotification.id);

      console.log(`✅ [THROTTLER] Notification ${queuedNotification.id} sent successfully (${queuedNotification.change_count} change(s))`);

    } catch (error) {
      console.error(`❌ [THROTTLER] Failed to send notification ${queuedNotification.id}:`, error);

      // Mark as failed and increment retry count
      const retryCount = queuedNotification.retry_count + 1;
      const maxRetries = 3;

      if (retryCount >= maxRetries) {
        // Give up after max retries
        wrapQuery(
          this.db.prepare(`
            UPDATE notification_queue
            SET status = 'failed', error_message = ?, retry_count = ?
            WHERE id = ?
          `),
          'UPDATE'
        ).run(error.message, retryCount, queuedNotification.id);

        console.error(`❌ [THROTTLER] Notification ${queuedNotification.id} failed permanently after ${maxRetries} attempts`);
      } else {
        // Schedule retry (5 minutes later)
        const retryTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        
        wrapQuery(
          this.db.prepare(`
            UPDATE notification_queue
            SET scheduled_send_time = ?, error_message = ?, retry_count = ?
            WHERE id = ?
          `),
          'UPDATE'
        ).run(retryTime, error.message, retryCount, queuedNotification.id);

        console.warn(`⚠️ [THROTTLER] Notification ${queuedNotification.id} failed (attempt ${retryCount}/${maxRetries}), will retry at ${retryTime}`);
      }
    }
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
        // userId parameter is the RECIPIENT, but notificationData.userId is the ACTOR
        // Override notificationData.userId to be the recipient for sendEmailDirectly
        const notificationDataWithRecipient = {
          ...notificationData,
          userId: userId  // Set userId to the recipient (not the actor)
        };
        
        // Send email directly without going through the queue
        await notificationService.sendEmailDirectly(notificationDataWithRecipient);
        console.log(`✅ [THROTTLER] Immediate notification sent successfully to user ${userId} for task ${taskId}`);
      } else {
        console.warn(`⚠️ [THROTTLER] Notification service not available for immediate notification to user ${userId}`);
      }
    } catch (error) {
      console.error(`❌ [THROTTLER] Failed to send immediate notification to user ${userId}:`, error);
    }
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
    
    try {
      const pendingNotifications = wrapQuery(
        this.db.prepare(`
          SELECT *
          FROM notification_queue
          WHERE status = 'pending'
          ORDER BY created_at ASC
        `),
        'SELECT'
      ).all();

      console.log(`📧 [THROTTLER] Found ${pendingNotifications.length} pending notification(s) to flush`);

      for (const notification of pendingNotifications) {
        await this.sendNotificationFromQueue(notification);
      }

      console.log('✅ All pending notifications flushed');
    } catch (error) {
      console.error('❌ Failed to flush notifications:', error);
    }
  }

  /**
   * Get pending notifications count for a user
   */
  getPendingCount(userId) {
    try {
      const result = wrapQuery(
        this.db.prepare(`
          SELECT COUNT(*) as count
          FROM notification_queue
          WHERE user_id = ? AND status = 'pending'
        `),
        'SELECT'
      ).get(userId);

      return result ? result.count : 0;
    } catch (error) {
      console.error('Failed to get pending notification count:', error);
      return 0;
    }
  }

  /**
   * Get all pending notifications for debugging
   */
  getPendingNotifications() {
    try {
      const notifications = wrapQuery(
        this.db.prepare(`
          SELECT 
            user_id, task_id, notification_type, change_count,
            first_change_time, scheduled_send_time, status
          FROM notification_queue
          WHERE status = 'pending'
          ORDER BY scheduled_send_time ASC
        `),
        'SELECT'
      ).all();

      return notifications;
    } catch (error) {
      console.error('Failed to get pending notifications:', error);
      return [];
    }
  }

  /**
   * Clean up old sent/failed notifications (older than 30 days)
   */
  cleanupOldNotifications() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = wrapQuery(
        this.db.prepare(`
          DELETE FROM notification_queue
          WHERE (status = 'sent' OR status = 'failed')
            AND created_at < ?
        `),
        'DELETE'
      ).run(thirtyDaysAgo);

      if (result.changes > 0) {
        console.log(`🧹 [THROTTLER] Cleaned up ${result.changes} old notification(s)`);
      }
    } catch (error) {
      console.error('Failed to clean up old notifications:', error);
    }
  }
}

// Export singleton instance
let notificationThrottler = null;

export const initNotificationThrottler = (db) => {
  notificationThrottler = new NotificationThrottler(db);
  
  // Start the processing interval
  notificationThrottler.startProcessing();
  
  // Clean up old notifications on init
  notificationThrottler.cleanupOldNotifications();
  
  return notificationThrottler;
};

export const getNotificationThrottler = () => {
  return notificationThrottler;
};

export { NotificationThrottler };
