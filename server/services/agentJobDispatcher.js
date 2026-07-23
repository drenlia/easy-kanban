/**
 * Dispatch queued Agent tasks to the push runner (respecting tenant concurrency).
 */

import {
  tasks as taskQueries,
  taskWork as taskWorkQueries,
  settings as settingsQueries,
  comments as commentQueries,
  userGithubTokens as githubTokenQueries,
  userSshKeys as sshQueries
} from '../utils/sqlManager/index.js';
import { AGENT_MEMBER_ID, AGENT_USER_ID } from '../constants/agentIdentity.js';
import { decryptSecret } from '../utils/sshKeyCrypto.js';
import notificationService from './notificationService.js';
import {
  launchJob,
  getTenantMaxConcurrent,
  buildCallbackUrl,
  mintCallbackToken,
  mintJobId
} from './agentRunnerClient.js';

async function getSetting(db, key) {
  const row = await settingsQueries.getSettingByKey(db, key);
  return row?.value ?? '';
}

async function publishWork(db, tenantId, taskId) {
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
    tenantId
  );
  return work;
}

/**
 * Load the assigning user's GitHub PAT and/or SSH private key for the runner.
 */
async function loadUserGitCredentials(db, userId) {
  if (!userId) {
    return { githubToken: '', sshPrivateKey: '' };
  }
  let githubToken = '';
  let sshPrivateKey = '';
  try {
    const patRow = await githubTokenQueries.getGithubTokenEncrypted(db, userId);
    if (patRow?.token_encrypted) {
      githubToken = decryptSecret(patRow.token_encrypted);
    }
  } catch (err) {
    console.error('Failed to decrypt user GitHub token:', err?.message || err);
  }
  try {
    const sshRow = await sshQueries.getSshKeyWithPrivate(db, userId);
    if (sshRow?.private_key_encrypted) {
      sshPrivateKey = decryptSecret(sshRow.private_key_encrypted);
    }
  } catch (err) {
    console.error('Failed to decrypt user SSH key:', err?.message || err);
  }
  return { githubToken, sshPrivateKey };
}

/**
 * Try to launch queued Agent tasks until tenant concurrency is full.
 * @param {object} db
 * @param {string|null} tenantId
 * @param {{ siteUrl?: string, reqHost?: string, reqProtocol?: string }} [ctx]
 */
export async function tryLaunchQueuedTasks(db, tenantId, ctx = {}) {
  if ((await getSetting(db, 'AI_ENABLED')) !== 'true') {
    return { launched: 0, skipped: true };
  }

  const max = await getTenantMaxConcurrent(db);
  let running = await taskWorkQueries.countAgentTasksByStatus(db, 'running');
  if (running >= max) {
    return { launched: 0, atCapacity: true, running, max };
  }

  const pending = await taskWorkQueries.getPendingAgentTasks(db, ['queued']);
  let launched = 0;

  for (const row of pending) {
    if (running >= max) break;

    const result = await launchSingleTask(db, tenantId, row.id, ctx);
    if (result.launched) {
      launched += 1;
      running += 1;
    } else if (result.busy) {
      // Pool full — stop trying this tick
      break;
    }
  }

  return { launched, running, max };
}

/**
 * @param {object} db
 * @param {string|null} tenantId
 * @param {string} taskId
 * @param {object} [ctx]
 */
