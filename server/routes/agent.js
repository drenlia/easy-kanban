/**
 * Agent automation API — JWT or PAT auth, gated by AI_ENABLED.
 * External runners claim Agent-assigned tasks and update task_work.
 */

import express from 'express';
import crypto from 'crypto';
import { authenticateToken } from '../middleware/auth.js';
import { getRequestDatabase, getTenantId } from '../middleware/tenantRouting.js';
import { requireAiEnabledMiddleware } from '../utils/aiEnabled.js';
import {
  tasks as taskQueries,
  taskWork as taskWorkQueries,
  comments as commentQueries
} from '../utils/sqlManager/index.js';
import { AGENT_MEMBER_ID, AGENT_USER_ID } from '../constants/agentIdentity.js';
import { COMMENT_ACTIONS } from '../constants/activityActions.js';
import { logCommentActivity } from '../services/activityLogger.js';
import notificationService from '../services/notificationService.js';
import { agentClaimLimiter } from '../middleware/rateLimiters.js';
import { updateStorageUsage } from '../utils/storageUtils.js';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();
const requireAi = requireAiEnabledMiddleware(getRequestDatabase);

router.use(authenticateToken, requireAi);

async function publishTaskWork(req, taskId, work) {
  const tenantId = getTenantId(req);
  const task = await taskQueries.getTaskById(dbOr(req), taskId);
  await notificationService.publish(
    'task-work-updated',
    {
      taskId,
      boardId: task?.boardid || task?.boardId,
      work,
      timestamp: new Date().toISOString()
    },
    tenantId
  );
}

function dbOr(req) {
  return getRequestDatabase(req);
}

async function ensureAgentTask(db, taskId) {
  const task = await taskQueries.getTaskById(db, taskId);
  if (!task) return { error: 'Task not found', status: 404 };
  const memberId = task.memberid || task.memberId;
  if (memberId !== AGENT_MEMBER_ID) {
    return { error: 'Task is not assigned to the Agent', status: 400 };
  }
  return { task };
}

// Pending / claimable tasks
router.get('/tasks/pending', async (req, res) => {
  try {
    const db = dbOr(req);
    const rows = await taskWorkQueries.getPendingAgentTasks(db, ['queued']);
    const tasks = [];
    for (const row of rows) {
      const work = await taskWorkQueries.getWorkMapByTaskId(db, row.id);
      tasks.push({
        id: row.id,
        title: row.title,
        ticket: row.ticket,
        boardId: row.boardid,
        columnId: row.columnid,
        priority: row.priority,
        work
      });
    }
    res.json({ tasks });
  } catch (error) {
    console.error('Agent pending tasks error:', error);
    res.status(500).json({ error: 'Failed to list pending agent tasks' });
  }
});

router.post('/tasks/:id/claim', agentClaimLimiter, async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const claimedBy =
      req.body?.runnerId ||
      req.user.tokenId ||
      req.user.id;

    const work = await taskWorkQueries.claimAgentTask(db, req.params.id, String(claimedBy));
    if (!work) {
      return res.status(409).json({ error: 'Task is not available to claim (not queued)' });
    }

    await publishTaskWork(req, req.params.id, work);
    res.json({ taskId: req.params.id, work });
  } catch (error) {
    console.error('Agent claim error:', error);
    res.status(500).json({ error: 'Failed to claim task' });
  }
});

router.get('/tasks/:id', async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const full = await taskQueries.getTaskWithRelationships(db, req.params.id);
    const work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.id);
    const attachments = await wrapQuery(
      db.prepare(
        'SELECT id, name, url, type, size, created_at FROM attachments WHERE taskid = $1 AND commentid IS NULL'
      ),
      'SELECT'
    ).all(req.params.id);

    res.json({
      task: full || check.task,
      work,
      attachments
    });
  } catch (error) {
    console.error('Agent get task error:', error);
    res.status(500).json({ error: 'Failed to get task' });
  }
});

router.post('/tasks/:id/move', async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const { columnId, position } = req.body || {};
    if (!columnId) {
      return res.status(400).json({ error: 'columnId is required' });
    }

    const targetPosition = typeof position === 'number' ? position : 0;
    await taskQueries.updateTaskPositionAndColumn(
      db,
      req.params.id,
      targetPosition,
      columnId,
      check.task.boardid || check.task.boardId,
      check.task.columnid || check.task.columnId
    );

    const updated = await taskQueries.getTaskById(db, req.params.id);
    const tenantId = getTenantId(req);
    await notificationService.publish(
      'task-updated',
      {
        boardId: updated.boardid,
        task: {
          id: updated.id,
          columnId: updated.columnid,
          position: updated.position,
          boardId: updated.boardid
        },
        timestamp: new Date().toISOString()
      },
      tenantId
    );

    res.json({ task: updated });
  } catch (error) {
    console.error('Agent move error:', error);
    res.status(500).json({ error: 'Failed to move task' });
  }
});

