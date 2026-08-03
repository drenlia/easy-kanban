/**
 * Delete local/S3 avatar objects when no longer referenced.
 */

import { wrapQuery } from './queryLogger.js';
import {
  deleteObject,
  filenameFromPublicUrl
} from '../services/storage/index.js';
import { AGENT_BOT_FILENAME } from './agentBotAvatar.js';

/**
 * @param {string|null|undefined} avatarPath - e.g. `/avatars/default-user-….svg`
 * @returns {string|null}
 */
export function avatarFilenameFromPath(avatarPath) {
  if (!avatarPath || typeof avatarPath !== 'string') return null;
  if (/^https?:\/\//i.test(avatarPath)) return null;
  return filenameFromPublicUrl(avatarPath, 'avatars');
}

/**
 * True if any user or site logo setting still points at this avatar file.
 * @param {*} db
 * @param {string} filename
 */
async function avatarStillReferenced(db, filename) {
  if (!filename) return true;

  const userRef = await wrapQuery(
    db.prepare(
      `SELECT 1 AS ok FROM users
       WHERE avatar_path IS NOT NULL
         AND avatar_path <> ''
         AND avatar_path NOT LIKE 'http%'
         AND (
           avatar_path = $1
           OR avatar_path LIKE $2
         )
       LIMIT 1`
    ),
    'SELECT'
  ).get(`/avatars/${filename}`, `%/${filename}`);

  if (userRef) return true;

  const logoRef = await wrapQuery(
    db.prepare(
      `SELECT 1 AS ok FROM settings
       WHERE key IN ('SITE_LOGO', 'SITE_LOGO_DARK')
         AND value IS NOT NULL
         AND value <> ''
         AND (
           value = $1
           OR value LIKE $2
         )
       LIMIT 1`
    ),
    'SELECT'
  ).get(`/avatars/${filename}`, `%/${filename}`);

  return Boolean(logoRef);
}

/**
 * Remove an avatar file from storage if nothing references it anymore.
 * Safe to call after user delete or avatar clear/replace.
 *
 * @param {*} db
 * @param {{ avatars?: string, attachments?: string }} storagePaths
 * @param {string|null|undefined} avatarPath
 */
export async function deleteAvatarFileIfUnused(db, storagePaths, avatarPath) {
  const filename = avatarFilenameFromPath(avatarPath);
  if (!filename) return;
  if (filename === AGENT_BOT_FILENAME) return;

  try {
    if (await avatarStillReferenced(db, filename)) {
      return;
    }
    await deleteObject(db, storagePaths, 'avatars', filename);
    console.log(`🗑️ Removed unused avatar file: ${filename}`);
  } catch (error) {
    console.error(`⚠️ Failed to remove avatar file ${filename}:`, error.message || error);
  }
}
