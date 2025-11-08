/**
 * Email Templates - Centralized email content for the application
 */

import { getTranslator } from '../utils/i18n.js';

export const EmailTemplates = {
  /**
   * User Invitation Template
   * Sent when an admin creates a new local account
   */
  userInvite: (data) => {
    const { user, inviteUrl, adminName, siteName, db } = data;
    const t = db ? getTranslator(db) : (key, options = {}) => key;
    
    return {
      subject: t('emails.userInvite.subject', { siteName: siteName || 'Easy Kanban' }),
      text: `${t('emails.userInvite.greeting', { firstName: user.first_name, lastName: user.last_name })}

${t('emails.userInvite.body1', { adminName, siteName: siteName || 'Easy Kanban' })}

${t('emails.userInvite.body2')}
${inviteUrl}

${t('emails.userInvite.body3')}

${t('emails.userInvite.body4')}

${t('emails.userInvite.body5')}
${t('emails.userInvite.body6', { siteName: siteName || 'Easy Kanban' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">🎉 ${t('emails.userInvite.subject', { siteName: siteName || 'Easy Kanban' })}</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">${t('emails.userInvite.greeting', { firstName: user.first_name, lastName: user.last_name })}</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              ${t('emails.userInvite.body1', { adminName, siteName: siteName || 'Easy Kanban' })}
            </p>
          </div>

          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin-bottom: 30px;">
            <h3 style="color: #1d4ed8; margin-top: 0;">🔐 ${t('emails.userInvite.accountDetails')}</h3>
            <ul style="color: #374151; margin: 0; padding-left: 20px;">
              <li><strong>${t('emails.userInvite.email')}</strong> ${user.email}</li>
              <li><strong>${t('emails.userInvite.name')}</strong> ${user.first_name} ${user.last_name}</li>
              <li><strong>${t('emails.userInvite.accountType')}</strong> ${t('emails.userInvite.localAccount')}</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              🚀 ${t('emails.userInvite.activateAccount')}
            </a>
          </div>
          
          <div style="background-color: #fef3c7; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
            <p style="color: #92400e; margin: 0; font-size: 14px;">
              ⏰ <strong>Important:</strong> ${t('emails.userInvite.body3')}
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            ${t('emails.userInvite.body4')}
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            ${t('emails.userInvite.body5')}<br>
            <strong>${t('emails.userInvite.body6', { siteName: siteName || 'Easy Kanban' })}</strong>
          </p>
        </div>
      `
    };
  },

  /**
   * Task Notification Template
   * Sent when tasks are created, updated, assigned, etc.
   */
  taskNotification: (data) => {
    const { 
      user, 
      task, 
      board, 
      project, 
      actionType, 
      actionDetails, 
      taskUrl, 
      siteName,
      oldValue,
      newValue 
    } = data;

    const getActionMessage = () => {
      switch (actionType) {
        case 'created':
          return `A new task has been created`;
        case 'assigned':
          return `You have been assigned to a task`;
        case 'updated':
          return `A task you're involved in has been updated`;
        case 'commented':
          return `A new comment has been added to a task you're following`;
        case 'status_changed':
          return `Task status has been changed`;
        case 'priority_changed':
          return `Task priority has been changed`;
        case 'due_date_changed':
          return `Task due date has been changed`;
        default:
          return `Task activity notification`;
      }
    };

    const getChangeDetails = () => {
      if (oldValue && newValue && oldValue !== newValue) {
        return `<div style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin: 10px 0;">
          <strong>Changed:</strong><br>
          <span style="color: #dc2626;">❌ ${oldValue}</span><br>
          <span style="color: #16a34a;">✅ ${newValue}</span>
        </div>`;
      }
      return '';
    };

    return {
      subject: `${siteName || 'Easy Kanban'}: ${getActionMessage()} - ${task.title}`,
      text: `Hi ${user.first_name},

${getActionMessage()} in ${board.name}:

Task: ${task.title}
${project ? `Project: ${project}` : ''}
Details: ${actionDetails}

View task: ${taskUrl}

Best regards,
The ${siteName || 'Easy Kanban'} Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">📋 Task Notification</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">Hi ${user.first_name},</h2>
            <p style="color: #6b7280; line-height: 1.6; font-size: 16px;">
              ${getActionMessage()} in <strong>${board.name}</strong>:
            </p>
          </div>

          <div style="background-color: #fff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; margin-top: 0; font-size: 18px;">📝 ${task.title}</h3>
            ${project ? `<p style="color: #6b7280; margin: 5px 0;"><strong>Project:</strong> ${project}</p>` : ''}
            <p style="color: #374151; margin: 10px 0;"><strong>Details:</strong> ${actionDetails}</p>
            ${getChangeDetails()}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${taskUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              👀 View Task
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            You received this notification because you're involved in this task.<br>
            <strong>The ${siteName || 'Easy Kanban'} Team</strong>
          </p>
        </div>
      `
    };
  },

  /**
   * Comment Notification Template
   * Sent when comments are added to tasks
   */
  commentNotification: (data) => {
    const { 
      user, 
      task, 
      board, 
      project, 
      comment, 
      commentAuthor, 
      taskUrl, 
      siteName 
    } = data;

    return {
      subject: `${siteName || 'Easy Kanban'}: New comment on "${task.title}"`,
      text: `Hi ${user.first_name},

${commentAuthor.first_name} ${commentAuthor.last_name} added a new comment to a task you're following:

Task: ${task.title}
${project ? `Project: ${project}` : ''}
Board: ${board.name}

Comment: ${comment.text.replace(/<[^>]*>/g, '')} // Strip HTML for text version

View task: ${taskUrl}

Best regards,
The ${siteName || 'Easy Kanban'} Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">💬 New Comment</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">Hi ${user.first_name},</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              <strong>${commentAuthor.first_name} ${commentAuthor.last_name}</strong> added a new comment to a task you're following:
            </p>
          </div>

          <div style="background-color: #fff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; margin-top: 0;">📝 ${task.title}</h3>
            ${project ? `<p style="color: #6b7280; margin: 5px 0;"><strong>Project:</strong> ${project}</p>` : ''}
            <p style="color: #6b7280; margin: 5px 0;"><strong>Board:</strong> ${board.name}</p>
          </div>

          <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <div style="background-color: #0ea5e9; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; font-weight: bold;">
                ${commentAuthor.first_name.charAt(0)}${commentAuthor.last_name.charAt(0)}
              </div>
              <strong style="color: #0c4a6e;">${commentAuthor.first_name} ${commentAuthor.last_name}</strong>
            </div>
            <div style="color: #374151; line-height: 1.6;">
              ${comment.text}
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${taskUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              💬 View Task & Reply
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            You received this notification because you're involved in this task.<br>
            <strong>The ${siteName || 'Easy Kanban'} Team</strong>
          </p>
        </div>
      `
    };
  },

  /**
   * Password Reset Template
   * Sent when users request password reset
   */
  passwordReset: (data) => {
    const { user, resetUrl, siteName, db } = data;
    const t = db ? getTranslator(db) : (key, options = {}) => key;
    
    return {
      subject: t('emails.passwordReset.subject'),
      text: `${t('emails.passwordReset.greeting', { firstName: user.first_name, lastName: user.last_name })}

${t('emails.passwordReset.body1', { siteName: siteName || 'Easy Kanban' })}

${t('emails.passwordReset.body2')}
${resetUrl}

${t('emails.passwordReset.body3')}

${t('emails.passwordReset.body4')}

${t('emails.passwordReset.body5')}
${t('emails.passwordReset.body6', { siteName: siteName || 'Easy Kanban' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">🔐 ${t('emails.passwordReset.subject')}</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">${t('emails.passwordReset.greeting', { firstName: user.first_name, lastName: user.last_name })}</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              ${t('emails.passwordReset.body1', { siteName: siteName || 'Easy Kanban' })}
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">
              🔄 ${t('emails.passwordReset.resetButton')}
            </a>
          </div>
          
          <div style="background-color: #fef3c7; padding: 16px; border-radius: 6px; margin-bottom: 20px;">
            <p style="color: #92400e; margin: 0; font-size: 14px;">
              ⏰ <strong>Important:</strong> ${t('emails.passwordReset.body3')}
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            ${t('emails.passwordReset.body4')}
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            ${t('emails.passwordReset.body5')}<br>
            <strong>${t('emails.passwordReset.body6', { siteName: siteName || 'Easy Kanban' })}</strong>
          </p>
        </div>
      `
    };
  }
};

export default EmailTemplates;
