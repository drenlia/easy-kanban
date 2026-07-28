/**
 * Git helpers for the coding agent.
 * Auth prefers the assigning user's GitHub PAT (HTTPS); falls back to their SSH key.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

export function workspacePath(tenantId, jobId) {
  const safeTenant = String(tenantId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeJob = String(jobId || 'job').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join('/tmp/jobs', safeTenant, safeJob);
}

function authRepoUrl(repoUrl, token) {
  if (!token) return repoUrl;
  try {
    const u = new URL(repoUrl);
    if (u.hostname === 'github.com' || u.hostname.endsWith('.github.com')) {
      u.username = 'x-access-token';
      u.password = token;
      return u.toString();
    }
  } catch {
    /* keep original */
  }
  return repoUrl;
}

/** Convert https://github.com/org/repo(.git) → git@github.com:org/repo.git */
export function toSshGithubUrl(repoUrl) {
  try {
    if (/^git@github\.com:/i.test(repoUrl)) {
      return repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;
    }
    const u = new URL(repoUrl);
    if (u.hostname === 'github.com' || u.hostname.endsWith('.github.com')) {
      const parts = u.pathname.replace(/^\/+/, '').replace(/\.git$/, '').split('/');
      if (parts[0] && parts[1]) {
        return `git@github.com:${parts[0]}/${parts[1]}.git`;
      }
    }
  } catch {
    /* ignore */
  }
  return repoUrl;
}

async function run(cwd, args, opts = {}) {
  const { stdout, stderr } = await execFileAsync('git', args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      ...(opts.env || {})
    }
  });
  return { stdout: stdout?.toString() || '', stderr: stderr?.toString() || '' };
}

async function withSshKey(privateKey, fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ek-ssh-'));
  const keyPath = path.join(dir, 'id_ed25519');
  try {
    await fs.writeFile(keyPath, privateKey.endsWith('\n') ? privateKey : `${privateKey}\n`, {
      mode: 0o600
    });
    const gitSsh = `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=${path.join(dir, 'known_hosts')}`;
    return await fn({ GIT_SSH_COMMAND: gitSsh });
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Clone repo into workspace (shallow).
 * @param {{ repoUrl: string, branch?: string, token?: string, sshPrivateKey?: string, workDir: string }} opts
 */
export async function cloneRepo({ repoUrl, branch, token, sshPrivateKey, workDir }) {
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });

  const args = ['clone', '--depth', '50'];
  if (branch) {
    args.push('--branch', branch);
  }

  const runClone = async (url, envExtra = {}) => {
    await execFileAsync('git', [...args, url, workDir], {
      maxBuffer: 20 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...envExtra }
    });
  };

  try {
    if (token) {
      await runClone(authRepoUrl(repoUrl, token));
    } else if (sshPrivateKey) {
      const sshUrl = toSshGithubUrl(repoUrl);
      await withSshKey(sshPrivateKey, (env) => runClone(sshUrl, env));
    } else {
      await runClone(repoUrl);
    }
  } catch (err) {
    const detail = `${err?.stderr || err?.message || err}`.trim();
    if (/could not read Username|Authentication failed|Permission denied|403|401/i.test(detail)) {
      throw new Error(
        `Git clone failed (auth). The assigning user needs a GitHub PAT or SSH key under Profile → Dev. Details: ${detail.slice(0, 300)}`
      );
    }
    throw err;
  }

  await run(workDir, ['config', 'user.email', 'agent@easy-kanban.local']);
  await run(workDir, ['config', 'user.name', 'Easy Kanban Agent']);
}

export async function createBranch(workDir, branchName) {
  await run(workDir, ['checkout', '-B', branchName]);
}

export async function commitAll(workDir, message) {
  await run(workDir, ['add', '-A']);
  try {
    await run(workDir, ['diff', '--cached', '--quiet']);
    return { committed: false };
  } catch {
    // diff --quiet exits 1 when there are changes
  }
  await run(workDir, ['commit', '-m', message]);
  return { committed: true };
}

export async function pushBranch(workDir, branchName, { token, sshPrivateKey, repoUrl }) {
  if (token) {
    const url = authRepoUrl(repoUrl, token);
    await run(workDir, ['push', '-u', url, `HEAD:${branchName}`, '--force-with-lease']);
    return;
  }
  if (sshPrivateKey) {
    const sshUrl = toSshGithubUrl(repoUrl);
    await withSshKey(sshPrivateKey, (env) =>
      run(workDir, ['push', '-u', sshUrl, `HEAD:${branchName}`, '--force-with-lease'], { env })
    );
    return;
  }
  throw new Error('No GitHub credentials to push');
}

/**
 * Open a GitHub PR via API when a PAT is available.
 */
export async function openPullRequest({ repoUrl, token, head, base, title, body }) {
  if (!token) return null;
  let owner;
  let repo;
  try {
    const u = new URL(repoUrl.replace(/\.git$/, ''));
    const parts = u.pathname.replace(/^\/+/, '').split('/');
    owner = parts[0];
    repo = parts[1];
  } catch {
    return null;
  }
  if (!owner || !repo) return null;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'easy-kanban-runner'
    },
    body: JSON.stringify({
      title,
      head,
      base: base || 'main',
      body: body || ''
    })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`[runner] PR create failed: ${res.status} ${text.slice(0, 200)}`);
    return null;
  }
  const data = await res.json();
  return data.html_url || null;
}

export async function cleanupWorkspace(workDir) {
  try {
    await fs.rm(workDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
