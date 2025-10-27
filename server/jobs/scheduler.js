import cron from 'node-cron';
import { createDailyTaskSnapshots, cleanupOldSnapshots } from './taskSnapshots.js';
import { checkAllUserAchievements } from './achievements.js';

/**
 * Initialize all scheduled background jobs
 * @param {Database} db - SQLite database instance
 */
export const initializeScheduler = (db) => {
  console.log('📅 Initializing background job scheduler...');
  
  try {
    // Job 1: Daily Task Snapshots (runs at midnight)
    // Cron: 0 0 * * * = At 00:00 every day
    cron.schedule('0 0 * * *', async () => {
      console.log('📸 [CRON] Running daily task snapshots job...');
      try {
        await createDailyTaskSnapshots(db);
      } catch (error) {
        console.error('❌ [CRON] Daily task snapshots job failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    console.log('  ✓ Daily task snapshots scheduled (midnight UTC)');
    
    // Job 2: Achievement Checks (runs every hour)
    // Cron: 0 * * * * = At minute 0 of every hour
    cron.schedule('0 * * * *', async () => {
      console.log('🏆 [CRON] Running achievement check job...');
      try {
        await checkAllUserAchievements(db);
      } catch (error) {
        console.error('❌ [CRON] Achievement check job failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    console.log('  ✓ Achievement checks scheduled (every hour)');
    
    // Job 3: Cleanup Old Snapshots (runs monthly on 1st at 2 AM)
    // Cron: 0 2 1 * * = At 02:00 on day-of-month 1
    cron.schedule('0 2 1 * *', async () => {
      console.log('🧹 [CRON] Running snapshot cleanup job...');
      try {
        await cleanupOldSnapshots(db, 730); // Keep 2 years of snapshots
      } catch (error) {
        console.error('❌ [CRON] Snapshot cleanup job failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    console.log('  ✓ Snapshot cleanup scheduled (monthly, 1st at 2am UTC)');
    
    console.log('✅ Background job scheduler initialized successfully');
    console.log('📋 Scheduled jobs:');
    console.log('   • Daily snapshots: 00:00 UTC');
    console.log('   • Achievement checks: Every hour');
    console.log('   • Cleanup: 1st of month at 02:00 UTC');
    
    // Optional: Run initial snapshot if needed (for testing/initialization)
    if (process.env.RUN_INITIAL_SNAPSHOT === 'true') {
      console.log('🚀 Running initial snapshot...');
      createDailyTaskSnapshots(db).catch(err => {
        console.error('❌ Initial snapshot failed:', err);
      });
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize job scheduler:', error);
    throw error;
  }
};

/**
 * Manual job triggers (for testing or admin actions)
 */
export const manualTriggers = {
  /**
   * Manually trigger task snapshot creation
   */
  async triggerSnapshot(db) {
    console.log('🔧 Manual trigger: Creating task snapshots...');
    return await createDailyTaskSnapshots(db);
  },
  
  /**
   * Manually trigger achievement checks
   */
  async triggerAchievementCheck(db) {
    console.log('🔧 Manual trigger: Checking achievements...');
    return await checkAllUserAchievements(db);
  },
  
  /**
   * Manually trigger cleanup with custom retention
   */
  async triggerCleanup(db, retentionDays = 730) {
    console.log(`🔧 Manual trigger: Cleaning up old snapshots (${retentionDays} days)...`);
    return await cleanupOldSnapshots(db, retentionDays);
  }
};

export default {
  initializeScheduler,
  manualTriggers
};

