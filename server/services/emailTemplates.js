/**
 * Email Templates - Centralized email content for the application
 */

import { getTranslator } from '../utils/i18n.js';
import { formatDateTimeLocal } from '../utils/dateFormatter.js';

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
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
              <tr>
                <td align="center" style="border-radius: 6px; background-color: #2563eb;">
                  <a href="${inviteUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    🚀 ${t('emails.userInvite.activateAccount')}
                  </a>
                </td>
              </tr>
            </table>
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
      newValue,
      timestamp,
      db
    } = data;

    const t = db ? getTranslator(db) : (key, options = {}) => key;

    const getActionMessage = () => {
      const actionKey = actionType || 'default';
      return t(`emails.taskNotification.common.actionMessage.${actionKey}`, {}, 
        t('emails.taskNotification.common.actionMessage.default'));
    };

    const getChangeDetails = () => {
      if (oldValue && newValue && oldValue !== newValue) {
        return `<div style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin: 10px 0;">
          <strong>${t('emails.taskNotification.common.changed')}</strong><br>
          <span style="color: #dc2626;">❌ ${oldValue}</span><br>
          <span style="color: #16a34a;">✅ ${newValue}</span>
        </div>`;
      }
      return '';
    };

    // Format timestamp for display
    const formattedTimestamp = timestamp ? formatDateTimeLocal(timestamp) : formatDateTimeLocal(new Date());
    
    // Get task ticket for subject
    const taskTicket = task?.ticket || '';
    const ticketPrefix = taskTicket ? `[ ${taskTicket} ] ` : '';

    return {
      subject: `${ticketPrefix}${getActionMessage()} - ${task.title}`,
      text: `${t('emails.taskNotification.common.hi', { firstName: user.first_name })}

${getActionMessage()} in ${board.name}:

Task: ${task.title}
${project ? `${t('emails.taskNotification.common.project')} ${project}` : ''}
${t('emails.taskNotification.common.details')} ${actionDetails}

${t('emails.taskNotification.common.viewTask')}: ${taskUrl}

Best regards,
${t('emails.taskNotification.common.teamSignature', { siteName: siteName || 'Easy Kanban' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">📋 ${t('emails.taskNotification.common.taskNotification')}</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">${t('emails.taskNotification.common.hi', { firstName: user.first_name })}</h2>
            <p style="color: #6b7280; line-height: 1.6; font-size: 16px;">
              ${getActionMessage()} in <strong>${board.name}</strong>:
            </p>
          </div>

          <div style="background-color: #fff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; margin-top: 0; font-size: 18px;">📝 ${task.title}</h3>
            ${project ? `<p style="color: #6b7280; margin: 5px 0;"><strong>${t('emails.taskNotification.common.project')}</strong> ${project}</p>` : ''}
            <p style="color: #6b7280; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
            <p style="color: #374151; margin: 10px 0;"><strong>${t('emails.taskNotification.common.details')}</strong> ${actionDetails}</p>
            ${getChangeDetails()}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
              <tr>
                <td align="center" style="border-radius: 6px; background-color: #2563eb;">
                  <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    👀 ${t('emails.taskNotification.common.viewTask')}
                  </a>
                </td>
              </tr>
            </table>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            ${t('emails.taskNotification.common.receivingReason')}<br>
            <strong>${t('emails.taskNotification.common.teamSignature', { siteName: siteName || 'Easy Kanban' })}</strong>
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
      siteName,
      timestamp,
      db
    } = data;

    const t = db ? getTranslator(db) : (key, options = {}) => key;

    // Format timestamp for display
    const formattedTimestamp = timestamp ? formatDateTimeLocal(timestamp) : formatDateTimeLocal(new Date());
    
    // Get task ticket for subject
    const taskTicket = task?.ticket || '';
    const ticketPrefix = taskTicket ? `[ ${taskTicket} ] ` : '';

    return {
      subject: `${ticketPrefix}${t('emails.commentNotification.subject', { taskTitle: task.title })}`,
      text: `${t('emails.taskNotification.common.hi', { firstName: user.first_name })}

${commentAuthor.first_name} ${commentAuthor.last_name} ${t('emails.commentNotification.addedCommentToTask')}

Task: ${task.title}
${project ? `${t('emails.taskNotification.common.project')} ${project}` : ''}
${t('emails.taskNotification.common.board')} ${board.name}

Comment: ${comment.text.replace(/<[^>]*>/g, '')}

${t('emails.taskNotification.common.viewTask')}: ${taskUrl}

Best regards,
${t('emails.taskNotification.common.teamSignature', { siteName: siteName || 'Easy Kanban' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">💬 ${t('emails.commentNotification.title')}</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">${t('emails.taskNotification.common.hi', { firstName: user.first_name })}</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              <strong>${commentAuthor.first_name} ${commentAuthor.last_name}</strong> ${t('emails.commentNotification.addedCommentToTask')}
            </p>
          </div>

          <div style="background-color: #fff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; margin-top: 0;">📝 ${task.title}</h3>
            ${project ? `<p style="color: #6b7280; margin: 5px 0;"><strong>${t('emails.taskNotification.common.project')}</strong> ${project}</p>` : ''}
            <p style="color: #6b7280; margin: 5px 0;"><strong>${t('emails.taskNotification.common.board')}</strong> ${board.name}</p>
            <p style="color: #6b7280; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp', 'Date/Time')}</strong> ${formattedTimestamp}</p>
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
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
              <tr>
                <td align="center" style="border-radius: 6px; background-color: #2563eb;">
                  <a href="${taskUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    ${t('emails.taskNotification.common.viewTaskReply')}
                  </a>
                </td>
              </tr>
            </table>
          </div>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            ${t('emails.taskNotification.common.receivingReason')}<br>
            <strong>${t('emails.taskNotification.common.teamSignature', { siteName: siteName || 'Easy Kanban' })}</strong>
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
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
              <tr>
                <td align="center" style="border-radius: 6px; background-color: #dc2626;">
                  <a href="${resetUrl}" target="_blank" style="display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
                    🔄 ${t('emails.passwordReset.resetButton')}
                  </a>
                </td>
              </tr>
            </table>
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
