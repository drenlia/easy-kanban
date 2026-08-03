/**
 * Lifecycle retention: permanent purge of aged soft-deleted and archived-column tasks.
 */
import { tasks as taskQueries, boards as boardQueries, settings as settingsQueries } from '../utils/sqlManager/index.js';
import {
  purgeTaskCompletelyAndUpdateStorage,
  purgeBoardCompletely,
} from '../services/taskPurgeService.js';
import { parseRetentionDays } from '../utils/retentionSettings.js';

/**
 * @param {object} db - tenant database
 * @param {object|null} storagePaths
 */
export async function runLifecycleRetentionForDb(db, storagePaths = null) {
  const deletedSetting = await settingsQueries.getSettingByKey(db, 'LIFECYCLE_DELETED_RETENTION_DAYS');
  const archivedSetting = await settingsQueries.getSettingByKey(db, 'LIFECYCLE_ARCHIVED_RETENTION_DAYS');
  const deletedDays = parseRetentionDays(deletedSetting?.value);
  const archivedDays = parseRetentionDays(archivedSetting?.value);

  let purgedTasks = 0;
  let purgedBoards = 0;

  if (deletedDays > 0) {
    const expiredTasks = await taskQueries.getExpiredSoftDeletedTasks(db, deletedDays);
    for (const row of expiredTasks) {
      try {
        await purgeTaskCompletelyAndUpdateStorage(db, row.id, storagePaths);
        purgedTasks += 1;
      } catch (err) {
        console.error(`Lifecycle purge task ${row.id} failed:`, err.message);
      }
    }
    const expiredBoards = await boardQueries.getExpiredSoftDeletedBoards(db, deletedDays);
    for (const row of expiredBoards) {
      try {
        await purgeBoardCompletely(db, row.id, storagePaths);
        purgedBoards += 1;
      } catch (err) {
        console.error(`Lifecycle purge board ${row.id} failed:`, err.message);
      }
    }
  }

  if (archivedDays > 0) {
    const expiredArchived = await taskQueries.getExpiredArchivedColumnTasks(db, archivedDays);
    for (const row of expiredArchived) {
      try {
        await purgeTaskCompletelyAndUpdateStorage(db, row.id, storagePaths);
        purgedTasks += 1;
      } catch (err) {
        console.error(`Lifecycle archived purge task ${row.id} failed:`, err.message);
      }
    }
  }

  return { purgedTasks, purgedBoards, deletedDays, archivedDays };
}
