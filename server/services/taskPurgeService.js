/**
 * Permanent task/board purge: storage attachments + DB delete + storage usage.
 */
import { tasks as taskQueries, boards as boardQueries } from '../utils/sqlManager/index.js';
import { updateStorageUsage } from '../utils/storageUtils.js';
import { deleteObject, filenameFromPublicUrl } from './storage/index.js';

async function unlinkAttachmentUrls(db, urls, storagePaths) {
  for (const row of urls || []) {
    const filename = filenameFromPublicUrl(row.url, 'attachments');
    if (!filename) continue;
    try {
      await deleteObject(db, storagePaths, 'attachments', filename);
    } catch (err) {
      console.error('Error deleting attachment file:', filename, err.message);
    }
  }
}

/**
 * Permanently purge one task (attachments + DB row + snapshots).
 */
export async function purgeTaskCompletely(db, taskId, storagePaths = null) {
  const urls = await taskQueries.getAllAttachmentUrlsForTask(db, taskId);
  await unlinkAttachmentUrls(db, urls, storagePaths);
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
    await unlinkAttachmentUrls(db, urls, storagePaths);
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

/** @deprecated kept for callers that imported resolveAttachmentsDir */
export function resolveAttachmentsDir(storagePaths) {
  if (storagePaths?.attachments) return storagePaths.attachments;
  return null;
}
