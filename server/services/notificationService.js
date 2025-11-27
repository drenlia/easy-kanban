import EmailService from './emailService.js';
import { EmailTemplates } from './emailTemplates.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { getNotificationThrottler } from './notificationThrottler.js';
import { getTranslator } from '../utils/i18n.js';
import { formatDateTimeLocal } from '../utils/dateFormatter.js';

/**
 * Notification Service - Handles email notifications for task activities
 * Integrates with the activity logger to send contextual emails
 */
class NotificationService {
  constructor(db) {
    this.db = db;
    this.emailService = new EmailService(db);
  }

  /**
   * Get user notification preferences
   */
  async getUserNotificationPreferences(userId) {
    try {
      // First, get global notification defaults from settings
      const globalDefaults = await wrapQuery(
        this.db.prepare('SELECT value FROM settings WHERE key = ?'),
        'SELECT'
      ).get('NOTIFICATION_DEFAULTS');

      let defaultPreferences = {
        newTaskAssigned: true,
        myTaskUpdated: true,
        watchedTaskUpdated: true,
        addedAsCollaborator: true,
        collaboratingTaskUpdated: true,
        commentAdded: true,
        requesterTaskCreated: true,
        requesterTaskUpdated: true
      };

      if (globalDefaults && globalDefaults.value) {
        try {
          defaultPreferences = JSON.parse(globalDefaults.value);
        } catch (parseError) {
          console.warn('Failed to parse global notification defaults:', parseError.message);
        }
      }

      // Then, get user-specific settings
      const userSettings = await wrapQuery(
        this.db.prepare('SELECT setting_value FROM user_settings WHERE userId = ? AND setting_key = ?'),
        'SELECT'
      ).get(userId, 'notifications');

      if (userSettings && userSettings.setting_value) {
        const userPreferences = JSON.parse(userSettings.setting_value);
        // Merge user preferences with global defaults (user preferences override defaults)
        return { ...defaultPreferences, ...userPreferences };
      }
      
      // Return global defaults if no user settings exist
      return defaultPreferences;
    } catch (error) {
      console.warn('Failed to get user notification preferences:', error.message);
      // Return hardcoded defaults on error
      return {
        newTaskAssigned: true,
        myTaskUpdated: true,
        watchedTaskUpdated: true,
        addedAsCollaborator: true,
        collaboratingTaskUpdated: true,
        commentAdded: true,
        requesterTaskCreated: true,
        requesterTaskUpdated: true
      };
    }
  }

  /**
   * Get task participants (assignee, watchers, collaborators, requester)
   */
  async getTaskParticipants(taskId) {
    try {
      // Get basic task info with board and project info
      const task = await wrapQuery(
        this.db.prepare(`
          SELECT t.id, t.memberId, t.requesterId, t.title, t.ticket, t.boardId, b.project as projectId
          FROM tasks t
          LEFT JOIN boards b ON t.boardId = b.id
          WHERE t.id = ?
        `),
        'SELECT'
      ).get(taskId);

      if (!task) return {};

      // Get watchers
      const watchers = await wrapQuery(
        this.db.prepare(`
          SELECT m.user_id as userId, m.name, u.email 
          FROM watchers w 
          JOIN members m ON w.memberId = m.id 
          JOIN users u ON m.user_id = u.id 
          WHERE w.taskId = ?
        `),
        'SELECT'
      ).all(taskId);

      // Get collaborators
      const collaborators = await wrapQuery(
        this.db.prepare(`
          SELECT m.user_id as userId, m.name, u.email 
          FROM collaborators c 
          JOIN members m ON c.memberId = m.id 
          JOIN users u ON m.user_id = u.id 
          WHERE c.taskId = ?
        `),
        'SELECT'
      ).all(taskId);

      // Get assignee info
      let assignee = null;
      if (task.memberId) {
        assignee = await wrapQuery(
          this.db.prepare(`
            SELECT m.user_id as userId, m.name, u.email 
            FROM members m 
            JOIN users u ON m.user_id = u.id 
            WHERE m.id = ?
          `),
          'SELECT'
        ).get(task.memberId);
      }

      // Get requester info
      let requester = null;
      if (task.requesterId) {
        requester = await wrapQuery(
          this.db.prepare(`
            SELECT m.user_id as userId, m.name, u.email 
            FROM members m 
            JOIN users u ON m.user_id = u.id 
            WHERE m.id = ?
          `),
          'SELECT'
        ).get(task.requesterId);
      }

      const result = {
        task: {
          id: taskId, // Include task ID for URL construction
          memberId: task.memberId,
          requesterId: task.requesterId,
          title: task.title,
          ticket: task.ticket
        },
        projectId: task.projectId,
        assignee,
        requester,
        watchers,
        collaborators
      };
      
      console.log(`🔍 [NOTIFICATION] Task participants for task ${taskId}:`, {
        hasTask: !!task,
        hasAssignee: !!assignee,
        hasRequester: !!requester,
        watchersCount: watchers.length,
        collaboratorsCount: collaborators.length,
        assigneeUserId: assignee?.userId,
        requesterUserId: requester?.userId,
        projectId: task.projectId
      });
      
      return result;
    } catch (error) {
      console.warn('Failed to get task participants:', error.message);
      return {};
    }
  }

