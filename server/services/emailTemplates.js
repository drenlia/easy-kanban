/**
 * Email Templates - Centralized email content for the application
 */

import { getAppLanguage, getTranslator } from '../utils/i18n.js';
import { formatDateTimeLocal } from '../utils/dateFormatter.js';
import {
  formatDetailsForEmail,
  stripHtmlForEmail,
  formatWordDiffHtml,
  formatWordDiffText,
  buildTaskEmailUrl,
} from '../utils/emailContent.js';

/** Map activity / queue action codes → emails.taskNotification.common.actionMessage.* keys */
const ACTION_MESSAGE_KEY_MAP = {
  create_task: 'created',
  copy_task: 'created',
  update_task: 'updated',
  delete_task: 'updated',
  move_task: 'status_changed',
  associate_tag: 'updated',
  disassociate_tag: 'updated',
  create_tag: 'updated',
  update_tag: 'updated',
  delete_tag: 'updated',
  create_comment: 'commented',
  update_comment: 'commented',
  delete_comment: 'commented',
  agent_job_done: 'updated',
  agent_job_failed: 'updated',
  consolidated_update: 'consolidated_update',
  newTaskAssigned: 'assigned',
  created: 'created',
  assigned: 'assigned',
  updated: 'updated',
  commented: 'commented',
  status_changed: 'status_changed',
  priority_changed: 'priority_changed',
  due_date_changed: 'due_date_changed',
  assignee_changed: 'assignee_changed',
  requester_changed: 'requester_changed',
  default: 'default',
};

function resolveActionMessageKey(actionType, changedField, notificationType) {
  if (notificationType === 'newTaskAssigned') return 'assigned';
  if (changedField === 'memberId') return 'assignee_changed';
  if (changedField === 'requesterId') return 'requester_changed';
  if (!actionType) return 'default';
  return ACTION_MESSAGE_KEY_MAP[actionType] || 'default';
}

function isPeopleField(changedField) {
  return changedField === 'memberId' || changedField === 'requesterId';
}

/** Detect leftover raw member/user ids so we never show them in the diff. */
function looksLikeId(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return true;
  }
  if (/^user-[a-z0-9-]+$/i.test(s)) return true;
  return false;
}

function displayFirstName(user) {
  const name =
    user?.first_name ||
    user?.firstName ||
    (typeof user?.name === 'string' ? user.name.split(/\s+/)[0] : '') ||
    '';
  if (name) return name;
  if (user?.email) return String(user.email).split('@')[0];
  return 'there';
}

