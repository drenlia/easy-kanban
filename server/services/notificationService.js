/**
 * Unified Notification Service
 * 
 * Automatically uses PostgreSQL LISTEN/NOTIFY when DB_TYPE=postgresql,
 * otherwise falls back to Redis pub/sub.
 * 
 * This provides a single interface for publishing notifications regardless
 * of the underlying database type.
 * 
 * Usage:
 *   import notificationService from './services/notificationService.js';
 *   await notificationService.publish('task-updated', data, tenantId);
 */

import redisService from './redisService.js';
import postgresNotificationService from './postgresNotificationService.js';

class UnifiedNotificationService {
  /**
   * Publish a notification
   * Automatically uses PostgreSQL if DB_TYPE=postgresql, otherwise Redis
   */
  async publish(channel, data, tenantId = null) {
    const usePostgres = process.env.DB_TYPE === 'postgresql';
    
    if (usePostgres) {
      // Use PostgreSQL LISTEN/NOTIFY
      return await postgresNotificationService.publish(channel, data, tenantId);
    } else {
      // Fall back to Redis pub/sub
      return await redisService.publish(channel, data, tenantId);
    }
  }

  /**
   * Subscribe to a channel
   * Note: This is mainly used by WebSocket service, which handles subscriptions separately
   */
  async subscribe(channel, callback, tenantId = null) {
    const usePostgres = process.env.DB_TYPE === 'postgresql';
    
    if (usePostgres) {
      return await postgresNotificationService.subscribe(channel, callback, tenantId);
    } else {
      return await redisService.subscribe(channel, callback, tenantId);
    }
  }

  /**
   * Subscribe to all tenant channels
   * Note: This is mainly used by WebSocket service
   */
  async subscribeToAllTenants(channel, callback) {
    const usePostgres = process.env.DB_TYPE === 'postgresql';
    
    if (usePostgres) {
      return await postgresNotificationService.subscribeToAllTenants(channel, callback);
    } else {
      return await redisService.subscribeToAllTenants(channel, callback);
    }
  }

  /**
   * Check if service is connected
   */
  isConnected() {
    const usePostgres = process.env.DB_TYPE === 'postgresql';
    
    if (usePostgres) {
      return postgresNotificationService.isServiceConnected();
    } else {
      return redisService.isRedisConnected();
    }
  }
}

export default new UnifiedNotificationService();
