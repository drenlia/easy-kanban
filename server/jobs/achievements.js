import crypto from 'crypto';
import { wrapQuery } from '../utils/queryLogger.js';
import { dbTransaction, dbRun, isProxyDatabase } from '../utils/dbAsync.js';
import redisService from '../services/redisService.js';

/**
 * Check all users for new achievements/badges using badges table
 * @param {Database} db - SQLite database instance
 */
export const checkAllUserAchievements = async (db) => {
  try {
    const startTime = Date.now();
    console.log('🏆 Checking for new achievements...');
    
    let badgesAwarded = 0;
    let pointsAwarded = 0;
    const newAchievements = [];
    
    // Get all active badges from database
    const badges = await wrapQuery(
      db.prepare('SELECT * FROM badges WHERE is_active = 1 ORDER BY condition_value ASC'),
      'SELECT'
    ).all();
    
    // Get all users with their current stats
    const users = await wrapQuery(db.prepare(`
      SELECT 
        u.id as user_id,
        u.email as user_email,
        m.name as user_name
      FROM users u
      LEFT JOIN members m ON u.id = m.user_id
      WHERE u.is_active = 1
    `), 'SELECT').all();
    
    if (users.length === 0) {
      console.log('ℹ️  No active users to check');
      return { success: true, badgesAwarded: 0, pointsAwarded: 0, duration: Date.now() - startTime };
    }
    
    const userIds = users.map(u => u.user_id);
    const placeholders = userIds.map(() => '?').join(',');
    
    // Batch fetch all user stats (fixes N+1 problem)
    const allUserStats = await wrapQuery(
      db.prepare(`
        SELECT 
          user_id,
          COALESCE(SUM(tasks_created), 0) as tasks_created,
          COALESCE(SUM(tasks_completed), 0) as tasks_completed,
          COALESCE(SUM(total_effort_completed), 0) as total_effort_completed,
          COALESCE(SUM(comments_added), 0) as comments_added,
          COALESCE(SUM(collaborations), 0) as collaborations,
          COALESCE(SUM(watchers_added), 0) as watchers_added,
          COALESCE(SUM(total_points), 0) as total_points
        FROM user_points
        WHERE user_id IN (${placeholders})
        GROUP BY user_id
      `),
      'SELECT'
    ).all(...userIds);
    
    // Create map of stats by user_id
    const statsByUserId = new Map();
    allUserStats.forEach(stats => {
      statsByUserId.set(stats.user_id, stats);
    });
    
    // Batch fetch all awarded badges (fixes N+1 problem)
    const allAwardedBadges = await wrapQuery(
      db.prepare(`
        SELECT user_id, badge_id 
        FROM user_achievements 
        WHERE user_id IN (${placeholders})
      `),
      'SELECT'
    ).all(...userIds);
    
    // Create map of awarded badge IDs by user_id
    const awardedBadgesByUserId = new Map();
    allAwardedBadges.forEach(ab => {
      if (!awardedBadgesByUserId.has(ab.user_id)) {
        awardedBadgesByUserId.set(ab.user_id, new Set());
      }
      awardedBadgesByUserId.get(ab.user_id).add(ab.badge_id);
    });
    
    // Prepare statements for batch operations
    const insertAchievementStmt = db.prepare(`
      INSERT INTO user_achievements (
        id, user_id, badge_id, achievement_type, badge_name, badge_icon, badge_color,
        points_earned, earned_at, period_year, period_month
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertPointsStmt = db.prepare(`
      INSERT INTO user_points (
        id, user_id, user_name, period_year, period_month,
        total_points, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, period_year, period_month) 
      DO UPDATE SET 
        total_points = user_points.total_points + EXCLUDED.total_points,
        last_updated = EXCLUDED.last_updated
    `);
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const now = new Date().toISOString();
    
    // Process all users and badges in a single transaction for better performance
    if (isProxyDatabase(db)) {
      // Proxy mode: Collect all queries and send as batch
      const batchQueries = [];
      const achievementQuery = `
        INSERT INTO user_achievements (
          id, user_id, badge_id, achievement_type, badge_name, badge_icon, badge_color,
          points_earned, earned_at, period_year, period_month
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const pointsQuery = `
        INSERT INTO user_points (
          id, user_id, user_name, period_year, period_month,
          total_points, last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, period_year, period_month) 
        DO UPDATE SET 
          total_points = user_points.total_points + EXCLUDED.total_points,
          last_updated = EXCLUDED.last_updated
      `;
      
      for (const user of users) {
        // Get user's stats (default to zeros if not found)
        const userStats = statsByUserId.get(user.user_id) || {
          tasks_created: 0,
          tasks_completed: 0,
          total_effort_completed: 0,
          comments_added: 0,
          collaborations: 0,
          watchers_added: 0,
          total_points: 0
        };
        
        // Get badges already awarded to this user
        const awardedBadgeIds = awardedBadgesByUserId.get(user.user_id) || new Set();
        
        // Check each badge condition
        for (const badge of badges) {
          // Skip if already awarded
          if (awardedBadgeIds.has(badge.id)) continue;
          
          // Check if user meets the condition
          let conditionMet = false;
          let currentValue = 0;
          
          switch (badge.condition_type) {
            case 'tasks_created':
              currentValue = userStats.tasks_created;
              conditionMet = currentValue >= badge.condition_value;
              break;
            case 'tasks_completed':
              currentValue = userStats.tasks_completed;
              conditionMet = currentValue >= badge.condition_value;
              break;
            case 'total_effort_completed':
              currentValue = userStats.total_effort_completed;
              conditionMet = currentValue >= badge.condition_value;
              break;
            case 'comments_added':
              currentValue = userStats.comments_added;
              conditionMet = currentValue >= badge.condition_value;
              break;
            case 'collaborations':
              currentValue = userStats.collaborations;
              conditionMet = currentValue >= badge.condition_value;
              break;
            case 'watchers_added':
              currentValue = userStats.watchers_added;
              conditionMet = currentValue >= badge.condition_value;
              break;
            case 'total_points':
              currentValue = userStats.total_points;
              conditionMet = currentValue >= badge.condition_value;
              break;
          }
          
          // Award badge if condition met
          if (conditionMet) {
            const achievementId = crypto.randomUUID();
            
            batchQueries.push({
              query: achievementQuery,
              params: [
                achievementId,
                user.user_id,
                badge.id,
                badge.condition_type,
                badge.name,
                badge.icon,
                badge.color,
                badge.points_reward,
                now,
                currentYear,
                currentMonth
              ]
            });
            
            // Award bonus points if badge has a reward
            if (badge.points_reward > 0) {
              batchQueries.push({
                query: pointsQuery,
                params: [
                  crypto.randomUUID(),
                  user.user_id,
                  user.user_name,
                  currentYear,
                  currentMonth,
                  badge.points_reward,
                  now
                ]
              });
              
              pointsAwarded += badge.points_reward;
            }
            
            badgesAwarded++;
            newAchievements.push({
              userId: user.user_id,
              userName: user.user_name,
              badge: badge.name,
              icon: badge.icon,
              points: badge.points_reward
            });
            
            console.log(`🏆 Awarded "${badge.name}" to ${user.user_name || user.user_email} (+${badge.points_reward} points)`);
          }
        }
      }
      
      // Execute all inserts in a single batched transaction
      if (batchQueries.length > 0) {
        await db.executeBatchTransaction(batchQueries);
      }
    } else {
      // Direct DB mode: Use standard transaction
      await dbTransaction(db, async () => {
        // Wrap statements for async support
        const wrappedAchievementStmt = wrapQuery(insertAchievementStmt, 'INSERT');
        const wrappedPointsStmt = wrapQuery(insertPointsStmt, 'INSERT');
        
        for (const user of users) {
          // Get user's stats (default to zeros if not found)
          const userStats = statsByUserId.get(user.user_id) || {
            tasks_created: 0,
            tasks_completed: 0,
            total_effort_completed: 0,
            comments_added: 0,
            collaborations: 0,
            watchers_added: 0,
            total_points: 0
          };
          
          // Get badges already awarded to this user
          const awardedBadgeIds = awardedBadgesByUserId.get(user.user_id) || new Set();
          
          // Check each badge condition
          for (const badge of badges) {
            // Skip if already awarded
            if (awardedBadgeIds.has(badge.id)) continue;
            
            // Check if user meets the condition
            let conditionMet = false;
            let currentValue = 0;
            
            switch (badge.condition_type) {
              case 'tasks_created':
                currentValue = userStats.tasks_created;
                conditionMet = currentValue >= badge.condition_value;
                break;
              case 'tasks_completed':
                currentValue = userStats.tasks_completed;
                conditionMet = currentValue >= badge.condition_value;
                break;
              case 'total_effort_completed':
                currentValue = userStats.total_effort_completed;
                conditionMet = currentValue >= badge.condition_value;
                break;
              case 'comments_added':
                currentValue = userStats.comments_added;
                conditionMet = currentValue >= badge.condition_value;
                break;
              case 'collaborations':
                currentValue = userStats.collaborations;
                conditionMet = currentValue >= badge.condition_value;
                break;
              case 'watchers_added':
                currentValue = userStats.watchers_added;
                conditionMet = currentValue >= badge.condition_value;
                break;
              case 'total_points':
                currentValue = userStats.total_points;
                conditionMet = currentValue >= badge.condition_value;
                break;
            }
            
            // Award badge if condition met
            if (conditionMet) {
              const achievementId = crypto.randomUUID();
              
              await dbRun(wrappedAchievementStmt,
                achievementId,
                user.user_id,
                badge.id,
                badge.condition_type,
                badge.name,
                badge.icon,
                badge.color,
                badge.points_reward,
                now,
                currentYear,
                currentMonth
              );
              
              // Award bonus points if badge has a reward
              if (badge.points_reward > 0) {
                await dbRun(wrappedPointsStmt,
                  crypto.randomUUID(),
                  user.user_id,
                  user.user_name,
                  currentYear,
                  currentMonth,
                  badge.points_reward,
                  now
                );
                
                pointsAwarded += badge.points_reward;
              }
              
              badgesAwarded++;
              newAchievements.push({
                userId: user.user_id,
                userName: user.user_name,
                badge: badge.name,
                icon: badge.icon,
                points: badge.points_reward
              });
              
              console.log(`🏆 Awarded "${badge.name}" to ${user.user_name || user.user_email} (+${badge.points_reward} points)`);
            }
          }
        }
      });
    }
    
    // Publish new achievements to WebSocket for real-time notifications
    if (newAchievements.length > 0) {
      try {
        await notificationService.publish('achievements-awarded', {
          achievements: newAchievements,
          timestamp: new Date().toISOString()
        });
      } catch (publishError) {
        console.error('❌ Failed to publish achievement notifications:', publishError);
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Achievement check completed: ${badgesAwarded} badges awarded, ${pointsAwarded} bonus points given (${duration}ms)`);
    
    return { success: true, badgesAwarded, pointsAwarded, duration };
  } catch (error) {
    console.error('❌ Failed to check achievements:', error);
    throw error;
  }
};

/**
 * Get leaderboard for a specific period
 * @param {Database} db - SQLite database instance
 * @param {number} year - Year (optional, defaults to current)
 * @param {number} month - Month (optional, if not provided returns all-time)
 */
export const getLeaderboard = async (db, year = null, month = null) => {
  try {
    let query = `
      SELECT 
        user_id,
        user_name,
        SUM(total_points) as total_points,
        SUM(tasks_completed) as tasks_completed,
        SUM(total_effort_completed) as total_effort_completed,
        SUM(comments_added) as comments_added,
        SUM(collaborations) as collaborations
      FROM user_points
    `;
    
    const params = [];
    if (year && month) {
      query += ' WHERE period_year = ? AND period_month = ?';
      params.push(year, month);
    } else if (year) {
      query += ' WHERE period_year = ?';
      params.push(year);
    }
    
    query += `
      GROUP BY user_id, user_name
      ORDER BY total_points DESC
      LIMIT 50
    `;
    
    const leaderboard = await wrapQuery(db.prepare(query), 'SELECT').all(...params);
    
    // Add rank
    leaderboard.forEach((user, index) => {
      user.rank = index + 1;
    });
    
    return leaderboard;
  } catch (error) {
    console.error('❌ Failed to get leaderboard:', error);
    throw error;
  }
};

export default {
  checkAllUserAchievements,
  getLeaderboard
};

