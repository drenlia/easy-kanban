/**
 * Permanent task/board purge: disk attachments + DB delete + storage usage.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { tasks as taskQueries, boards as boardQueries } from '../utils/sqlManager/index.js';
import { updateStorageUsage } from '../utils/storageUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function resolveAttachmentsDir(storagePaths) {
  if (storagePaths?.attachments) return storagePaths.attachments;
  const basePath =
    process.env.DOCKER_ENV === 'true' ? '/app/server' : path.join(__dirname, '..');
  return path.join(basePath, 'attachments');
}

function filenameFromAttachmentUrl(url) {
  if (!url) return null;
  return String(url)
    .replace('/attachments/', '')
    .replace('/api/files/attachments/', '')
    .replace(/^.*\//, '');
}

async function unlinkAttachmentUrls(urls, attachmentsDir) {
  for (const row of urls || []) {
    const filename = filenameFromAttachmentUrl(row.url);
    if (!filename) continue;
    const filePath = path.join(attachmentsDir, filename);
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (err?.code !== 'ENOENT') {
        console.error('Error deleting attachment file:', filePath, err.message);
      }
    }
  }
}

/**
 * Permanently purge one task (attachments on disk + DB row + snapshots).
 */
export async function purgeTaskCompletely(db, taskId, storagePaths = null) {
  const attachmentsDir = resolveAttachmentsDir(storagePaths);
  const urls = await taskQueries.getAllAttachmentUrlsForTask(db, taskId);
  await unlinkAttachmentUrls(urls, attachmentsDir);
  await taskQueries.markTaskSnapshotsDeleted(db, taskId);
  await taskQueries.deleteTask(db, taskId);
}

/**
 * Permanently purge a board after cleaning all task attachments.
 */
export async function purgeBoardCompletely(db, boardId, storagePaths = null) {
  const taskRows = await boardQueries.getAllTaskIdsForBoard(db, boardId);
  for (const row of taskRows) {
    const urls = await taskQueries.getAllAttachmentUrlsForTask(db, row.id);
    await unlinkAttachmentUrls(urls, resolveAttachmentsDir(storagePaths));
    await taskQueries.markTaskSnapshotsDeleted(db, row.id);
  }
  await boardQueries.deleteBoard(db, boardId);
  await updateStorageUsage(db);
}

/**
 * Purge one task and refresh storage usage.
 */
export async function purgeTaskCompletelyAndUpdateStorage(db, taskId, storagePaths = null) {
  await purgeTaskCompletely(db, taskId, storagePaths);
  await updateStorageUsage(db);
}
