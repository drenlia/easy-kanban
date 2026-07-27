/**
 * Install / refresh the canonical AI Agent bot avatar into the avatars directory.
 */

import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AGENT_USER_ID } from '../constants/agentIdentity.js';
import { wrapQuery } from './queryLogger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const AGENT_BOT_FILENAME = 'agent-bot.jpg';
export const AGENT_BOT_AVATAR_PATH = `/avatars/${AGENT_BOT_FILENAME}`;

function isMultiTenant() {
  return process.env.MULTI_TENANT === 'true';
}

function getAvatarsDir(tenantId = null) {
  if (tenantId && isMultiTenant()) {
    const basePath =
      process.env.DOCKER_ENV === 'true' ? '/app/server' : join(__dirname, '..', '..');
    return join(basePath, 'avatars', 'tenants', tenantId);
  }
  return join(__dirname, '..', 'avatars');
}

function getBundledBotSource() {
  const candidates = [
    join(__dirname, '..', 'assets', AGENT_BOT_FILENAME),
    join(__dirname, '..', '..', 'public', AGENT_BOT_FILENAME)
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/**
 * Copy shipped bot art into avatars dir (and tenant dir when provided).
 * @returns {string|null} Public avatar path `/avatars/agent-bot.jpg` or null
 */
export function ensureAgentBotAvatarFile(tenantId = null) {
  const src = getBundledBotSource();
  if (!src) {
    console.warn('⚠️ Agent bot avatar asset missing (server/assets/agent-bot.jpg)');
    return null;
  }
  const avatarsDir = getAvatarsDir(tenantId);
  if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
  }
  const dest = join(avatarsDir, AGENT_BOT_FILENAME);
  try {
    fs.copyFileSync(src, dest);
  } catch (e) {
    console.warn('⚠️ Failed to install agent bot avatar:', e?.message || e);
    return null;
  }
  return AGENT_BOT_AVATAR_PATH;
}

/**
 * Point agent@local at the shipped bot avatar (idempotent).
 */
export async function syncAgentUserAvatar(db, tenantId = null) {
  const path = ensureAgentBotAvatarFile(tenantId);
  if (!path) return null;
  await wrapQuery(
    db.prepare('UPDATE users SET avatar_path = $1 WHERE id = $2'),
    'UPDATE'
  ).run(path, AGENT_USER_ID);
  return path;
}
