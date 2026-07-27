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
import { tryLaunchQueuedTasks } from '../services/agentJobDispatcher.js';
import { cancelJob } from '../services/agentRunnerClient.js';

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

function dispatchCtx(req) {
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return { reqHost: host, reqProtocol: proto };
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

    const existing = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
    const isAdmin =
      req.user?.role === 'admin' ||
      (Array.isArray(req.user?.roles) && req.user.roles.includes('admin'));

    const entries = {};
    if (req.body?.repoUrl !== undefined) {
      // Empty string = assist-only (no code repo)
      entries.repo_url = String(req.body.repoUrl).trim();
    }
    if (req.body?.repoBranch !== undefined) {
      entries.repo_branch = String(req.body.repoBranch || '').trim();
    }
    if (req.body?.status !== undefined) {
      entries.status = String(req.body.status);
    }
    if (req.body?.agentMode !== undefined) {
      entries.agent_mode = String(req.body.agentMode || '').trim();
    }
    if (req.body?.automationScope !== undefined) {
      entries.automation_scope = String(req.body.automationScope || '').trim();
    }
    if (req.body?.automationBoardIds !== undefined) {
      const ids = Array.isArray(req.body.automationBoardIds)
        ? req.body.automationBoardIds
        : [];
      entries.automation_board_ids = JSON.stringify(ids.filter(Boolean));
    }
    if (req.body?.entries && typeof req.body.entries === 'object') {
      Object.assign(entries, req.body.entries);
    }

    // Per-task LLM model override — admins only (strip if sneaked via entries)
    if (!isAdmin) {
      delete entries.llm_model;
      // Non-admins cannot launch automation
      if (entries.agent_mode === 'automation') {
        return res.status(403).json({ error: 'Only admins can run Automation jobs' });
      }
    } else if (req.body?.llmModel !== undefined) {
      entries.llm_model = String(req.body.llmModel || '').trim();
    }

    if (entries.agent_mode === 'automation' && entries.status === 'queued') {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only admins can run Automation jobs' });
      }
      entries.repo_url = '';
      entries.repo_branch = '';
      if (!entries.automation_scope) {
        entries.automation_scope = 'this_board';
      }
    }

    // Only auto-queue when status is explicitly queued (initial assign).
    // Repo-only config updates must not relaunch the agent.
    if (entries.status === 'queued' && entries.control === undefined) {
      entries.control = 'none';
    }

    // Hard stop: cannot queue agent work without a real description
    if (entries.status === 'queued') {
      const plain = String(task.description || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!plain) {
        return res.status(400).json({
          error: 'Task description is required before assigning the agent'
        });
      }
    }

    // Bind coding/automation credentials to the assigning user (not admin/global PAT)
    if (entries.status === 'queued' && req.user?.id) {
      if (
        req.body?.repoUrl !== undefined ||
        req.body?.agentMode !== undefined ||
        !existing.agent_owner_user_id
      ) {
        entries.agent_owner_user_id = req.user.id;
      }
    }

    // Clear stale PR/branch outcomes when the linked repo changes
    const repoChanged =
      entries.repo_url !== undefined && entries.repo_url !== (existing.repo_url || '');
    if (repoChanged) {
      entries.pr_url = '';
      entries.agent_branch = '';
    }

    if (!Object.keys(entries).length) {
      return res.status(400).json({ error: 'No work entries provided' });
    }

    const isConfigOnly =
      entries.status === undefined &&
      (entries.repo_url !== undefined ||
        entries.repo_branch !== undefined ||
        entries.llm_model !== undefined);

    await taskWorkQueries.upsertWorkEntries(db, req.params.taskId, entries);

    if (isConfigOnly) {
      const repoLabel = entries.repo_url !== undefined
        ? (entries.repo_url || '(assist / no repo)')
        : existing.repo_url || '(unchanged)';
      const branchLabel =
        entries.repo_branch !== undefined
          ? entries.repo_branch || '(default)'
          : existing.repo_branch || '(unchanged)';
      const modelLabel =
        entries.llm_model !== undefined
          ? entries.llm_model || '(tenant default)'
          : existing.llm_model || '(unchanged)';
      await taskWorkQueries.appendWorkLog(
        db,
        req.params.taskId,
        `[${new Date().toISOString()}] User updated agent configuration: ${repoLabel} @ ${branchLabel}; model=${modelLabel}`
      );
    }

    let work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
    await publishWork(req, req.params.taskId, work);

    // Push-launch when newly queued
    if (work.status === 'queued') {
      const tenantId = getTenantId(req);
      try {
        await tryLaunchQueuedTasks(db, tenantId, dispatchCtx(req));
        work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
      } catch (e) {
        console.error('Agent dispatch after assign failed:', e);
      }
    }

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
    if (!['pause', 'stop', 'resume', 'none', 'apply'].includes(control)) {
      return res.status(400).json({
        error: 'control must be pause, stop, resume, apply, or none'
      });
    }

    const workBefore = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
    const updates = { control };

    if (control === 'apply') {
      const isAdmin =
        req.user?.role === 'admin' ||
        (Array.isArray(req.user?.roles) && req.user.roles.includes('admin'));
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only admins can apply automations' });
      }
      if (workBefore.awaiting_apply !== 'true' && workBefore.agent_mode === 'automation') {
        // Allow apply when waiting with pending plan
        if (!workBefore.automation_pending_plan) {
          return res.status(400).json({ error: 'No automation dry-run plan to apply' });
        }
      }
      updates.control = 'apply';
      // Keep status waiting/running so runner can pick up apply signal
      if (workBefore.status === 'waiting') {
        updates.status = 'waiting';
      }
    } else if (control === 'resume') {
      // Hard stop: cannot start/resume agent work without a real description
      const plain = String(task.description || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/p>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!plain) {
        return res.status(400).json({
          error: 'Task description is required before starting the agent'
        });
      }
      updates.status = 'queued';
      updates.control = 'resume';
      if (!workBefore.agent_owner_user_id && req.user?.id) {
        updates.agent_owner_user_id = req.user.id;
      }
      // Clear prior automation apply state for a fresh re-run
      if (workBefore.agent_mode === 'automation') {
        updates.awaiting_apply = '';
        updates.automation_pending_plan = '';
        updates.automation_plan_hash = '';
        updates.automation_apply_hash = '';
      }
    } else if (control === 'stop') {
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

    // Cancel remote job on pause/stop
    if (
      (control === 'pause' || control === 'stop') &&
      workBefore.runner_job_id
    ) {
      const cancel = await cancelJob(db, workBefore.runner_job_id, control);
      if (!cancel.ok && !cancel.missing) {
        await taskWorkQueries.appendWorkLog(
          db,
          req.params.taskId,
          `[${new Date().toISOString()}] Runner cancel warning: ${cancel.error}`
        );
      }
    }

    let work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
    await publishWork(req, req.params.taskId, work);

    if (control === 'resume') {
      const tenantId = getTenantId(req);
      try {
        await tryLaunchQueuedTasks(db, tenantId, dispatchCtx(req));
        work = await taskWorkQueries.getWorkMapByTaskId(db, req.params.taskId);
      } catch (e) {
        console.error('Agent dispatch after resume failed:', e);
      }
    }

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