router.post('/tasks/:id/comments', async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const text = (req.body?.text || '').toString().trim();
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const commentId = req.body?.id || crypto.randomUUID();
    const createdAt = new Date().toISOString();

    await db.executeBatchTransaction([
      {
        query: `
          INSERT INTO comments (id, taskid, text, authorid, createdat)
          VALUES (?, ?, ?, ?, ?)
        `,
        params: [commentId, req.params.id, text, AGENT_MEMBER_ID, createdAt]
      }
    ]);

    const created = await commentQueries.getCommentById(db, commentId);
    const tenantId = getTenantId(req);
    await notificationService.publish(
      'comment-created',
      {
        comment: created,
        taskId: req.params.id,
        boardId: check.task.boardid,
        timestamp: createdAt
      },
      tenantId
    );

    logCommentActivity(
      AGENT_USER_ID,
      COMMENT_ACTIONS.CREATE,
      commentId,
      req.params.id,
      'agent comment',
      { db, tenantId, commentContent: text }
    ).catch((err) => console.error('Agent comment activity log failed:', err));

    // Optional: mark waiting when agent asks a question
    if (req.body?.markWaiting === true) {
      await taskWorkQueries.upsertWorkEntries(db, req.params.id, {
        status: 'waiting',
        control: 'none'
      });
      await taskWorkQueries.appendWorkLog(
        db,
        req.params.id,
        `[${createdAt}] Agent waiting for user input (comment)`
      );
      const work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.id);
      await publishTaskWork(req, req.params.id, work);
    }

    res.status(201).json({ comment: created });
  } catch (error) {
    console.error('Agent comment error:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

router.post('/tasks/:id/attachments', async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const attachments = req.body?.attachments;
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return res.status(400).json({ error: 'attachments array is required' });
    }

    const batchQueries = [];
    const insertQuery = `
      INSERT INTO attachments (id, taskid, name, url, type, size)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    for (const attachment of attachments) {
      batchQueries.push({
        query: insertQuery,
        params: [
          attachment.id || crypto.randomUUID(),
          req.params.id,
          attachment.name,
          attachment.url,
          attachment.type,
          attachment.size || 0
        ]
      });
    }
    await db.executeBatchTransaction(batchQueries);
    await updateStorageUsage(db);

    res.status(201).json({ success: true, count: attachments.length });
  } catch (error) {
    console.error('Agent attachments error:', error);
    res.status(500).json({ error: 'Failed to add attachments' });
  }
});

router.patch('/tasks/:id', async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });

    if (req.body?.title !== undefined || req.body?.description !== undefined) {
      return res.status(403).json({
        error: 'Agents must not change title or description; use comments instead'
      });
    }

    const allowed = {};
    for (const key of [
      'priority',
      'priorityId',
      'priority_id',
      'effort',
      'startDate',
      'dueDate',
      'startdate',
      'duedate',
      'columnId',
      'columnid',
      'sprintId',
      'sprint_id'
    ]) {
      if (req.body?.[key] !== undefined) {
        allowed[key] = req.body[key];
      }
    }

    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ error: 'No allowed fields to update' });
    }

    await taskQueries.updateTask(db, req.params.id, allowed);
    const updated = await taskQueries.getTaskById(db, req.params.id);
    const tenantId = getTenantId(req);
    await notificationService.publish(
      'task-updated',
      {
        boardId: updated.boardid,
        task: { id: updated.id, ...allowed },
        timestamp: new Date().toISOString()
      },
      tenantId
    );
    res.json({ task: updated });
  } catch (error) {
    console.error('Agent patch task error:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

router.get('/tasks/:id/work', async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.id);
    res.json({ work });
  } catch (error) {
    console.error('Agent get work error:', error);
    res.status(500).json({ error: 'Failed to get task work' });
  }
});

router.put('/tasks/:id/work', async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });

    const entries = req.body?.entries || req.body || {};
    if (typeof entries !== 'object' || Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries object required' });
    }

    const { appendLog, ...rest } = entries;
    const toUpsert = { ...rest };
    // Never allow arbitrary overwrite of reserved structure via empty body
    delete toUpsert.appendLog;

    if (Object.keys(toUpsert).length) {
      await taskWorkQueries.upsertWorkEntries(db, req.params.id, toUpsert);
    }
    if (typeof appendLog === 'string' && appendLog.trim()) {
      await taskWorkQueries.appendWorkLog(db, req.params.id, appendLog.trim());
    }

    const work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.id);
    await publishTaskWork(req, req.params.id, work);
    res.json({ work });
  } catch (error) {
    console.error('Agent put work error:', error);
    res.status(500).json({ error: 'Failed to update task work' });
  }
});

router.get('/control/:id', async (req, res) => {
  try {
    const db = dbOr(req);
    const check = await ensureAgentTask(db, req.params.id);
    if (check.error) return res.status(check.status).json({ error: check.error });
    const work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.id);
    res.json({
      status: work.status || null,
      control: work.control || 'none'
    });
  } catch (error) {
    console.error('Agent control poll error:', error);
    res.status(500).json({ error: 'Failed to get control state' });
  }
});

export default router;
