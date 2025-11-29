import cron from 'node-cron';
import { createDailyTaskSnapshots, cleanupOldSnapshots } from './taskSnapshots.js';
import { checkAllUserAchievements } from './achievements.js';
import { getNotificationThrottler } from '../services/notificationThrottler.js';
import { isMultiTenant, getAllTenantDatabases } from '../middleware/tenantRouting.js';

/**
 * Initialize all scheduled background jobs
 * @param {Database} db - SQLite database instance (for single-tenant mode)
 */
export const initializeScheduler = (db) => {
  console.log('📅 Initializing background job scheduler...');
  
  try {
    // Job 1: Daily Task Snapshots (runs at midnight)
    // Cron: 0 0 * * * = At 00:00 every day
    cron.schedule('0 0 * * *', async () => {
      console.log('📸 [CRON] Running daily task snapshots job...');
      try {
        if (isMultiTenant()) {
          // Multi-tenant: run for all tenant databases
          const tenantDbs = await getAllTenantDatabases();
          console.log(`📸 [CRON] Processing ${tenantDbs.length} tenant(s)...`);
          for (const { tenantId, db: tenantDb } of tenantDbs) {
            try {
              await createDailyTaskSnapshots(tenantDb);
              console.log(`✅ [CRON] Snapshots created for tenant: ${tenantId || 'default'}`);
            } catch (error) {
              console.error(`❌ [CRON] Failed for tenant ${tenantId || 'default'}:`, error.message);
            }
          }
        } else {
          // Single-tenant: run for default database
          await createDailyTaskSnapshots(db);
        }
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
        if (isMultiTenant()) {
          // Multi-tenant: run for all tenant databases
          const tenantDbs = await getAllTenantDatabases();
          console.log(`🏆 [CRON] Processing ${tenantDbs.length} tenant(s)...`);
          for (const { tenantId, db: tenantDb } of tenantDbs) {
            try {
              await checkAllUserAchievements(tenantDb);
              console.log(`✅ [CRON] Achievements checked for tenant: ${tenantId || 'default'}`);
            } catch (error) {
              console.error(`❌ [CRON] Failed for tenant ${tenantId || 'default'}:`, error.message);
            }
          }
        } else {
          // Single-tenant: run for default database
          await checkAllUserAchievements(db);
        }
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
        if (isMultiTenant()) {
          // Multi-tenant: run for all tenant databases
          const tenantDbs = await getAllTenantDatabases();
          console.log(`🧹 [CRON] Processing ${tenantDbs.length} tenant(s)...`);
          for (const { tenantId, db: tenantDb } of tenantDbs) {
            try {
              await cleanupOldSnapshots(tenantDb, 730); // Keep 2 years of snapshots
              console.log(`✅ [CRON] Cleanup completed for tenant: ${tenantId || 'default'}`);
            } catch (error) {
              console.error(`❌ [CRON] Failed for tenant ${tenantId || 'default'}:`, error.message);
            }
          }
        } else {
          // Single-tenant: run for default database
          await cleanupOldSnapshots(db, 730); // Keep 2 years of snapshots
        }
      } catch (error) {
        console.error('❌ [CRON] Snapshot cleanup job failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    console.log('  ✓ Snapshot cleanup scheduled (monthly, 1st at 2am UTC)');
    
    // Job 4: Cleanup Old Notifications (runs daily at 3 AM)
    // Cron: 0 3 * * * = At 03:00 every day
    cron.schedule('0 3 * * *', async () => {
      console.log('🧹 [CRON] Running notification queue cleanup job...');
      try {
        const throttler = getNotificationThrottler();
        if (throttler) {
          throttler.cleanupOldNotifications();
        } else {
          console.warn('⚠️ [CRON] Notification throttler not available for cleanup');
        }
      } catch (error) {
        console.error('❌ [CRON] Notification cleanup job failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });
    console.log('  ✓ Notification queue cleanup scheduled (daily at 3am UTC)');
    
    console.log('✅ Background job scheduler initialized successfully');
    console.log('📋 Scheduled jobs:');
    console.log('   • Daily snapshots: 00:00 UTC');
    console.log('   • Achievement checks: Every hour');
    console.log('   • Snapshot cleanup: 1st of month at 02:00 UTC');
    console.log('   • Notification cleanup: Daily at 03:00 UTC');
    
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