  /**
   * Generate email templates for different notification types
   */
  async generateEmailTemplate(notificationType, data) {
    const siteSettings = await this.getSiteSettings();
    const baseUrl = await this.getBaseUrl();
    
    // Construct taskUrl if not provided and we have task data
    // Note: Email clients may encode # to %23, but browsers should decode it automatically
    let taskUrl = data.taskUrl;
    if (!taskUrl && data.task && data.participants) {
      const { task, participants } = data;
      if (task.ticket && participants.projectId) {
        taskUrl = `${baseUrl}/project/#${participants.projectId}#${task.ticket}`;
      } else if (task.ticket) {
        // Fallback: try to get project ID from task's board
        const taskWithProject = await wrapQuery(
          this.db.prepare(`
            SELECT b.project as projectId
            FROM tasks t
            LEFT JOIN boards b ON t.boardId = b.id
            WHERE t.id = ?
          `),
          'SELECT'
        ).get(task.id);
        const projectId = taskWithProject?.projectId;
        taskUrl = projectId ? `${baseUrl}/project/#${projectId}#${task.ticket}` : `${baseUrl}/project/#${task.ticket}`;
      } else if (task.id) {
        taskUrl = `${baseUrl}#task#${task.id}`;
      }
    }
    
    // Add site settings to data for templates
    const templateData = {
      ...data,
      taskUrl: taskUrl || data.taskUrl,
      siteName: siteSettings.SITE_NAME || 'Easy Kanban',
      siteUrl: baseUrl,
      db: this.db
    };
    
    switch (notificationType) {
      case 'task':
        return EmailTemplates.taskNotification(templateData);
      case 'comment':
        return EmailTemplates.commentNotification(templateData);
      case 'user_invite':
        return EmailTemplates.userInvite(templateData);
      case 'password_reset':
        return EmailTemplates.passwordReset(templateData);
      default:
        // Fallback to legacy templates for backwards compatibility
        return await this.generateLegacyTemplate(notificationType, data);
    }
  }

