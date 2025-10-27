import crypto from 'crypto';
import { wrapQuery } from '../utils/queryLogger.js';
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
    const badges = wrapQuery(
      db.prepare('SELECT * FROM badges WHERE is_active = 1 ORDER BY condition_value ASC'),
      'SELECT'
    ).all();
    
    // Get all users with their current stats
    const users = wrapQuery(db.prepare(`
      SELECT 
        u.id as user_id,
        u.email as user_email,
        m.name as user_name
      FROM users u
      LEFT JOIN members m ON u.id = m.user_id
      WHERE u.is_active = 1
    `), 'SELECT').all();
    
    for (const user of users) {
      // Get user's current stats from user_points
      const userStats = wrapQuery(
        db.prepare(`
          SELECT 
            COALESCE(SUM(tasks_created), 0) as tasks_created,
            COALESCE(SUM(tasks_completed), 0) as tasks_completed,
            COALESCE(SUM(total_effort_completed), 0) as total_effort_completed,
            COALESCE(SUM(comments_added), 0) as comments_added,
            COALESCE(SUM(collaborations), 0) as collaborations,
            COALESCE(SUM(watchers_added), 0) as watchers_added,
            COALESCE(SUM(total_points), 0) as total_points
          FROM user_points
          WHERE user_id = ?
        `),
        'SELECT'
      ).get(user.user_id) || {
        tasks_created: 0,
        tasks_completed: 0,
        total_effort_completed: 0,
        comments_added: 0,
        collaborations: 0,
        watchers_added: 0,
        total_points: 0
      };
      
      // Get badges already awarded to this user
      const awardedBadges = wrapQuery(
        db.prepare('SELECT badge_id FROM user_achievements WHERE user_id = ?'),
        'SELECT'
      ).all(user.user_id);
      
      const awardedBadgeIds = new Set(awardedBadges.map(ab => ab.badge_id));
      
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
          const now = new Date().toISOString();
          
          wrapQuery(
            db.prepare(`
              INSERT INTO user_achievements (
                id, user_id, badge_id, achievement_type, badge_name, badge_icon, badge_color,
                points_earned, earned_at, period_year, period_month
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `),
            'INSERT'
          ).run(
            achievementId,
            user.user_id,
            badge.id,
            badge.condition_type, // achievement_type (e.g. tasks_completed, comments_added, etc.)
            badge.name,
            badge.icon,
            badge.color,
            badge.points_reward,
            now,
            new Date().getFullYear(),
            new Date().getMonth() + 1
          );
          
          // Award bonus points if badge has a reward
          if (badge.points_reward > 0) {
            // Update user's points for the current period
            const currentYear = new Date().getFullYear();
            const currentMonth = new Date().getMonth() + 1;
            
            wrapQuery(
              db.prepare(`
                INSERT INTO user_points (
                  id, user_id, user_name, period_year, period_month,
                  total_points, last_updated
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, period_year, period_month) 
                DO UPDATE SET 
                  total_points = total_points + ?,
                  last_updated = ?
              `),
              'INSERT'
            ).run(
              crypto.randomUUID(),
              user.user_id,
              user.user_name,
              currentYear,
              currentMonth,
              badge.points_reward,
              now,
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
    
    // Publish new achievements to WebSocket for real-time notifications
    if (newAchievements.length > 0) {
      try {
        await redisService.publish('achievements-awarded', {
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
export const getLeaderboard = (db, year = null, month = null) => {
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
    
    const leaderboard = wrapQuery(db.prepare(query), 'SELECT').all(...params);
    
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

