/**
 * User-facing task_work APIs (control, repo binding, status reads).
 * Mounted under /api/tasks
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getRequestDatabase, getTenantId } from '../middleware/tenantRouting.js';
import { isAiEnabled } from '../utils/aiEnabled.js';
import {
  tasks as taskQueries,
  taskWork as taskWorkQueries
} from '../utils/sqlManager/index.js';
import { AGENT_MEMBER_ID } from '../constants/agentIdentity.js';
import notificationService from '../services/notificationService.js';

const router = express.Router();

async function publishWork(req, taskId, work) {
  const db = getRequestDatabase(req);
  const task = await taskQueries.getTaskById(db, taskId);
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
}

router.get('/:taskId/work', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
    res.json({ work });
  } catch (error) {
    console.error('Get task work error:', error);
    res.status(500).json({ error: 'Failed to get task work' });
  }
});

/**
 * Bind repo / initialize agent work when assigning to Agent.
 * Body: { repoUrl, repoBranch?, status? }
 */
router.put('/:taskId/work', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!(await isAiEnabled(db))) {
      return res.status(403).json({ error: 'AI features are disabled for this instance' });
    }

    const task = await taskQueries.getTaskById(db, req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const entries = {};
    if (req.body?.repoUrl !== undefined) {
      const url = String(req.body.repoUrl).trim();
      if (!url) {
        return res.status(400).json({ error: 'repoUrl is required' });
      }
      entries.repo_url = url;
    }
    if (req.body?.repoBranch !== undefined) {
      entries.repo_branch = String(req.body.repoBranch || '').trim();
    }
    if (req.body?.status !== undefined) {
      entries.status = String(req.body.status);
    }
    if (req.body?.entries && typeof req.body.entries === 'object') {
      Object.assign(entries, req.body.entries);
    }

    // Convenience: assigning agent work defaults
    if (entries.repo_url && !entries.status) {
      entries.status = 'queued';
      entries.control = 'none';
    }

    if (!Object.keys(entries).length) {
      return res.status(400).json({ error: 'No work entries provided' });
    }

    await taskWorkQueries.upsertWorkEntries(db, req.params.taskId, entries);
    const work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
    await publishWork(req, req.params.taskId, work);
    res.json({ work });
  } catch (error) {
    console.error('Put task work error:', error);
    res.status(500).json({ error: 'Failed to update task work' });
  }
});

/**
 * User control: pause | stop | resume | none
 * Resume from waiting/paused/stopped → sets control=resume and status=queued
 */
router.put('/:taskId/work/control', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!(await isAiEnabled(db))) {
      return res.status(403).json({ error: 'AI features are disabled for this instance' });
    }

    const task = await taskQueries.getTaskById(db, req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const memberId = task.memberid || task.memberId;
    if (memberId !== AGENT_MEMBER_ID) {
      return res.status(400).json({ error: 'Task is not assigned to the Agent' });
    }

    const control = String(req.body?.control || '').toLowerCase();
    if (!['pause', 'stop', 'resume', 'none'].includes(control)) {
      return res.status(400).json({ error: 'control must be pause, stop, resume, or none' });
    }

    const workBefore = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
    const updates = { control };

    if (control === 'resume') {
      // Re-queue so the runner can claim again (covers waiting / paused / stopped)
      updates.status = 'queued';
      updates.control = 'resume';
    } else if (control === 'stop') {
      // Cooperative stop: set control; also set status stopped immediately for UI
      updates.status = 'stopped';
      updates.control = 'stop';
    } else if (control === 'pause') {
      updates.control = 'pause';
      if (workBefore.status === 'running' || workBefore.status === 'queued') {
        updates.status = 'paused';
      }
    }

    await taskWorkQueries.upsertWorkEntries(db, req.params.taskId, updates);
    await taskWorkQueries.appendWorkLog(
      db,
      req.params.taskId,
      `[${new Date().toISOString()}] User control: ${control}`
    );

    const work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
    await publishWork(req, req.params.taskId, work);
    res.json({ work });
  } catch (error) {
    console.error('Task work control error:', error);
    res.status(500).json({ error: 'Failed to update control' });
  }
});

/**
 * Batch-fetch work maps for many tasks (board UI).
 * Body: { taskIds: string[] }
 * Path avoids clashing with /:taskId routes on the tasks router.
 */
router.post('/work-maps', authenticateToken, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    const taskIds = Array.isArray(req.body?.taskIds) ? req.body.taskIds.slice(0, 500) : [];
    const result = {};
    for (const taskId of taskIds) {
      result[taskId] = await taskWorkQueries.getWorkMapByTaskId(db, taskId);
    }
    res.json({ workByTaskId: result });
  } catch (error) {
    console.error('Batch task work error:', error);
    res.status(500).json({ error: 'Failed to load task work' });
  }
});

export default router;