  /**
   * Legacy template generation (keeping for backwards compatibility)
   */
  async generateLegacyTemplate(notificationType, data) {
    const { task, action, details, actor, oldValue, newValue, participants, timestamp } = data;
    const taskIdentifier = task.ticket || `Task #${task.id.substring(0, 8)}`;
    const baseUrl = await this.getBaseUrl();
    
    // Format timestamp
    const formattedTimestamp = timestamp ? formatDateTimeLocal(timestamp) : formatDateTimeLocal(new Date());
    const taskTicket = task?.ticket || '';
    const ticketPrefix = taskTicket ? `[ ${taskTicket} ] ` : '';
    // Construct task URL with project ID if available
    // Note: Email clients may encode # to %23, but browsers should decode it automatically
    let taskUrl;
    if (task.ticket && participants.projectId) {
      taskUrl = `${baseUrl}/project/#${participants.projectId}#${task.ticket}`;
    } else if (task.ticket) {
      // Fallback: try to get project ID from task's board
      const taskWithProject = await wrapQuery(
        this.db.prepare(`
          SELECT b.project as projectId
          FROM tasks t
          LEFT JOIN boards b ON t.boardId = b.id
          WHERE t.id = ?
        `),
        'SELECT'
      ).get(task.id);
      const projectId = taskWithProject?.projectId;
      taskUrl = projectId ? `${baseUrl}/project/#${projectId}#${task.ticket}` : `${baseUrl}/project/#${task.ticket}`;
    } else {
      taskUrl = `${baseUrl}#task#${task.id}`;
    }
    const t = getTranslator(this.db);

    const templates = {
      newTaskAssigned: {
        subject: `${ticketPrefix}${t('emails.taskNotification.newTaskAssigned.subject', { taskTitle: task.title })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${t('emails.taskNotification.newTaskAssigned.title')}</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.newTaskAssigned.taskId')}</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px; margin-left: 20px;">${task.title}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.newTaskAssigned.assignedBy')}</strong> ${actor.name}</p>
            </div>
            <div style="margin: 20px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #2563eb;">
                    <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${t('emails.taskNotification.newTaskAssigned.viewTask')}</a>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t('emails.taskNotification.newTaskAssigned.receivingReason')}</p>
          </div>
        `
      },

      myTaskUpdated: {
        subject: `${ticketPrefix}${t('emails.taskNotification.myTaskUpdated.subject', { taskTitle: task.title })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">${t('emails.taskNotification.myTaskUpdated.title')}</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.myTaskUpdated.taskId')}</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px; margin-left: 20px;">${task.title}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.myTaskUpdated.updatedBy')}</strong> ${actor.name}</p>
              <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <strong style="color: #92400e;">${t('emails.taskNotification.myTaskUpdated.whatChanged')}</strong>
                <p style="color: #92400e; margin: 10px 0 0 0;">${await this.formatChangeDetails(details, oldValue, newValue, t)}</p>
              </div>
            </div>
            <div style="margin: 20px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #2563eb;">
                    <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${t('emails.taskNotification.myTaskUpdated.viewTask')}</a>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t('emails.taskNotification.myTaskUpdated.receivingReason')}</p>
          </div>
        `
      },

      watchedTaskUpdated: {
        subject: `${ticketPrefix}${t('emails.taskNotification.watchedTaskUpdated.subject', { taskTitle: task.title })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">${t('emails.taskNotification.watchedTaskUpdated.title')}</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.watchedTaskUpdated.taskId')}</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px; margin-left: 20px;">${task.title}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.watchedTaskUpdated.updatedBy')}</strong> ${actor.name}</p>
              <div style="background-color: #ede9fe; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <strong style="color: #6b21a8;">${t('emails.taskNotification.watchedTaskUpdated.whatChanged')}</strong>
                <p style="color: #6b21a8; margin: 10px 0 0 0;">${await this.formatChangeDetails(details, oldValue, newValue, t)}</p>
              </div>
            </div>
            <div style="margin: 20px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #7c3aed;">
                    <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${t('emails.taskNotification.watchedTaskUpdated.viewTask')}</a>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t('emails.taskNotification.watchedTaskUpdated.receivingReason')}</p>
          </div>
        `
      },

      addedAsCollaborator: {
        subject: `${ticketPrefix}${t('emails.taskNotification.addedAsCollaborator.subject', { taskTitle: task.title })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">${t('emails.taskNotification.addedAsCollaborator.title')}</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.addedAsCollaborator.taskId')}</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px; margin-left: 20px;">${task.title}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.addedAsCollaborator.addedBy')}</strong> ${actor.name}</p>
            </div>
            <div style="margin: 20px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #059669;">
                    <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${t('emails.taskNotification.addedAsCollaborator.viewTask')}</a>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t('emails.taskNotification.addedAsCollaborator.receivingReason')}</p>
          </div>
        `
      },

      collaboratingTaskUpdated: {
        subject: `${ticketPrefix}${t('emails.taskNotification.collaboratingTaskUpdated.subject', { taskTitle: task.title })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">${t('emails.taskNotification.collaboratingTaskUpdated.title')}</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.collaboratingTaskUpdated.taskId')}</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px; margin-left: 20px;">${task.title}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.collaboratingTaskUpdated.updatedBy')}</strong> ${actor.name}</p>
              <div style="background-color: #ecfdf5; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <strong style="color: #065f46;">${t('emails.taskNotification.collaboratingTaskUpdated.whatChanged')}</strong>
                <p style="color: #065f46; margin: 10px 0 0 0;">${await this.formatChangeDetails(details, oldValue, newValue, t)}</p>
              </div>
            </div>
            <div style="margin: 20px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #059669;">
                    <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${t('emails.taskNotification.collaboratingTaskUpdated.viewTask')}</a>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t('emails.taskNotification.collaboratingTaskUpdated.receivingReason')}</p>
          </div>
        `
      },

      commentAdded: {
        subject: `${ticketPrefix}${t('emails.commentNotification.subject', { taskTitle: task.title })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">${t('emails.commentNotification.title')}</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.commentNotification.taskId')}</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px; margin-left: 20px;">${task.title}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.commentNotification.commentBy')}</strong> ${actor.name}</p>
              ${data.commentContent ? `
                <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #dc2626;">
                  <strong style="color: #991b1b;">${t('emails.commentNotification.newComment')}</strong>
                  <div style="color: #991b1b; margin: 10px 0 0 0;">${data.commentContent}</div>
                </div>
              ` : ''}
            </div>
            <div style="margin: 20px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #dc2626;">
                    <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${t('emails.commentNotification.viewComment')}</a>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t('emails.commentNotification.receivingReason')}</p>
          </div>
        `
      },

      requesterTaskCreated: {
        subject: `${ticketPrefix}${t('emails.taskNotification.requesterTaskCreated.subject', { taskTitle: task.title })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">${t('emails.taskNotification.requesterTaskCreated.title')}</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.requesterTaskCreated.taskId')}</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px; margin-left: 20px;">${task.title}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.requesterTaskCreated.createdBy')}</strong> ${actor.name}</p>
            </div>
            <div style="margin: 20px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #16a34a;">
                    <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${t('emails.taskNotification.requesterTaskCreated.viewTask')}</a>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t('emails.taskNotification.requesterTaskCreated.receivingReason')}</p>
          </div>
        `
      },

      requesterTaskUpdated: {
        subject: `${ticketPrefix}${t('emails.taskNotification.requesterTaskUpdated.subject', { taskTitle: task.title })}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">${t('emails.taskNotification.requesterTaskUpdated.title')}</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.requesterTaskUpdated.taskId')}</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px; margin-left: 20px;">${task.title}</p>
              <p style="color: #64748b; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>${t('emails.taskNotification.requesterTaskUpdated.updatedBy')}</strong> ${actor.name}</p>
              <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <strong style="color: #166534;">${t('emails.taskNotification.requesterTaskUpdated.whatChanged')}</strong>
                <p style="color: #166534; margin: 10px 0 0 0;">${await this.formatChangeDetails(details, oldValue, newValue, t)}</p>
              </div>
            </div>
            <div style="margin: 20px 0; text-align: center;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #16a34a;">
                    <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">${t('emails.taskNotification.requesterTaskUpdated.viewTask')}</a>
                  </td>
                </tr>
              </table>
            </div>
            <p style="color: #64748b; font-size: 14px;">${t('emails.taskNotification.requesterTaskUpdated.receivingReason')}</p>
          </div>
        `
      }
    };

    return templates[notificationType] || null;
  }

