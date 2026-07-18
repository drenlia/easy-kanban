/**
 * Unified Notification Service — real-time pub/sub only (WebSockets / cross-pod fan-out).
 *
 * Uses PostgreSQL LISTEN/NOTIFY for app events. This is NOT for SMTP: do not use this
 * module to send email. Outbound mail lives in EmailService (server/services/emailService.js).
 *
 * Redis is still used separately for Socket.IO adapter session sharing across pods.
 *
 * Usage:
 *   import notificationService from './services/notificationService.js';
 *   await notificationService.publish('task-updated', data, tenantId);
 */

import { randomUUID } from 'crypto';
import postgresNotificationService from './postgresNotificationService.js';

class UnifiedNotificationService {
  /**
   * Publish a notification via PostgreSQL LISTEN/NOTIFY.
   *
   * Plain-object payloads get `_rtId` (UUID) for client-side deduplication when multiple
   * K8s replicas each emit the same NOTIFY over Socket.IO (see `src/utils/realtimeDedupe.ts`).
   *
   * In multi-tenant mode, `_notifyTenantId` is set from the publish argument so NOTIFY handlers
   * can route to the correct Socket.IO room without parsing the channel name.
   */
  async publish(channel, data, tenantId = null) {
    let payload = data;
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
      payload = { ...data, _rtId: randomUUID() };
      if (tenantId && process.env.MULTI_TENANT === 'true') {
        payload = { ...payload, _notifyTenantId: tenantId };
      }
    }

    return await postgresNotificationService.publish(channel, payload, tenantId);
  }

  /**
   * Subscribe to a channel
   * Note: This is mainly used by WebSocket service, which handles subscriptions separately
   */
  async subscribe(channel, callback, tenantId = null) {
    return await postgresNotificationService.subscribe(channel, callback, tenantId);
  }

  /**
   * Subscribe to all tenant channels
   * Note: This is mainly used by WebSocket service
   */
  async subscribeToAllTenants(channel, callback) {
    return await postgresNotificationService.subscribeToAllTenants(channel, callback);
  }

  /**
   * Check if service is connected
   */
  isConnected() {
    return postgresNotificationService.isServiceConnected();
  }
}

export default new UnifiedNotificationService();
