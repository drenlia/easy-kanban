import EmailService from './emailService.js';
import { EmailTemplates } from './emailTemplates.js';
import { wrapQuery } from '../utils/queryLogger.js';

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
  getUserNotificationPreferences(userId) {
    try {
      const userSettings = wrapQuery(
        this.db.prepare('SELECT notifications FROM user_settings WHERE user_id = ?'),
        'SELECT'
      ).get(userId);

      if (userSettings && userSettings.notifications) {
        return JSON.parse(userSettings.notifications);
      }
      
      // Default preferences (all enabled)
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
    } catch (error) {
      console.warn('Failed to get user notification preferences:', error.message);
      return {};
    }
  }

  /**
   * Get task participants (assignee, watchers, collaborators, requester)
   */
  getTaskParticipants(taskId) {
    try {
      // Get basic task info
      const task = wrapQuery(
        this.db.prepare('SELECT memberId, requesterId, title, ticket FROM tasks WHERE id = ?'),
        'SELECT'
      ).get(taskId);

      if (!task) return {};

      // Get watchers
      const watchers = wrapQuery(
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
      const collaborators = wrapQuery(
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
        assignee = wrapQuery(
          this.db.prepare(`
            SELECT m.user_id as userId, m.name, u.email 
            FROM members m 
            JOIN users u ON m.user_id = u.id 
            WHERE u.id = ?
          `),
          'SELECT'
        ).get(task.memberId);
      }

      // Get requester info
      let requester = null;
      if (task.requesterId) {
        requester = wrapQuery(
          this.db.prepare(`
            SELECT m.user_id as userId, m.name, u.email 
            FROM members m 
            JOIN users u ON m.user_id = u.id 
            WHERE u.id = ?
          `),
          'SELECT'
        ).get(task.requesterId);
      }

      return {
        task,
        assignee,
        requester,
        watchers,
        collaborators
      };
    } catch (error) {
      console.warn('Failed to get task participants:', error.message);
      return {};
    }
  }

  /**
   * Generate email templates for different notification types
   */
  generateEmailTemplate(notificationType, data) {
    const siteSettings = this.getSiteSettings();
    
    // Add site settings to data for templates
    const templateData = {
      ...data,
      siteName: siteSettings.SITE_NAME || 'Easy Kanban',
      siteUrl: siteSettings.SITE_URL || 'http://localhost:3000'
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
        return this.generateLegacyTemplate(notificationType, data);
    }
  }

  /**
   * Legacy template generation (keeping for backwards compatibility)
   */
  generateLegacyTemplate(notificationType, data) {
    const { task, action, details, actor, oldValue, newValue, participants } = data;
    const taskIdentifier = task.ticket || `Task #${task.id.substring(0, 8)}`;
    const siteSettings = this.getSiteSettings();
    const siteUrl = siteSettings.SITE_URL || 'http://localhost:3000';
    const taskUrl = task.ticket ? `${siteUrl}/project/#${participants.projectId || ''}#${task.ticket}` : `${siteUrl}#task#${task.id}`;

    const templates = {
      newTaskAssigned: {
        subject: `📋 New task assigned: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">New Task Assigned</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>Task ID:</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>Assigned by:</strong> ${actor.name}</p>
            </div>
            <div style="margin: 20px 0;">
              <a href="${taskUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Task</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">You're receiving this because you were assigned to this task.</p>
          </div>
        `
      },

      myTaskUpdated: {
        subject: `📝 Your task was updated: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Task Updated</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>Task ID:</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>Updated by:</strong> ${actor.name}</p>
              <div style="background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <strong style="color: #92400e;">What changed:</strong>
                <p style="color: #92400e; margin: 10px 0 0 0;">${this.formatChangeDetails(details, oldValue, newValue)}</p>
              </div>
            </div>
            <div style="margin: 20px 0;">
              <a href="${taskUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Task</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">You're receiving this because you're assigned to this task.</p>
          </div>
        `
      },

      watchedTaskUpdated: {
        subject: `👀 Watched task updated: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #7c3aed;">Watched Task Updated</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>Task ID:</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>Updated by:</strong> ${actor.name}</p>
              <div style="background-color: #ede9fe; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <strong style="color: #6b21a8;">What changed:</strong>
                <p style="color: #6b21a8; margin: 10px 0 0 0;">${this.formatChangeDetails(details, oldValue, newValue)}</p>
              </div>
            </div>
            <div style="margin: 20px 0;">
              <a href="${taskUrl}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Task</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">You're receiving this because you're watching this task.</p>
          </div>
        `
      },

      addedAsCollaborator: {
        subject: `🤝 Added as collaborator: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">Added as Collaborator</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>Task ID:</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>Added by:</strong> ${actor.name}</p>
            </div>
            <div style="margin: 20px 0;">
              <a href="${taskUrl}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Task</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">You're now collaborating on this task and will receive updates about changes.</p>
          </div>
        `
      },

      collaboratingTaskUpdated: {
        subject: `🤝 Collaborating task updated: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #059669;">Collaborating Task Updated</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>Task ID:</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>Updated by:</strong> ${actor.name}</p>
              <div style="background-color: #ecfdf5; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <strong style="color: #065f46;">What changed:</strong>
                <p style="color: #065f46; margin: 10px 0 0 0;">${this.formatChangeDetails(details, oldValue, newValue)}</p>
              </div>
            </div>
            <div style="margin: 20px 0;">
              <a href="${taskUrl}" style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Task</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">You're receiving this because you're collaborating on this task.</p>
          </div>
        `
      },

      commentAdded: {
        subject: `💬 New comment on: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">New Comment</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>Task ID:</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>Comment by:</strong> ${actor.name}</p>
              ${data.commentContent ? `
                <div style="background-color: #fef2f2; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #dc2626;">
                  <strong style="color: #991b1b;">New Comment:</strong>
                  <div style="color: #991b1b; margin: 10px 0 0 0;">${data.commentContent}</div>
                </div>
              ` : ''}
            </div>
            <div style="margin: 20px 0;">
              <a href="${taskUrl}#comments" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Comment</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">You're receiving this because you're involved in this task.</p>
          </div>
        `
      },

      requesterTaskCreated: {
        subject: `✅ Your requested task was created: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">Task Created</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>Task ID:</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>Created by:</strong> ${actor.name}</p>
            </div>
            <div style="margin: 20px 0;">
              <a href="${taskUrl}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Task</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">You're receiving this because you requested this task.</p>
          </div>
        `
      },

      requesterTaskUpdated: {
        subject: `📋 Your requested task was updated: ${task.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #16a34a;">Requested Task Updated</h2>
            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #1e293b;">${task.title}</h3>
              <p style="color: #64748b; margin: 5px 0;"><strong>Task ID:</strong> ${taskIdentifier}</p>
              <p style="color: #64748b; margin: 5px 0;"><strong>Updated by:</strong> ${actor.name}</p>
              <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; margin: 15px 0;">
                <strong style="color: #166534;">What changed:</strong>
                <p style="color: #166534; margin: 10px 0 0 0;">${this.formatChangeDetails(details, oldValue, newValue)}</p>
              </div>
            </div>
            <div style="margin: 20px 0;">
              <a href="${taskUrl}" style="background-color: #16a34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Task</a>
            </div>
            <p style="color: #64748b; font-size: 14px;">You're receiving this because you requested this task.</p>
          </div>
        `
      }
    };

    return templates[notificationType] || null;
  }

  /**
   * Format change details for email templates
   */
  formatChangeDetails(details, oldValue, newValue) {
    if (oldValue !== undefined && newValue !== undefined) {
      // Handle specific field changes with before/after
      if (oldValue && newValue) {
        return `
          <div style="margin: 10px 0;">
            <div style="background-color: #fee2e2; padding: 10px; border-radius: 4px; margin: 5px 0;">
              <strong>Before:</strong> ${this.escapeHtml(String(oldValue))}
            </div>
            <div style="background-color: #dcfce7; padding: 10px; border-radius: 4px; margin: 5px 0;">
              <strong>After:</strong> ${this.escapeHtml(String(newValue))}
            </div>
          </div>
        `;
      } else if (newValue) {
        return `<strong>Set to:</strong> ${this.escapeHtml(String(newValue))}`;
      } else if (oldValue) {
        return `<strong>Cleared</strong> (was: ${this.escapeHtml(String(oldValue))})`;
      }
    }
    
    return this.escapeHtml(details);
  }

  /**
   * Escape HTML for safe display
   */
  escapeHtml(text) {
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
  getSiteSettings() {
    try {
      const settings = {};
      const keys = ['SITE_NAME', 'SITE_URL'];
      keys.forEach(key => {
        const setting = wrapQuery(
          this.db.prepare('SELECT value FROM settings WHERE key = ?'),
          'SELECT'
        ).get(key);
        settings[key] = setting ? setting.value : '';
      });
      return settings;
    } catch (error) {
      console.warn('Failed to get site settings:', error.message);
      return {};
    }
  }

  /**
   * Send notification email based on activity
   */
  async sendTaskNotification(activityData) {
    try {
      const { userId, action, taskId, details, oldValue, newValue } = activityData;
      
      // Get task participants
      const participants = this.getTaskParticipants(taskId);
      if (!participants.task) return;

      // Get actor information
      const actor = wrapQuery(
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

      // Send emails to each recipient
      for (const notification of notifications) {
        const { recipientUserId, notificationType } = notification;
        
        // Check user preferences
        const userPrefs = this.getUserNotificationPreferences(recipientUserId);
        if (!userPrefs[notificationType]) continue;

        // Get recipient email
        const recipient = wrapQuery(
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
        const template = this.generateEmailTemplate(notificationType, templateData);
        if (!template) continue;

        // Send the email
        try {
          await this.emailService.sendEmail({
            to: recipient.email,
            subject: template.subject,
            html: template.html
          });

          console.log(`📧 Notification sent to ${recipient.name} (${recipient.email}) for ${notificationType}`);
        } catch (emailError) {
          console.error(`Failed to send email to ${recipient.email}:`, emailError.message);
        }
      }

    } catch (error) {
      console.error('Error sending task notification:', error);
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
      const user = wrapQuery(
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

      const siteSettings = this.getSiteSettings();
      const actualBaseUrl = baseUrl || siteSettings.SITE_URL || 'http://localhost:3000';
      const inviteUrl = `${actualBaseUrl}/#activate-account?token=${inviteToken}&email=${encodeURIComponent(user.email)}`;

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
        wrapQuery(
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
      const participants = this.getTaskParticipants(taskId);
      if (!participants.task) return;

      // Get actor information
      const actor = wrapQuery(
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
        const userPrefs = this.getUserNotificationPreferences(recipientUserId);
        if (!userPrefs.commentAdded) continue;

        // Get recipient email
        const recipient = wrapQuery(
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