  /**
   * Format change details for email templates
   */
  async formatChangeDetails(details, oldValue, newValue, t = null) {
    // Get translator if not provided
    if (!t) {
      t = getTranslator(this.db);
    }
    
    if (oldValue !== undefined && newValue !== undefined) {
      // Check if value is a column ID (format: prefix-uuid, e.g., "progress-3c62dc96-fb00-463c-ac4e-d1cb41f7cbec")
      const isColumnId = (value) => {
        if (!value) return false;
        const strValue = String(value);
        // Column IDs have format: word-hyphen-uuid (e.g., "progress-3c62dc96-fb00-463c-ac4e-d1cb41f7cbec")
        // Check if it contains a hyphen and looks like it has a UUID part
        return /^[a-zA-Z0-9_-]+-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(strValue);
      };

      // Get column title from column ID
      const getColumnTitle = async (columnId) => {
        if (!columnId) return columnId;
        try {
          const column = await wrapQuery(
            this.db.prepare(`
              SELECT title 
              FROM columns 
              WHERE id = ?
            `),
            'SELECT'
          ).get(String(columnId));
          
          if (column && column.title) {
            return column.title;
          }
        } catch (error) {
          // If lookup fails, just return the original value
        }
        return columnId;
      };

      // Convert user IDs to human-readable names
      const formatValue = async (value) => {
        if (!value) return value;
        const strValue = String(value);
        
        // Check if it's a column ID first
        if (isColumnId(strValue)) {
          return await getColumnTitle(strValue);
        }
        
        // Then try to get member name for any ID that looks like a user/member ID
        try {
          const member = await wrapQuery(
            this.db.prepare(`
              SELECT m.name 
              FROM members m 
              WHERE m.user_id = ? OR m.id = ?
            `),
            'SELECT'
          ).get(strValue, strValue);
          
          if (member && member.name) {
            return member.name;
          }
        } catch (error) {
          // If lookup fails, just return the original value
        }
        
        return strValue;
      };

      // Check if this is a description field (contains HTML tags)
      const isDescription = (value) => {
        if (!value) return false;
        const strValue = String(value);
        // Check if value contains HTML tags (like <p>, <div>, etc.)
        return /<[a-z][\s\S]*>/i.test(strValue);
      };

      const isDescField = isDescription(oldValue) || isDescription(newValue) || 
                         (details && details.toLowerCase().includes('description'));

      // Format value - render HTML for descriptions, escape for others
      const formatValueForDisplay = (value) => {
        const formatted = formatValue(value);
        if (isDescField && formatted) {
          // For descriptions, render HTML directly (like comments do)
          return formatted;
        } else {
          // For other fields, escape HTML
          return this.escapeHtml(formatted);
        }
      };

      // Handle specific field changes with before/after
      if (oldValue && newValue) {
        const beforeLabel = t('emails.taskNotification.common.before', 'Before');
        const afterLabel = t('emails.taskNotification.common.after', 'After');
        
        return `
          <div style="margin: 10px 0;">
            <div style="background-color: #fee2e2; padding: 10px; border-radius: 4px; margin: 5px 0;">
              <strong>${beforeLabel}:</strong> ${await formatValueForDisplay(oldValue)}
            </div>
            <div style="background-color: #dcfce7; padding: 10px; border-radius: 4px; margin: 5px 0;">
              <strong>${afterLabel}:</strong> ${await formatValueForDisplay(newValue)}
            </div>
          </div>
        `;
      } else if (newValue) {
        return `<strong>Set to:</strong> ${await formatValueForDisplay(newValue)}`;
      } else if (oldValue) {
        return `<strong>Cleared</strong> (was: ${await formatValueForDisplay(oldValue)})`;
      }
    }
    
    return this.escapeHtml(details);
  }