function displayBoardName(board) {
  return board?.name || board?.title || 'Board';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const EmailTemplates = {
  /**
   * User Invitation Template
   * Sent when an admin creates a new local account
   */
  userInvite: async (data) => {
    const { user, inviteUrl, adminName, siteName, db } = data;
    const t = db ? await getTranslator(db) : (key, options = {}) => key;
    
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
  taskNotification: async (data) => {
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
      changedField = null,
      notificationType = null,
      db
    } = data;

    const t = db ? await getTranslator(db) : (key) => key;
    const lang = db ? await getAppLanguage(db) : 'en';
    const firstName = displayFirstName(user);
    const boardName = displayBoardName(board);
    const detailsText = formatDetailsForEmail(actionDetails, lang);
    const taskTitle = task?.title || 'Task';

    const getActionMessage = () => {
      const actionKey = resolveActionMessageKey(
        actionType,
        changedField,
        notificationType
      );
      return t(`emails.taskNotification.common.actionMessage.${actionKey}`);
    };

    const getPeopleChangeDetails = () => {
      const beforeRaw = stripHtmlForEmail(oldValue);
      const afterRaw = stripHtmlForEmail(newValue);
      if (!beforeRaw && !afterRaw) return '';
      if (beforeRaw === afterRaw) return '';
      // Never surface raw IDs in the people-change card
      if (looksLikeId(beforeRaw) || looksLikeId(afterRaw)) return '';

      const before =
        beforeRaw || t('emails.taskNotification.common.unassigned');
      const after = afterRaw || t('emails.taskNotification.common.unassigned');
      const fieldLabel =
        changedField === 'requesterId'
          ? t('emails.taskNotification.common.fieldRequester')
          : t('emails.taskNotification.common.fieldAssignee');

      return `<div style="margin: 14px 0 0 0; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 10px;">${escapeHtml(fieldLabel)}</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
            <tr>
              <td style="padding: 8px 10px; background:#fef2f2; border-radius:4px; color:#7f1d1d; font-size:14px;">${escapeHtml(before)}</td>
              <td style="width:36px; text-align:center; color:#9ca3af; font-size:16px;">→</td>
              <td style="padding: 8px 10px; background:#f0fdf4; border-radius:4px; color:#14532d; font-size:14px; font-weight:600;">${escapeHtml(after)}</td>
            </tr>
          </table>
        </div>`;
    };

    const getChangeDetails = () => {
      if (isPeopleField(changedField)) {
        return getPeopleChangeDetails();
      }

      const before = stripHtmlForEmail(oldValue);
      const after = stripHtmlForEmail(newValue);
      if (!before && !after) return '';
      if (before === after) return '';
      // People-like short values without changedField (legacy queue rows)
      if (
        before.length < 80 &&
        after.length < 80 &&
        !before.includes('\n') &&
        !after.includes('\n') &&
        (looksLikeId(before) || looksLikeId(after))
      ) {
        return '';
      }
      if (
        before.length < 80 &&
        after.length < 80 &&
        !before.includes('\n') &&
        !after.includes('\n') &&
        !before.includes('<') &&
        !after.includes('<')
      ) {
        // Short non-prose change: From → To (dates, names, priorities, etc.)
        return `<div style="margin: 14px 0 0 0; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 10px;">${t('emails.taskNotification.common.changed')}</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
            <tr>
              <td style="padding: 8px 10px; background:#fef2f2; border-radius:4px; color:#7f1d1d; font-size:14px;">${escapeHtml(before || '—')}</td>
              <td style="width:36px; text-align:center; color:#9ca3af; font-size:16px;">→</td>
              <td style="padding: 8px 10px; background:#f0fdf4; border-radius:4px; color:#14532d; font-size:14px; font-weight:600;">${escapeHtml(after || '—')}</td>
            </tr>
          </table>
        </div>`;
      }

      const diffHtml = formatWordDiffHtml(before, after);
      if (!diffHtml) return '';

      // Inline word diff: red strike = removed, green bold = added
      return `<div style="margin: 14px 0 0 0; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 8px;">${t('emails.taskNotification.common.changed')}</div>
          <div style="font-size: 14px; line-height: 1.55; color: #374151;">${diffHtml}</div>
          <div style="margin-top: 10px; font-size: 11px; color: #9ca3af;">
            <span style="background-color:#fecaca;color:#7f1d1d;text-decoration:line-through;padding:0 3px;">${t('emails.taskNotification.common.diffRemoved')}</span>
            &nbsp;&nbsp;
            <span style="background-color:#bbf7d0;color:#14532d;font-weight:600;padding:0 3px;">${t('emails.taskNotification.common.diffAdded')}</span>
          </div>
        </div>`;
    };

    // Format timestamp for display
    const formattedTimestamp = timestamp ? formatDateTimeLocal(timestamp) : formatDateTimeLocal(new Date());
    
    // Get task ticket for subject
    const taskTicket = task?.ticket || '';
    const ticketPrefix = taskTicket ? `[ ${taskTicket} ] ` : '';
    const actionMessage = getActionMessage();
    const beforeText = stripHtmlForEmail(oldValue);
    const afterText = stripHtmlForEmail(newValue);
    let textChangeBlock = '';
    if (
      beforeText !== afterText &&
      (beforeText || afterText) &&
      !looksLikeId(beforeText) &&
      !looksLikeId(afterText)
    ) {
      if (isPeopleField(changedField) || (beforeText.length < 80 && afterText.length < 80)) {
        textChangeBlock = `\n${t('emails.taskNotification.common.changed')} ${beforeText || '—'} → ${afterText || '—'}\n`;
      } else {
        textChangeBlock = `\n${t('emails.taskNotification.common.changed')} ${formatWordDiffText(beforeText, afterText)}\n`;
      }
    }

    return {
      subject: `${ticketPrefix}${actionMessage} - ${taskTitle}`,
      text: `${t('emails.taskNotification.common.hi', { firstName })}

${actionMessage} in ${boardName}:

Task: ${taskTitle}
${project ? `${t('emails.taskNotification.common.project')} ${project}` : ''}
${t('emails.taskNotification.common.details')} ${detailsText}
${textChangeBlock}
${t('emails.taskNotification.common.viewTask')}: ${taskUrl}

Best regards,
${t('emails.taskNotification.common.teamSignature', { siteName: siteName || 'Easy Kanban' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">📋 ${t('emails.taskNotification.common.taskNotification')}</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">${t('emails.taskNotification.common.hi', { firstName })}</h2>
            <p style="color: #6b7280; line-height: 1.6; font-size: 16px;">
              ${escapeHtml(actionMessage)} in <strong>${escapeHtml(boardName)}</strong>:
            </p>
          </div>

          <div style="background-color: #fff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; margin-top: 0; font-size: 18px;">📝 ${escapeHtml(taskTitle)}</h3>
            ${project ? `<p style="color: #6b7280; margin: 5px 0;"><strong>${t('emails.taskNotification.common.project')}</strong> ${escapeHtml(project)}</p>` : ''}
            <p style="color: #6b7280; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp')}</strong> ${escapeHtml(formattedTimestamp)}</p>
            <p style="color: #374151; margin: 10px 0;"><strong>${t('emails.taskNotification.common.details')}</strong> ${escapeHtml(detailsText)}</p>
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
  commentNotification: async (data) => {
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

    const t = db ? await getTranslator(db) : (key) => key;
    const firstName = displayFirstName(user);
    const boardName = displayBoardName(board);
    const taskTitle = task?.title || 'Task';
    const authorFirst =
      commentAuthor?.first_name || commentAuthor?.firstName || 'Someone';
    const authorLast = commentAuthor?.last_name || commentAuthor?.lastName || '';
    const authorInitials = `${String(authorFirst).charAt(0)}${String(authorLast).charAt(0)}`;

    // Format timestamp for display
    const formattedTimestamp = timestamp ? formatDateTimeLocal(timestamp) : formatDateTimeLocal(new Date());
    
    // Get task ticket for subject
    const taskTicket = task?.ticket || '';
    const ticketPrefix = taskTicket ? `[ ${taskTicket} ] ` : '';
    const commentText = (comment?.text || '').replace(/<[^>]*>/g, '');

    return {
      subject: `${ticketPrefix}${t('emails.commentNotification.subject', { taskTitle })}`,
      text: `${t('emails.taskNotification.common.hi', { firstName })}

${authorFirst} ${authorLast} ${t('emails.commentNotification.addedCommentToTask')}

Task: ${taskTitle}
${project ? `${t('emails.taskNotification.common.project')} ${project}` : ''}
${t('emails.taskNotification.common.board')} ${boardName}

Comment: ${commentText}

${t('emails.taskNotification.common.viewTask')}: ${taskUrl}

Best regards,
${t('emails.taskNotification.common.teamSignature', { siteName: siteName || 'Easy Kanban' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0;">💬 ${t('emails.commentNotification.title')}</h1>
          </div>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #374151; margin-top: 0;">${t('emails.taskNotification.common.hi', { firstName })}</h2>
            <p style="color: #6b7280; line-height: 1.6;">
              <strong>${escapeHtml(authorFirst)} ${escapeHtml(authorLast)}</strong> ${t('emails.commentNotification.addedCommentToTask')}
            </p>
          </div>

          <div style="background-color: #fff; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3 style="color: #1f2937; margin-top: 0;">📝 ${escapeHtml(taskTitle)}</h3>
            ${project ? `<p style="color: #6b7280; margin: 5px 0;"><strong>${t('emails.taskNotification.common.project')}</strong> ${escapeHtml(project)}</p>` : ''}
            <p style="color: #6b7280; margin: 5px 0;"><strong>${t('emails.taskNotification.common.board')}</strong> ${escapeHtml(boardName)}</p>
            <p style="color: #6b7280; margin: 5px 0; font-size: 14px;"><strong>${t('emails.taskNotification.common.timestamp')}</strong> ${escapeHtml(formattedTimestamp)}</p>
          </div>

          <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 16px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <div style="background-color: #0ea5e9; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 10px; font-weight: bold;">
                ${escapeHtml(authorInitials)}
              </div>
              <strong style="color: #0c4a6e;">${escapeHtml(authorFirst)} ${escapeHtml(authorLast)}</strong>
            </div>
            <div style="color: #374151; line-height: 1.6;">
              ${comment?.text || ''}
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
  passwordReset: async (data) => {
    const { user, resetUrl, siteName, db } = data;
    const t = db ? await getTranslator(db) : (key, options = {}) => key;
    
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
  },

  /**
   * Bulk multi-select field update — one email listing all affected tasks for a recipient.
   */
  bulkTaskNotification: async (data) => {
    const {
      user,
      actorName,
      boardTitle,
      field,
      tasks = [],
      changeBefore = '',
      changeAfter = '',
      summaryDetails = '',
      baseUrl = '',
      siteName,
      timestamp,
      db,
    } = data;

    const t = db ? await getTranslator(db) : (key) => key;
    const firstName = displayFirstName(user);
    const count = tasks.length;
    const board = boardTitle || 'Board';
    const formattedTimestamp = db
      ? await formatDateTimeLocal(timestamp || new Date().toISOString(), db)
      : String(timestamp || new Date().toISOString());

    const summaryKey =
      field === 'memberId'
        ? 'summaryAssignee'
        : field === 'requesterId'
          ? 'summaryRequester'
          : field === 'priorityId'
            ? 'summaryPriority'
            : field === 'sprintId'
              ? 'summarySprint'
              : 'summaryDefault';
    const summary = t(`emails.bulkTaskNotification.${summaryKey}`);

    const fieldLabel =
      field === 'memberId'
        ? t('emails.taskNotification.common.fieldAssignee')
        : field === 'requesterId'
          ? t('emails.taskNotification.common.fieldRequester')
          : field === 'priorityId'
            ? t('emails.taskNotification.common.fieldPriority')
            : field === 'sprintId'
              ? t('emails.taskNotification.common.fieldSprint')
              : t('emails.bulkTaskNotification.whatChanged');

    const before =
      changeBefore || t('emails.taskNotification.common.unassigned');
    const after =
      changeAfter || t('emails.taskNotification.common.unassigned');
    const showFromTo = Boolean(changeBefore && changeAfter && changeBefore !== changeAfter);
    const showSetTo = Boolean(changeAfter) && !showFromTo;

    const changeHtml = showFromTo
      ? `<div style="margin: 14px 0; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 10px;">${escapeHtml(fieldLabel)}</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
            <tr>
              <td style="padding: 8px 10px; background:#fef2f2; border-radius:4px; color:#7f1d1d; font-size:14px;">${escapeHtml(before)}</td>
              <td style="width:36px; text-align:center; color:#9ca3af; font-size:16px;">→</td>
              <td style="padding: 8px 10px; background:#f0fdf4; border-radius:4px; color:#14532d; font-size:14px; font-weight:600;">${escapeHtml(after)}</td>
            </tr>
          </table>
        </div>`
      : showSetTo
        ? `<div style="margin: 14px 0; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px 14px;">
          <div style="font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 8px;">${escapeHtml(fieldLabel)}</div>
          <div style="font-size: 14px; color: #14532d;"><strong>${t('emails.bulkTaskNotification.setTo')}:</strong> ${escapeHtml(after)}</div>
        </div>`
        : '';

    const changeText = showFromTo
      ? `\n${fieldLabel}: ${before} → ${after}\n`
      : showSetTo
        ? `\n${fieldLabel}: ${t('emails.bulkTaskNotification.setTo')} ${after}\n`
        : '';

    const taskRowsHtml = tasks
      .map((task) => {
        const ticket = task.ticket || task.id;
        const url = buildTaskEmailUrl(baseUrl, {
          projectId: task.projectId,
          ticket,
          taskId: task.id,
        });
        return `<tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 12px; color: #4b5563; white-space: nowrap;">${escapeHtml(ticket)}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827;">${escapeHtml(task.title || 'Task')}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">
            <a href="${escapeHtml(url)}" style="color: #2563eb; font-size: 13px; text-decoration: none;">${t('emails.bulkTaskNotification.viewTask')}</a>
          </td>
        </tr>`;
      })
      .join('');

    const taskLinesText = tasks
      .map((task) => {
        const ticket = task.ticket || task.id;
        const url = buildTaskEmailUrl(baseUrl, {
          projectId: task.projectId,
          ticket,
          taskId: task.id,
        });
        return `- [${ticket}] ${task.title || 'Task'}\n  ${url}`;
      })
      .join('\n');

    const subject = t('emails.bulkTaskNotification.subject', {
      count,
      summary,
      boardTitle: board,
    });

    return {
      subject,
      text: `${t('emails.bulkTaskNotification.hi', { firstName })}

${t('emails.bulkTaskNotification.intro', {
  actorName: actorName || 'Someone',
  count,
  boardTitle: board,
})}
${summaryDetails ? `\n${summaryDetails}\n` : ''}${changeText}
${t('emails.bulkTaskNotification.tasksAffected')} (${count}):
${taskLinesText}

${formattedTimestamp}

${t('emails.bulkTaskNotification.receivingReason')}
${t('emails.bulkTaskNotification.teamSignature', { siteName: siteName || 'Easy Kanban' })}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="color: #2563eb; margin: 0;">📋 ${t('emails.bulkTaskNotification.title')}</h1>
          </div>
          <h2 style="color: #374151; margin-top: 0;">${t('emails.bulkTaskNotification.hi', { firstName })}</h2>
          <p style="color: #374151; line-height: 1.5;">
            ${escapeHtml(
              t('emails.bulkTaskNotification.intro', {
                actorName: actorName || 'Someone',
                count,
                boardTitle: board,
              })
            )}
          </p>
          ${summaryDetails ? `<p style="color: #4b5563; font-size: 14px;"><strong>${t('emails.taskNotification.common.details')}</strong> ${escapeHtml(summaryDetails)}</p>` : ''}
          ${changeHtml}
          <div style="margin: 20px 0;">
            <div style="font-size: 11px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 8px;">
              ${t('emails.bulkTaskNotification.tasksAffected')} (${count})
            </div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width:100%; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
              ${taskRowsHtml}
            </table>
          </div>
          <p style="color: #6b7280; font-size: 13px;"><strong>${t('emails.taskNotification.common.timestamp')}</strong> ${escapeHtml(formattedTimestamp)}</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            ${t('emails.bulkTaskNotification.receivingReason')}<br>
            <strong>${t('emails.bulkTaskNotification.teamSignature', { siteName: siteName || 'Easy Kanban' })}</strong>
          </p>
        </div>
      `,
    };
  },
};

export default EmailTemplates;
