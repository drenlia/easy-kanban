/**
 * Parse GitHub repo URLs and probe access via the GitHub REST API (PAT).
 * No runner / git / SSH — app-side connectivity check for branch suggestions.
 */

import axios from 'axios';

const MAX_BRANCHES = 200;

/**
 * @param {string} raw
 * @returns {{ owner: string, repo: string } | null}
 */
export function parseGithubRepoUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;

  // git@github.com:owner/repo.git
  const ssh = s.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (ssh) {
    return { owner: ssh[1], repo: ssh[2] };
  }

  // https://github.com/owner/repo(.git)?(/...)?
  let url;
  try {
    url = new URL(s.includes('://') ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/^github\.com$/i.test(url.hostname)) {
    return null;
  }
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const repo = parts[1].replace(/\.git$/i, '');
  if (!repo) return null;
  return { owner: parts[0], repo };
}

function mapGithubError(status, reason) {
  if (status === 401) {
    return 'GitHub token is invalid or expired. Update it under Profile → Dev.';
  }
  if (status === 403) {
    return 'GitHub denied access. Check PAT scopes (Contents: Read) for this repository.';
  }
  if (status === 404) {
    return 'Repository not found or your PAT cannot access it.';
  }
  return reason || `GitHub API error (${status || 'unknown'})`;
}

/**
 * @param {string} githubToken
 * @param {string} repoUrl
 * @returns {Promise<{
 *   ok: boolean,
 *   reason?: string,
 *   authMethod?: 'pat',
 *   defaultBranch?: string,
 *   branches?: string[],
 *   error?: string,
 *   httpStatus?: number
 * }>}
 */
export async function probeGithubRepoWithPat(githubToken, repoUrl) {
  const parsed = parseGithubRepoUrl(repoUrl);
  if (!parsed) {
    return {
      ok: false,
      reason: 'invalid_url',
      error: 'Enter a GitHub repository URL (https://github.com/org/repo or git@github.com:org/repo.git).'
    };
  }

  if (!githubToken) {
    return { ok: false, reason: 'no_pat' };
  }

  const { owner, repo } = parsed;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'easy-kanban'
  };

  try {
    const repoRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
      timeout: 15000,
      validateStatus: () => true
    });

    if (repoRes.status !== 200) {
      return {
        ok: false,
        reason: 'github_error',
        authMethod: 'pat',
        httpStatus: repoRes.status,
        error: mapGithubError(repoRes.status, repoRes.data?.message)
      };
    }

    const defaultBranch = repoRes.data?.default_branch || 'main';
    const branches = [];
    let page = 1;

    while (branches.length < MAX_BRANCHES) {
      const branchRes = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/branches`,
        {
          headers,
          params: { per_page: 100, page },
          timeout: 15000,
          validateStatus: () => true
        }
      );

      if (branchRes.status !== 200) {
        // Repo accessible but branches failed — still treat as connected with default
        return {
          ok: true,
          authMethod: 'pat',
          defaultBranch,
          branches: defaultBranch ? [defaultBranch] : [],
          error: mapGithubError(branchRes.status, branchRes.data?.message)
        };
      }

      const batch = Array.isArray(branchRes.data) ? branchRes.data : [];
      for (const b of batch) {
        if (b?.name && !branches.includes(b.name)) {
          branches.push(b.name);
        }
        if (branches.length >= MAX_BRANCHES) break;
      }
      if (batch.length < 100) break;
      page += 1;
      if (page > 5) break;
    }

    if (defaultBranch && !branches.includes(defaultBranch)) {
      branches.unshift(defaultBranch);
    }

    return {
      ok: true,
      authMethod: 'pat',
      defaultBranch,
      branches
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'network_error',
      authMethod: 'pat',
      error: err?.message || 'Failed to reach GitHub'
    };
  }
}