  /**
   * Escape HTML for safe display
   */
  async escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get site settings
   */
  async getSiteSettings() {
    try {
      const settings = {};
      const keys = ['SITE_NAME', 'SITE_URL', 'APP_URL'];
      for (const key of keys) {
        const setting = await wrapQuery(
          this.db.prepare('SELECT value FROM settings WHERE key = ?'),
          'SELECT'
        ).get(key);
        settings[key] = setting ? setting.value : '';
      }
      return settings;
    } catch (error) {
      console.warn('Failed to get site settings:', error.message);
      return {};
    }
  }
  
  /**
   * Get base URL with fallback chain: APP_URL -> SITE_URL -> http://localhost:3000
   */
  async getBaseUrl() {
    const siteSettings = await this.getSiteSettings();
    
    // Priority: APP_URL -> SITE_URL -> localhost fallback
    if (siteSettings.APP_URL && siteSettings.APP_URL.trim()) {
      const appUrl = siteSettings.APP_URL.trim();
      // Remove trailing slash if present
      return appUrl.replace(/\/$/, '');
    }
    
    if (siteSettings.SITE_URL && siteSettings.SITE_URL.trim()) {
      const siteUrl = siteSettings.SITE_URL.trim();
      // Only use if it's a valid full URL (not just a path)
      if (siteUrl !== '/' && !siteUrl.startsWith('/') && (siteUrl.startsWith('http://') || siteUrl.startsWith('https://'))) {
        return siteUrl.replace(/\/$/, '');
      }
    }
    
    // Fallback to localhost
    return 'http://localhost:3000';
  }

  /**
   * Send notification email based on activity (with throttling)
   */
  async sendTaskNotification(activityData) {
    try {
      // Skip notifications in demo mode
      if (process.env.DEMO_ENABLED === 'true') {
        console.log('📧 [NOTIFICATION] Skipping notification in demo mode');
        return;
      }
      
      const { userId, action, taskId, details, oldValue, newValue } = activityData;
      
      // Simple deduplication to prevent double processing within 1 second
      const notificationKey = `${userId}-${action}-${taskId}`;
      const now = Date.now();
      
      if (!this.recentNotifications) {
        this.recentNotifications = new Map();
      }
      
      if (this.recentNotifications.has(notificationKey)) {
        const lastTime = this.recentNotifications.get(notificationKey);
        if (now - lastTime < 1000) { // Within 1 second
          console.log(`📧 [NOTIFICATION] Skipping duplicate processing: ${action} for task ${taskId} by user ${userId}`);
          return;
        }
      }
      
      this.recentNotifications.set(notificationKey, now);
      
      // Clean up old entries (older than 10 seconds)
      for (const [key, timestamp] of this.recentNotifications.entries()) {
        if (now - timestamp > 10000) {
          this.recentNotifications.delete(key);
        }
      }
      
      
      // Get task participants
      const participants = await this.getTaskParticipants(taskId);
      if (!participants.task) {
        return;
      }

      // Get actor information
      const actor = await wrapQuery(
        this.db.prepare(`
          SELECT m.name, u.email 
          FROM members m 
          JOIN users u ON m.user_id = u.id 
          WHERE u.id = ?
        `),
        'SELECT'
      ).get(userId);

      if (!actor) {
        console.warn(`⚠️ [NOTIFICATION] No actor found for userId ${userId}`);
        return;
      }

      // Determine which users to notify based on the action
      const notifications = this.determineNotifications(action, participants, userId);
      console.log(`📧 [NOTIFICATION] Determined ${notifications.length} notifications to send for task ${taskId}`);
      console.log(`🔍 [NOTIFICATION] Actor (person making change): ${userId}`);
      console.log(`🔍 [NOTIFICATION] Participants:`, {
        assignee: participants.assignee ? `${participants.assignee.name} (${participants.assignee.userId})` : 'none',
        requester: participants.requester ? `${participants.requester.name} (${participants.requester.userId})` : 'none',
        watchers: participants.watchers.map(w => `${w.name} (${w.userId})`),
        collaborators: participants.collaborators.map(c => `${c.name} (${c.userId})`)
      });
      console.log(`🔍 [NOTIFICATION] Notifications to send:`, notifications.map(n => `${n.notificationType} to user ${n.recipientUserId}`));

      // Use throttler for each notification
      const throttler = getNotificationThrottler();
      if (throttler) {
        console.log(`📧 [NOTIFICATION] Using throttler for notifications`);
        for (const notification of notifications) {
          const { recipientUserId, notificationType } = notification;
          
          // Check user preferences
          const userPrefs = await this.getUserNotificationPreferences(recipientUserId);
          console.log(`🔍 [NOTIFICATION] User ${recipientUserId} preferences for ${notificationType}:`, userPrefs[notificationType]);
          if (!userPrefs[notificationType]) {
            console.log(`📧 [NOTIFICATION] Skipping ${notificationType} for user ${recipientUserId} (preference disabled)`);
            continue;
          }

          console.log(`📧 [NOTIFICATION] Adding ${notificationType} notification to throttler for user ${recipientUserId}`);
          // Add to throttler queue
          throttler.addNotification(recipientUserId, taskId, {
            userId,
            action,
            taskId,
            details,
            oldValue,
            newValue,
            task: participants.task,
            participants,
            actor,
            notificationType
          });
        }
      } else {
        console.log(`📧 [NOTIFICATION] Throttler not available, using immediate notification fallback`);
        // Fallback to immediate sending if throttler not available
        await this.sendImmediateNotification(activityData);
      }

    } catch (error) {
      console.error('❌ [NOTIFICATION] Error sending task notification:', error);
    }
  }

