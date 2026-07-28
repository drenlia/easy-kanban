/**
 * Easy Kanban push agent runner — HTTP API.
 */

import express from 'express';
import {
  acceptJob,
  getJob,
  getStatus,
  requestCancel,
  updateJob
} from './jobQueue.js';
import { runAgentJob } from './agentLoop.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = parseInt(process.env.PORT || '8080', 10);
const RUNNER_TOKEN = String(process.env.RUNNER_TOKEN || '').trim();

function requireBearer(req, res, next) {
  if (!RUNNER_TOKEN) {
    return res.status(503).json({ error: 'RUNNER_TOKEN is not configured on the runner' });
  }
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || '';
  if (!token || token !== RUNNER_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'easy-kanban-runner' });
});

app.get('/v1/status', requireBearer, (_req, res) => {
  res.json(getStatus());
});

app.post('/v1/jobs', requireBearer, (req, res) => {
  const payload = req.body || {};
  if (!payload.jobId || !payload.taskId) {
    return res.status(400).json({ error: 'jobId and taskId are required' });
  }
  if (!payload.callbackUrl || !payload.callbackToken) {
    return res.status(400).json({ error: 'callbackUrl and callbackToken are required' });
  }

  const accepted = acceptJob(payload);
  if (!accepted.ok) {
    if (accepted.busy) {
      return res.status(429).json({ error: accepted.error });
    }
    return res.status(400).json({ error: accepted.error });
  }

  const job = accepted.job;
  setImmediate(() => {
    updateJob(job.jobId, { status: 'running' });
    runAgentJob(job).catch((err) => {
      console.error(`[runner] Unhandled job error ${job.jobId}:`, err);
    });
  });

  return res.status(202).json({
    jobId: job.jobId,
    status: 'accepted'
  });
});

app.get('/v1/jobs/:jobId', requireBearer, (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({
    jobId: job.jobId,
    taskId: job.taskId,
    tenantId: job.tenantId,
    status: job.status,
    progress: job.progress,
    error: job.error,
    result: job.result,
    startedAt: job.startedAt
  });
});

app.post('/v1/jobs/:jobId/cancel', requireBearer, (req, res) => {
  const result = requestCancel(req.params.jobId, req.body?.reason || 'cancelled');
  if (result.missing) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ ok: true, jobId: req.params.jobId });
});

if (!RUNNER_TOKEN) {
  console.warn('⚠️  RUNNER_TOKEN is empty — authenticated endpoints will return 503');
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Agent runner listening on :${PORT}`);
  console.log(`   MAX_CONCURRENT=${process.env.MAX_CONCURRENT || 1}`);
});