export async function launchSingleTask(db, tenantId, taskId, ctx = {}) {
  const work = await taskWorkQueries.getWorkMapByTaskId(db, taskId);
  if (work.status !== 'queued') {
    return { launched: false, reason: 'not_queued' };
  }

  const task =
    (await taskQueries.getTaskWithRelationships(db, taskId)) ||
    (await taskQueries.getTaskById(db, taskId));
  if (!task) {
    return { launched: false, reason: 'missing_task' };
  }
  const memberId = task.memberid || task.memberId;
  if (memberId !== AGENT_MEMBER_ID) {
    return { launched: false, reason: 'not_agent' };
  }

  const jobId = mintJobId();
  const callbackToken = mintCallbackToken();
  const siteUrl = ctx.siteUrl || (await getSetting(db, 'SITE_URL'));
  const callbackUrl = buildCallbackUrl({
    siteUrl,
    tenantId,
    reqHost: ctx.reqHost,
    reqProtocol: ctx.reqProtocol
  });

  const comments = Array.isArray(task.comments)
    ? task.comments.slice(-20).map((c) => ({
        text: c.text || c.content || '',
        author: c.author_name || c.authorName || c.name || '',
        createdAt: c.created_at || c.createdAt
      }))
    : [];

  // Load comments separately if not embedded
  let commentList = comments;
  if (!commentList.length) {
    try {
      const rows = await commentQueries.getCommentsForTask(db, taskId);
      if (Array.isArray(rows)) {
        commentList = rows.slice(-20).map((c) => ({
          text: c.text || '',
          author: c.authorName || c.author_name || c.name || '',
          createdAt: c.createdAt || c.created_at
        }));
      }
    } catch {
      /* optional */
    }
  }

  const ownerUserId = work.agent_owner_user_id || '';
  const { githubToken, sshPrivateKey } = await loadUserGitCredentials(db, ownerUserId);
  const mode = work.repo_url ? 'code' : 'assist';
  const tenantModel = (await getSetting(db, 'AI_MODEL')) || '';
  const taskModel = String(work.llm_model || '').trim();
  const effectiveModel = taskModel || tenantModel;

  const payload = {
    jobId,
    tenantId: tenantId || 'default',
    taskId,
    ticket: task.ticket || '',
    title: task.title || '',
    description: task.description || '',
    comments: commentList,
    repoUrl: work.repo_url || '',
    repoBranch: work.repo_branch || '',
    mode,
    ownerUserId,
    githubToken,
    sshPrivateKey,
    llm: {
      provider: await getSetting(db, 'AI_PROVIDER'),
      baseUrl: await getSetting(db, 'AI_API_BASE_URL'),
      apiKey: await getSetting(db, 'AI_API_KEY'),
      model: effectiveModel
    },
    limits: {
      tenantMaxConcurrent: await getTenantMaxConcurrent(db)
    },
    callbackUrl,
    callbackToken,
    agentUserId: AGENT_USER_ID,
    agentMemberId: AGENT_MEMBER_ID
  };

  if (!payload.llm.apiKey) {
    await taskWorkQueries.appendWorkLog(
      db,
      taskId,
      `[${new Date().toISOString()}] Launch skipped: AI_API_KEY not configured`
    );
    await publishWork(db, tenantId, taskId);
    return { launched: false, reason: 'no_llm_key' };
  }

  if (mode === 'code') {
    if (!ownerUserId) {
      await taskWorkQueries.appendWorkLog(
        db,
        taskId,
        `[${new Date().toISOString()}] Launch skipped: missing agent owner (re-assign the task to record who owns Git credentials)`
      );
      await publishWork(db, tenantId, taskId);
      return { launched: false, reason: 'no_owner' };
    }
    if (!githubToken && !sshPrivateKey) {
      await taskWorkQueries.appendWorkLog(
        db,
        taskId,
        `[${new Date().toISOString()}] Launch skipped: owner has no GitHub PAT or SSH key. Add one under Profile → Dev.`
      );
      await taskWorkQueries.upsertWorkEntries(db, taskId, {
        status: 'failed'
      });
      await publishWork(db, tenantId, taskId);
      return { launched: false, reason: 'no_git_creds' };
    }
    if (!githubToken && sshPrivateKey) {
      await taskWorkQueries.appendWorkLog(
        db,
        taskId,
        `[${new Date().toISOString()}] Using owner SSH key (no PAT — clone/push only; PR API needs a GitHub PAT)`
      );
    }
  }

  await taskWorkQueries.upsertWorkEntries(db, taskId, {
    callback_token: callbackToken,
    runner_job_id: jobId,
    launch_attempt_at: new Date().toISOString()
  });

  const launch = await launchJob(db, payload);
  if (!launch.ok) {
    await taskWorkQueries.upsertWorkEntries(db, taskId, {
      callback_token: '',
      runner_job_id: ''
    });
    await taskWorkQueries.appendWorkLog(
      db,
      taskId,
      `[${new Date().toISOString()}] Launch failed: ${launch.error}${launch.busy ? ' (pool busy)' : ''}`
    );
    if (launch.busy) {
      await taskWorkQueries.upsertWorkEntry(db, taskId, 'waiting_for_slot', 'true');
    }
    await publishWork(db, tenantId, taskId);
    return { launched: false, busy: Boolean(launch.busy), error: launch.error };
  }

  await taskWorkQueries.upsertWorkEntries(db, taskId, {
    status: 'running',
    control: 'none',
    claimed_by: 'push-runner',
    claimed_at: new Date().toISOString(),
    runner_job_id: launch.jobId || jobId,
    waiting_for_slot: ''
  });
  await taskWorkQueries.appendWorkLog(
    db,
    taskId,
    `[${new Date().toISOString()}] Launched on runner job ${launch.jobId || jobId} (mode=${mode}, model=${effectiveModel || '(none)'}${taskModel ? ', task override' : ''})`
  );
  await publishWork(db, tenantId, taskId);
  return { launched: true, jobId: launch.jobId || jobId };
}