  /**
   * Send email directly (used by throttler to avoid double processing)
   */
  async sendEmailDirectly(notificationData) {
    try {
      // Skip notifications in demo mode
      if (process.env.DEMO_ENABLED === 'true') {
        console.log('📧 [NOTIFICATION] Skipping email notification in demo mode');
        return;
      }
      
      const { userId, action, taskId, details, oldValue, newValue, task, participants, actor, notificationType } = notificationData;
      
      // userId in notificationData should be the RECIPIENT (not the actor)
      // The actor is in the actor object
      // Note: sendImmediateNotification fixes this by overriding userId to be the recipient
      const recipientUserId = userId;
      
      // Get recipient email
      const recipient = await wrapQuery(
        this.db.prepare(`
          SELECT m.name, u.email 
          FROM members m 
          JOIN users u ON m.user_id = u.id 
          WHERE u.id = ?
        `),
        'SELECT'
      ).get(recipientUserId);

      if (!recipient || !recipient.email) {
        console.warn(`⚠️ [NOTIFICATION] No recipient found for userId ${userId}`);
        return;
      }

      const templateData = {
        task,
        action,
        details,
        actor,
        oldValue,
        newValue,
        participants,
        timestamp: notificationData.timestamp || new Date()
      };

      // Generate email template
      const template = await this.generateEmailTemplate(notificationType, templateData);
      if (!template) {
        console.warn(`⚠️ [NOTIFICATION] No template found for ${notificationType}`);
        return;
      }

      // Send the email
      console.log(`📧 [NOTIFICATION] Sending email to ${recipient.name} (${recipient.email}) for ${notificationType}`);
      await this.emailService.sendEmail({
        to: recipient.email,
        subject: template.subject,
        html: template.html
      });

      console.log(`✅ [NOTIFICATION] Email sent successfully to ${recipient.name} (${recipient.email}) for ${notificationType}`);
    } catch (error) {
      console.error('❌ [NOTIFICATION] Error sending email directly:', error);
      // Re-throw the error so the caller (throttler) can mark the notification as failed
      throw error;
    }
  }

