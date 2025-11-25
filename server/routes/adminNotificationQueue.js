import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getNotificationService } from '../services/notificationService.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

/**
 * GET /api/admin/notification-queue
 * Get all notification queue items with human-readable data
 */
router.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    
    // Get all notification queue items with human-readable data
    const notifications = wrapQuery(
      db.prepare(`
        SELECT 
          nq.id,
          nq.user_id,
          nq.task_id,
          nq.notification_type,
          nq.action,
          nq.details,
          nq.old_value,
          nq.new_value,
          nq.status,
          nq.scheduled_send_time,
          nq.first_change_time,
          nq.last_change_time,
          nq.change_count,
          nq.error_message,
          nq.retry_count,
          nq.created_at,
          nq.updated_at,
          nq.sent_at,
          -- User info
          u.email as recipient_email,
          m.name as recipient_name,
          -- Task info
          t.title as task_title,
          t.ticket as task_ticket,
          -- Column info
          c.title as column_title,
          -- Board info
          b.title as board_title,
          -- Actor info (from JSON)
          nq.actor_data
        FROM notification_queue nq
        LEFT JOIN users u ON nq.user_id = u.id
        LEFT JOIN members m ON u.id = m.user_id
        LEFT JOIN tasks t ON nq.task_id = t.id
        LEFT JOIN columns c ON t.columnId = c.id
        LEFT JOIN boards b ON t.boardId = b.id
        ORDER BY nq.updated_at DESC
        LIMIT 500
      `),
      'SELECT'
    ).all();

    // Parse actor data from JSON
    const notificationsWithActor = notifications.map(notif => {
      let actor = null;
      try {
        if (notif.actor_data) {
          actor = JSON.parse(notif.actor_data);
        }
      } catch (e) {
        console.warn('Failed to parse actor_data for notification', notif.id);
      }

      return {
        id: notif.id,
        recipientEmail: notif.recipient_email,
        recipientName: notif.recipient_name,
        taskTitle: notif.task_title,
        taskTicket: notif.task_ticket,
        columnTitle: notif.column_title,
        boardTitle: notif.board_title,
        notificationType: notif.notification_type,
        action: notif.action,
        details: notif.details,
        oldValue: notif.old_value,
        newValue: notif.new_value,
        status: notif.status,
        scheduledSendTime: notif.scheduled_send_time,
        firstChangeTime: notif.first_change_time,
        lastChangeTime: notif.last_change_time,
        changeCount: notif.change_count,
        errorMessage: notif.error_message,
        retryCount: notif.retry_count,
        createdAt: notif.created_at,
        updatedAt: notif.updated_at,
        sentAt: notif.sent_at,
        actor: actor
      };
    });

    res.json(notificationsWithActor);
  } catch (error) {
    console.error('Error fetching notification queue:', error);
    res.status(500).json({ error: 'Failed to fetch notification queue' });
  }
});

/**
 * POST /api/admin/notification-queue/send
 * Send selected notifications immediately
 */
router.post('/send', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ error: 'Notification IDs are required' });
    }

    const db = getRequestDatabase(req);
    const notificationService = getNotificationService();

    if (!notificationService) {
      return res.status(500).json({ error: 'Notification service not available' });
    }

    let sentCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const notificationId of notificationIds) {
      try {
        // Get notification from queue
        const notification = wrapQuery(
          db.prepare(`
            SELECT *
            FROM notification_queue
            WHERE id = ? AND status = 'pending'
          `),
          'SELECT'
        ).get(notificationId);

        if (!notification) {
          errors.push(`Notification ${notificationId} not found or already sent`);
          failedCount++;
          continue;
        }

        // Parse stored JSON data
        const task = JSON.parse(notification.task_data);
        const participants = JSON.parse(notification.participants_data);
        const actor = JSON.parse(notification.actor_data);

        // Create notification data for sending
        const notificationData = {
          userId: notification.user_id, // Recipient
          taskId: notification.task_id,
          action: notification.change_count > 1 ? 'consolidated_update' : notification.action,
          details: notification.details,
          oldValue: notification.old_value,
          newValue: notification.new_value,
          task,
          participants,
          actor,
          notificationType: notification.notification_type,
          changeCount: notification.change_count,
          timestamp: notification.last_change_time
        };

        // Send immediately
        await notificationService.sendEmailDirectly(notificationData);

        // Mark as sent
        wrapQuery(
          db.prepare(`
            UPDATE notification_queue
            SET status = 'sent', sent_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `),
          'UPDATE'
        ).run(notificationId);

        sentCount++;
      } catch (error) {
        console.error(`Failed to send notification ${notificationId}:`, error);
        errors.push(`Failed to send ${notificationId}: ${error.message}`);
        failedCount++;
      }
    }

    res.json({
      success: true,
      sentCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error sending notifications:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

/**
 * DELETE /api/admin/notification-queue
 * Delete selected notifications
 */
router.delete('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ error: 'Notification IDs are required' });
    }

    const db = getRequestDatabase(req);
    const placeholders = notificationIds.map(() => '?').join(',');

    const result = wrapQuery(
      db.prepare(`
        DELETE FROM notification_queue
        WHERE id IN (${placeholders})
      `),
      'DELETE'
    ).run(...notificationIds);

    res.json({
      success: true,
      deletedCount: result.changes
    });
  } catch (error) {
    console.error('Error deleting notifications:', error);
    res.status(500).json({ error: 'Failed to delete notifications' });
  }
});

export default router;

