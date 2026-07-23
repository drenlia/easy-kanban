/**
 * In-memory job registry with pool concurrency gate.
 */

const jobs = new Map();

export function getMaxConcurrent() {
  const n = parseInt(String(process.env.MAX_CONCURRENT || '1'), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 20);
}

export function countRunning() {
  let n = 0;
  for (const job of jobs.values()) {
    if (job.status === 'running' || job.status === 'starting') n += 1;
  }
  return n;
}

export function getStatus() {
  return {
    running: countRunning(),
    maxConcurrent: getMaxConcurrent(),
    jobs: [...jobs.values()].map((j) => ({
      jobId: j.jobId,
      taskId: j.taskId,
      tenantId: j.tenantId,
      status: j.status,
      progress: j.progress,
      startedAt: j.startedAt
    }))
  };
}

export function getJob(jobId) {
  return jobs.get(jobId) || null;
}

/**
 * @returns {{ ok: true, job: object } | { ok: false, busy?: boolean, error: string }}
 */
export function acceptJob(payload) {
  const max = getMaxConcurrent();
  if (countRunning() >= max) {
    return { ok: false, busy: true, error: `Runner at capacity (${max})` };
  }
  const jobId = payload.jobId;
  if (!jobId) {
    return { ok: false, error: 'jobId is required' };
  }
  if (jobs.has(jobId)) {
    return { ok: false, error: 'jobId already exists' };
  }

  const job = {
    jobId,
    taskId: payload.taskId,
    tenantId: payload.tenantId || 'default',
    status: 'starting',
    progress: 0,
    startedAt: new Date().toISOString(),
    cancelRequested: false,
    payload,
    error: null,
    result: null
  };
  jobs.set(jobId, job);
  return { ok: true, job };
}

export function requestCancel(jobId, reason = 'cancelled') {
  const job = jobs.get(jobId);
  if (!job) return { ok: false, missing: true };
  job.cancelRequested = true;
  job.cancelReason = reason;
  if (job.status === 'starting') {
    job.status = 'cancelled';
  }
  return { ok: true, job };
}

export function updateJob(jobId, patch) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, patch);
  return job;
}

export function removeJob(jobId) {
  jobs.delete(jobId);
}