  /**
   * Send immediate notification (fallback when throttler not available)
   */
  async sendImmediateNotification(activityData) {
    try {
      const { userId, action, taskId, details, oldValue, newValue } = activityData;
      
      // Get task participants
      const participants = await this.getTaskParticipants(taskId);
      if (!participants.task) return;

      // Get actor information
      const actor = await wrapQuery(
        this.db.prepare(`
          SELECT m.name, u.email 
          FROM members m 
          JOIN users u ON m.user_id = u.id 
          WHERE u.id = ?
        `),
        'SELECT'
      ).get(userId);

      if (!actor) return;

      const templateData = {
        task: participants.task,
        action,
        details,
        actor,
        oldValue,
        newValue,
        participants
      };

      // Determine which users to notify based on the action
      const notifications = this.determineNotifications(action, participants, userId);

      // Send emails to each recipient (deduplicate by email address)
      const sentEmails = new Set();
      
      for (const notification of notifications) {
        const { recipientUserId, notificationType } = notification;
        
        // Check user preferences
        const userPrefs = await this.getUserNotificationPreferences(recipientUserId);
        if (!userPrefs[notificationType]) continue;

        // Get recipient email
        const recipient = await wrapQuery(
          this.db.prepare(`
            SELECT m.name, u.email 
            FROM members m 
            JOIN users u ON m.user_id = u.id 
            WHERE u.id = ?
          `),
          'SELECT'
        ).get(recipientUserId);

        if (!recipient || !recipient.email) continue;

        // Skip if we've already sent an email to this address for this task
        const emailKey = `${recipient.email}-${taskId}`;
        if (sentEmails.has(emailKey)) {
          console.log(`📧 [NOTIFICATION] Skipping duplicate email to ${recipient.email} for task ${taskId}`);
          continue;
        }

        // Generate email template
        const template = await this.generateEmailTemplate(notificationType, templateData);
        if (!template) continue;

        // Send the email
        try {
          console.log(`📧 [NOTIFICATION] Sending email to ${recipient.name} (${recipient.email}) for ${notificationType}`);
          await this.emailService.sendEmail({
            to: recipient.email,
            subject: template.subject,
            html: template.html
          });

          console.log(`✅ [NOTIFICATION] Email sent successfully to ${recipient.name} (${recipient.email}) for ${notificationType}`);
          sentEmails.add(emailKey);
        } catch (emailError) {
          console.error(`❌ [NOTIFICATION] Failed to send email to ${recipient.email}:`, emailError.message);
        }
      }

    } catch (error) {
      console.error('Error sending immediate notification:', error);
    }
  }

  /**
   * Determine which users should receive notifications for a given action
   */
  determineNotifications(action, participants, actorUserId) {
    const notifications = [];
    const { assignee, requester, watchers, collaborators } = participants;

    switch (action) {
      case 'create_task':
        // Notify assignee if someone else created and assigned the task
        if (assignee && assignee.userId !== actorUserId) {
          notifications.push({
            recipientUserId: assignee.userId,
            notificationType: 'newTaskAssigned'
          });
        }
        // Notify requester if someone else created their requested task
        if (requester && requester.userId !== actorUserId) {
          notifications.push({
            recipientUserId: requester.userId,
            notificationType: 'requesterTaskCreated'
          });
        }
        break;

      case 'update_task':
        // Notify assignee if it's their task and they didn't make the change
        if (assignee && assignee.userId !== actorUserId) {
          notifications.push({
            recipientUserId: assignee.userId,
            notificationType: 'myTaskUpdated'
          });
        }
        // Notify watchers (except the actor)
        watchers.forEach(watcher => {
          if (watcher.userId !== actorUserId) {
            notifications.push({
              recipientUserId: watcher.userId,
              notificationType: 'watchedTaskUpdated'
            });
          }
        });
        // Notify collaborators (except the actor)
        collaborators.forEach(collaborator => {
          if (collaborator.userId !== actorUserId) {
            notifications.push({
              recipientUserId: collaborator.userId,
              notificationType: 'collaboratingTaskUpdated'
            });
          }
        });
        // Notify requester if they didn't make the change
        if (requester && requester.userId !== actorUserId) {
          notifications.push({
            recipientUserId: requester.userId,
            notificationType: 'requesterTaskUpdated'
          });
        }
        break;

      case 'associate_tag':
      case 'disassociate_tag':
        // Treat tag changes as task updates
        return this.determineNotifications('update_task', participants, actorUserId);

      default:
        // For other actions, treat as task updates
        return this.determineNotifications('update_task', participants, actorUserId);
    }

    return notifications;
  }

