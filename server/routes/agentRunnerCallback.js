/**
 * Runner → Easy Kanban callbacks (auth via per-job callback_token, not user JWT).
 */

import express from 'express';
import crypto from 'crypto';
import { getRequestDatabase, getTenantId } from '../middleware/tenantRouting.js';
import {
  tasks as taskQueries,
  taskWork as taskWorkQueries,
  comments as commentQueries
} from '../utils/sqlManager/index.js';
import { AGENT_MEMBER_ID, AGENT_USER_ID } from '../constants/agentIdentity.js';
import { AGENT_ACTIONS, COMMENT_ACTIONS } from '../constants/activityActions.js';
import { logCommentActivity, logTaskActivity } from '../services/activityLogger.js';
import notificationService from '../services/notificationService.js';
import { tryLaunchQueuedTasks } from '../services/agentJobDispatcher.js';
import { requireAiEnabledMiddleware } from '../utils/aiEnabled.js';
import { markdownToHtml } from '../utils/markdownToHtml.js';
import { stripModelReasoning } from '../utils/stripModelReasoning.js';

const router = express.Router();
const requireAi = requireAiEnabledMiddleware(getRequestDatabase);

router.use(requireAi);

async function publishWork(req, taskId) {
  const db = getRequestDatabase(req);
  const task = await taskQueries.getTaskById(db, taskId);
  const work = await taskWorkQueries.getWorkMapByTaskId(db, taskId);
  await notificationService.publish(
    'task-work-updated',
    {
      taskId,
      boardId: task?.boardid || task?.boardId,
      work,
      timestamp: new Date().toISOString()
    },
    getTenantId(req)
  );
  return work;
}

/**
 * POST /callback
 * Headers: X-Agent-Callback-Token: <token>
 * Body: { jobId, taskId, event, progress?, log?, comment?, status?, prUrl?, branch? }
 */
router.post('/callback', async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const token =
      req.get('x-agent-callback-token') ||
      req.body?.callbackToken ||
      '';
    const taskId = String(req.body?.taskId || '').trim();
    const jobId = String(req.body?.jobId || '').trim();
    const event = String(req.body?.event || '').trim().toLowerCase();

    if (!taskId || !token || !event) {
      return res.status(400).json({ error: 'taskId, callbackToken, and event are required' });
    }

    const work = await taskWorkQueries.getWorkMapByTaskId(db, taskId);
    if (!work.callback_token || work.callback_token !== token) {
      return res.status(401).json({ error: 'Invalid callback token' });
    }
    if (work.runner_job_id && jobId && work.runner_job_id !== jobId) {
      return res.status(409).json({ error: 'jobId does not match this task' });
    }

    const task = await taskQueries.getTaskById(db, taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const updates = {};
    if (req.body?.progress !== undefined && req.body.progress !== null) {
      updates.progress = String(req.body.progress);
    }
    if (req.body?.prUrl) {
      updates.pr_url = String(req.body.prUrl);
    }
    if (req.body?.branch) {
      updates.agent_branch = String(req.body.branch);
    }

    if (req.body?.log) {
      await taskWorkQueries.appendWorkLog(db, taskId, String(req.body.log));
    }

    if (req.body?.comment) {
      try {
        const commentId = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        // Agent replies are Markdown; TipTap UI expects HTML
        const cleaned = stripModelReasoning(String(req.body.comment));
        const htmlBody = markdownToHtml(cleaned || String(req.body.comment));
        await commentQueries.createComment(
          db,
          commentId,
          taskId,
          htmlBody,
          AGENT_MEMBER_ID,
          createdAt
        );
        const created = await commentQueries.getCommentById(db, commentId);
        const tenantId = getTenantId(req);
        await notificationService.publish(
          'comment-created',
          {
            taskId,
            comment: created,
            boardId: task.boardid || task.boardId,
            timestamp: new Date().toISOString()
          },
          tenantId
        );
        logCommentActivity(
          AGENT_USER_ID,
          COMMENT_ACTIONS.CREATE,
          commentId,
          taskId,
          'agent comment',
          { db, tenantId, commentContent: htmlBody }
        ).catch((err) => console.error('Agent comment activity log failed:', err));
      } catch (e) {
        console.error('Runner callback comment error:', e);
      }
    }

    const terminal = ['done', 'failed', 'stopped', 'cancelled'].includes(event);
    if (event === 'progress' || event === 'log') {
      // keep running
    } else if (event === 'done') {
      updates.status = 'done';
      updates.control = 'none';
    } else if (event === 'failed') {
      updates.status = 'failed';
      updates.control = 'none';
    } else if (event === 'stopped' || event === 'cancelled') {
      updates.status = 'stopped';
      updates.control = 'stop';
    } else if (req.body?.status) {
      updates.status = String(req.body.status);
    }

    if (terminal) {
      updates.callback_token = '';
      updates.waiting_for_slot = '';
    }

    if (Object.keys(updates).length) {
      await taskWorkQueries.upsertWorkEntries(db, taskId, updates);
    }

    await publishWork(req, taskId);

    if (terminal) {
      const tenantId = getTenantId(req);
      const prUrl =
        updates.pr_url ||
        req.body?.prUrl ||
        work.pr_url ||
        '';
      if (event === 'done') {
        logTaskActivity(
          AGENT_USER_ID,
          AGENT_ACTIONS.JOB_DONE,
          taskId,
          'agent job done',
          {
            db,
            tenantId,
            boardId: task.boardid || task.boardId,
            columnId: task.columnid || task.columnId,
            prUrl: prUrl || undefined
          }
        ).catch((err) => console.error('Agent done activity log failed:', err));
      } else if (event === 'failed') {
        logTaskActivity(
          AGENT_USER_ID,
          AGENT_ACTIONS.JOB_FAILED,
          taskId,
          'agent job failed',
          {
            db,
            tenantId,
            boardId: task.boardid || task.boardId,
            columnId: task.columnid || task.columnId
          }
        ).catch((err) => console.error('Agent failed activity log failed:', err));
      }
      setImmediate(() => {
        tryLaunchQueuedTasks(db, tenantId).catch((e) =>
          console.error('Dispatcher after callback failed:', e)
        );
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Runner callback error:', error);
    res.status(500).json({ error: 'Callback failed' });
  }
});

export default router;
