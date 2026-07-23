/**
 * Authenticated callbacks to Easy Kanban.
 */

function redact(text) {
  return String(text || '')
    .replace(/sk-[a-zA-Z0-9_-]{10,}/g, 'sk-***')
    .replace(/ghp_[a-zA-Z0-9]{10,}/g, 'ghp_***')
    .replace(/github_pat_[a-zA-Z0-9_]{10,}/g, 'github_pat_***');
}

/**
 * @param {object} job
 * @param {{ event: string, progress?: number|string, log?: string, comment?: string, status?: string, prUrl?: string, branch?: string }} body
 */
export async function sendCallback(job, body) {
  const url = job.payload?.callbackUrl;
  const token = job.payload?.callbackToken;
  if (!url || !token) {
    console.warn(`[runner] No callback configured for job ${job.jobId}`);
    return { ok: false, error: 'no callback' };
  }

  const payload = {
    jobId: job.jobId,
    taskId: job.taskId,
    event: body.event,
    progress: body.progress,
    log: body.log ? redact(body.log) : undefined,
    comment: body.comment ? redact(body.comment) : undefined,
    status: body.status,
    prUrl: body.prUrl,
    branch: body.branch
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Agent-Callback-Token': token
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[runner] Callback failed HTTP ${res.status}: ${text.slice(0, 200)}`
      );
      return { ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[runner] Callback error:`, err?.message || err);
    return { ok: false, error: err?.message || String(err) };
  }
}