  /**
   * Send user invitation email
   */
  async sendUserInvitation(userId, inviteToken, adminName, baseUrl = null) {
    try {
      console.log('📧 Preparing user invitation email...');
      
      // Get user details
      const user = await wrapQuery(
        this.db.prepare(`
          SELECT id, email, first_name, last_name, is_active, auth_provider
          FROM users 
          WHERE id = ?
        `), 
        'SELECT'
      ).get(userId);

      if (!user) {
        console.warn('❌ User not found for invitation:', userId);
        return { success: false, reason: 'User not found' };
      }

      // Only send invitations for local accounts that are inactive
      if (user.auth_provider !== 'local') {
        console.log('ℹ️ Skipping invitation for non-local account:', user.email);
        return { success: false, reason: 'User has non-local account' };
      }

      if (user.is_active) {
        console.log('ℹ️ Skipping invitation for already active user:', user.email);
        return { success: false, reason: 'User is already active' };
      }

      const actualBaseUrl = baseUrl || await this.getBaseUrl();
      const inviteUrl = `${actualBaseUrl}/#activate-account?token=${inviteToken}&email=${encodeURIComponent(user.email)}`;

      // Get site settings for email template
      const siteSettings = await this.getSiteSettings();

      // Generate invitation email
      const emailTemplate = this.generateEmailTemplate('user_invite', {
        user,
        inviteUrl,
        adminName: adminName || 'Administrator',
        siteName: siteSettings.SITE_NAME || 'Easy Kanban'
      });

      // Check if email service is available before attempting to send
      const emailValidation = this.emailService.validateEmailConfig();
      if (!emailValidation.valid) {
        console.warn('⚠️ Email service not available:', emailValidation.error);
        return { 
          success: false, 
          reason: emailValidation.error,
          details: emailValidation.details || 'Email server is not configured or available'
        };
      }

      // Send email
      const emailResult = await this.emailService.sendEmail({
        to: user.email,
        subject: emailTemplate.subject,
        text: emailTemplate.text,
        html: emailTemplate.html
      });

      if (emailResult.success) {
        console.log('✅ User invitation email sent successfully to:', user.email);
        
        // Log the invitation activity
        await wrapQuery(
          this.db.prepare(`
            INSERT INTO activity (action, details, userId, created_at)
            VALUES (?, ?, ?, datetime('now'))
          `), 
          'INSERT'
        ).run(
          'user_invited',
          `User ${user.first_name} ${user.last_name} (${user.email}) was invited by ${adminName}`,
          'system'
        );
      }

      return emailResult;
    } catch (error) {
      console.error('❌ Failed to send user invitation:', error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Send comment notification
   */
  async sendCommentNotification(commentData) {
    try {
      const { userId, action, taskId, commentContent } = commentData;

      if (action !== 'create_comment') return; // Only notify for new comments

      // Get task participants
      const participants = await this.getTaskParticipants(taskId);
      if (!participants.task) return;

      // Get actor information
      const actor = await wrapQuery(
        this.db.prepare(`
          SELECT m.name, u.email 
          FROM members m 
          JOIN users u ON m.user_id = u.id 
          WHERE u.id = ?
        `),
        'SELECT'
      ).get(userId);

      if (!actor) return;

      const templateData = {
        task: participants.task,
        action,
        actor,
        participants,
        commentContent
      };

      // Notify all involved users (assignee, watchers, collaborators, requester) except the commenter
      const recipients = new Set();
      
      if (participants.assignee && participants.assignee.userId !== userId) {
        recipients.add(participants.assignee.userId);
      }
      if (participants.requester && participants.requester.userId !== userId) {
        recipients.add(participants.requester.userId);
      }
      participants.watchers.forEach(watcher => {
        if (watcher.userId !== userId) recipients.add(watcher.userId);
      });
      participants.collaborators.forEach(collaborator => {
        if (collaborator.userId !== userId) recipients.add(collaborator.userId);
      });

      // Send emails
      for (const recipientUserId of recipients) {
        // Check user preferences
        const userPrefs = await this.getUserNotificationPreferences(recipientUserId);
        if (!userPrefs.commentAdded) continue;

        // Get recipient email
        const recipient = await wrapQuery(
          this.db.prepare(`
            SELECT m.name, u.email 
            FROM members m 
            JOIN users u ON m.user_id = u.id 
            WHERE u.id = ?
          `),
          'SELECT'
        ).get(recipientUserId);

        if (!recipient || !recipient.email) continue;

        // Generate email template
        const template = this.generateEmailTemplate('commentAdded', templateData);
        if (!template) continue;

        // Send the email
        try {
          await this.emailService.sendEmail({
            to: recipient.email,
            subject: template.subject,
            html: template.html
          });

          console.log(`📧 Comment notification sent to ${recipient.name} (${recipient.email})`);
        } catch (emailError) {
          console.error(`Failed to send comment email to ${recipient.email}:`, emailError.message);
        }
      }

    } catch (error) {
      console.error('Error sending comment notification:', error);
    }
  }
}

// Export the class and a function to initialize the service
let notificationService = null;

export const initNotificationService = (db) => {
  notificationService = new NotificationService(db);
  return notificationService;
};

export const getNotificationService = () => {
  return notificationService;
};

export { NotificationService };
