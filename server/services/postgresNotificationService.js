/**
 * PostgreSQL Notification Service
 * 
 * Uses PostgreSQL LISTEN/NOTIFY for real-time event publishing and subscription.
 * Replaces Redis pub/sub for better transactional guarantees and schema-based isolation.
 * 
 * Benefits:
 * - Transactional: NOTIFY only fires after commit
 * - Ordered: PostgreSQL guarantees message order
 * - Schema-based isolation for multi-tenant
 * - No external message queue needed
 * 
 * Usage:
 *   // Publish
 *   await postgresNotificationService.publish('task-updated', data, tenantId);
 * 
 *   // Subscribe
 *   await postgresNotificationService.subscribe('task-updated', (data, tenantId) => {
 *     // Handle notification
 *   });
 */

import pg from 'pg';
const { Client } = pg;

class PostgresNotificationService {
  constructor() {
    this.listenerClient = null; // Dedicated client for LISTEN
    this.publisherPool = null; // Pool for publishing (can reuse existing pool)
    this.poolWasPassed = false; // Track if pool was passed in (don't close it)
    this.isConnected = false;
    this.subscriptions = new Map(); // Map of channel -> Set of callbacks
    this.tenantId = null; // Current tenant context for multi-tenant mode
  }

  /**
   * Initialize the notification service
   * Creates a dedicated LISTEN client and reuses existing PostgreSQL pool for publishing
   */
  async connect(pool = null) {
    try {
      // Use provided pool or create a new one
      if (pool) {
        this.publisherPool = pool;
        this.poolWasPassed = true;
      } else {
        this.poolWasPassed = false;
        // Create a pool for publishing if not provided
        this.publisherPool = new pg.Pool({
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432'),
          database: process.env.POSTGRES_DB || 'kanban',
          user: process.env.POSTGRES_USER || 'kanban_user',
          password: process.env.POSTGRES_PASSWORD || 'kanban_password',
          max: 5, // Small pool for notifications
        });
      }

      // Create a dedicated client for LISTEN (must be separate from pool)
      this.listenerClient = new Client({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'kanban',
        user: process.env.POSTGRES_USER || 'kanban_user',
        password: process.env.POSTGRES_PASSWORD || 'kanban_password',
      });

      await this.listenerClient.connect();
      
      // Set up notification handler
      this.listenerClient.on('notification', (msg) => {
        this.handleNotification(msg);
      });

      // Handle connection errors
      this.listenerClient.on('error', (err) => {
        console.error('❌ PostgreSQL LISTEN client error:', err);
        this.isConnected = false;
        // Attempt to reconnect after a delay
        setTimeout(() => {
          if (!this.isConnected) {
            console.log('🔄 Attempting to reconnect PostgreSQL LISTEN client...');
            this.connect(this.publisherPool).catch(console.error);
          }
        }, 5000);
      });

      this.isConnected = true;
      console.log('✅ PostgreSQL Notification Service connected');
    } catch (error) {
      console.error('❌ PostgreSQL Notification Service connection failed:', error);
      this.isConnected = false;
      // Don't throw - app should continue without notifications
    }
  }

  /**
   * Disconnect from PostgreSQL
   */
  async disconnect() {
    try {
      if (this.listenerClient) {
        // Unlisten from all channels
        for (const channel of this.subscriptions.keys()) {
          await this.listenerClient.query(`UNLISTEN ${this.escapeChannelName(channel)}`);
        }
        await this.listenerClient.end();
        this.listenerClient = null;
      }
      // Only close pool if we created it (not if it was passed in)
      // The caller is responsible for managing the pool lifecycle if it was passed in
      if (this.publisherPool && !this.poolWasPassed) {
        await this.publisherPool.end();
        this.publisherPool = null;
      }
      this.isConnected = false;
      this.subscriptions.clear();
      console.log('✅ PostgreSQL Notification Service disconnected');
    } catch (error) {
      console.error('❌ PostgreSQL Notification Service disconnect failed:', error);
    }
  }

  /**
   * Get tenant-prefixed channel name (for multi-tenant isolation)
   */
  getTenantChannel(channel, tenantId = null) {
    // In multi-tenant mode, prefix channels with tenant ID
    if (tenantId && process.env.MULTI_TENANT === 'true') {
      return `tenant-${tenantId}-${channel}`;
    }
    // Single-tenant mode: use channel as-is
    return channel;
  }

  /**
   * Escape channel name for SQL (PostgreSQL channel names are identifiers)
   * Channel names must be valid SQL identifiers (no special chars except underscore)
   */
  escapeChannelName(channel) {
    // Replace invalid characters with underscores
    // PostgreSQL identifiers can contain letters, digits, underscores, and dollar signs
    return channel.replace(/[^a-zA-Z0-9_$]/g, '_');
  }

  /**
   * Publish a notification using pg_notify
   * @param {string} channel - Channel name
   * @param {object} data - Data to send
   * @param {string|null} tenantId - Tenant ID for multi-tenant isolation
   */
  async publish(channel, data, tenantId = null) {
    if (!this.isConnected || !this.publisherPool) {
      console.log(`⚠️ PostgreSQL Notification Service not connected, skipping publish to ${channel}`);
      return;
    }

    try {
      const tenantChannel = this.getTenantChannel(channel, tenantId);
      const escapedChannel = this.escapeChannelName(tenantChannel);
      let payload = JSON.stringify(data);
      const payloadSize = Buffer.byteLength(payload, 'utf8');

      // PostgreSQL pg_notify has a limit of 8000 bytes
      const MAX_PAYLOAD_SIZE = 8000;
      
      if (payloadSize > MAX_PAYLOAD_SIZE) {
        // For activity-updated, send minimal payload (clients can fetch full data)
        if (channel === 'activity-updated' && data.activities) {
          payload = JSON.stringify({
            timestamp: data.timestamp,
            count: data.activities.length,
            message: 'Activity feed updated - fetch latest from API'
          });
        } else {
          // For other channels, truncate or send minimal notification
          console.warn(`⚠️ Payload too large (${payloadSize} bytes) for ${channel}, sending minimal notification`);
          payload = JSON.stringify({
            timestamp: data.timestamp || new Date().toISOString(),
            message: 'Update available - payload too large for notification'
          });
        }
      }

      // Use pg_notify function
      const client = await this.publisherPool.connect();
      try {
        // Set schema if multi-tenant
        if (tenantId && process.env.MULTI_TENANT === 'true') {
          // Quote schema name to handle special characters (like hyphens in tenant IDs)
          const quotedSchema = `"tenant_${tenantId}"`;
          await client.query(`SET search_path TO ${quotedSchema}, public`);
        }

        // Publish to tenant-specific channel (for direct subscriptions)
        await client.query('SELECT pg_notify($1, $2)', [escapedChannel, payload]);
        console.log(`📤 Published to PostgreSQL channel: ${escapedChannel} (original: ${channel}, tenant: ${tenantId || 'none'})`);
        
        // ALSO publish to base channel with tenantId in payload (for subscribeToAllTenants)
        // This ensures WebSocket service receives notifications even when subscribed to base channel
        if (tenantId && process.env.MULTI_TENANT === 'true') {
          const basePayload = JSON.stringify({ ...data, tenantId });
          await client.query('SELECT pg_notify($1, $2)', [channel, basePayload]);
          console.log(`📤 Also published to base channel: ${channel} (tenant: ${tenantId})`);
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`❌ PostgreSQL NOTIFY failed for ${channel}:`, error);
    }
  }

  /**
   * Subscribe to a channel
   * @param {string} channel - Channel name
   * @param {function} callback - Callback function(data, tenantId)
   * @param {string|null} tenantId - Tenant ID for single-tenant subscription
   */
  async subscribe(channel, callback, tenantId = null) {
    if (!this.isConnected || !this.listenerClient) {
      console.log(`⚠️ PostgreSQL Notification Service not connected, skipping subscribe to ${channel}`);
      return;
    }

    try {
      const tenantChannel = this.getTenantChannel(channel, tenantId);
      const escapedChannel = this.escapeChannelName(tenantChannel);

      // Add callback to subscriptions
      if (!this.subscriptions.has(escapedChannel)) {
        this.subscriptions.set(escapedChannel, new Set());
        // Start listening to this channel
        await this.listenerClient.query(`LISTEN ${escapedChannel}`);
        console.log(`📡 Subscribed to PostgreSQL channel: ${escapedChannel}`);
      }

      this.subscriptions.get(escapedChannel).add(callback);
    } catch (error) {
      console.error(`❌ PostgreSQL LISTEN failed for ${channel}:`, error);
    }
  }

  /**
   * Subscribe to all tenant channels (for WebSocket service)
   * In multi-tenant mode, subscribes to pattern `tenant-*-{channel}`
   * In single-tenant mode, subscribes to base channel
   * 
   * Since PostgreSQL doesn't support wildcard LISTEN, we use a pattern-based approach:
   * - Subscribe to a base channel that matches the escaped pattern
   * - Use NOTIFY with a pattern that we can match in handleNotification
   */
  async subscribeToAllTenants(channel, callback) {
    if (!this.isConnected || !this.listenerClient) {
      console.log(`⚠️ PostgreSQL Notification Service not connected, skipping subscribe to ${channel}`);
      return;
    }

    if (process.env.MULTI_TENANT === 'true') {
      // In multi-tenant mode, we need to subscribe to tenant-specific channels
      // Since PostgreSQL doesn't support wildcard LISTEN, we subscribe to a pattern-based channel
      // The pattern is: tenant_*_<channel> (escaped)
      // We'll listen to a base pattern and extract tenantId from the channel name
      
      // Subscribe to a pattern that matches all tenant channels
      // We use a special "all-tenants" prefix that we can match
      const patternChannel = `tenant_all_${channel}`;
      const escapedPatternChannel = this.escapeChannelName(patternChannel);
      
      // Actually, we need to subscribe to each tenant channel individually
      // But since we don't know all tenants upfront, we'll use a different approach:
      // Subscribe to the base channel and rely on the payload containing tenantId
      // OR: Use a global channel that all tenants publish to
      
      // Better approach: Subscribe to base channel, but handle tenant extraction from escaped channel names
      // We'll need to modify publish to also send to a base channel OR extract tenant from escaped name
      
      // For now, let's subscribe to the base channel and extract tenantId from the payload
      await this.subscribe(channel, (data, receivedTenantId) => {
        // Extract tenantId from data if not provided
        const tenantId = receivedTenantId || data.tenantId || null;
        callback(data, tenantId);
      });
    } else {
      // Single-tenant mode: subscribe to base channel
      await this.subscribe(channel, callback);
    }
  }

  /**
   * Handle incoming notification from PostgreSQL
   * @private
   */
  handleNotification(msg) {
    try {
      const channel = msg.channel;
      const payload = msg.payload;

      // Parse JSON payload
      const data = JSON.parse(payload);

      // Extract tenantId from channel name if multi-tenant
      // Handle both escaped (underscores) and unescaped (hyphens) channel names
      let tenantId = null;
      if (process.env.MULTI_TENANT === 'true') {
        // Try to extract from escaped channel name (tenant_amanda_pg_task_updated)
        const escapedMatch = channel.match(/^tenant_([^_]+)_/);
        if (escapedMatch) {
          tenantId = escapedMatch[1];
        } else {
          // Try to extract from unescaped channel name (tenant-amanda-pg-task-updated)
          const unescapedMatch = channel.match(/^tenant-([^-]+)-/);
          tenantId = unescapedMatch ? unescapedMatch[1] : null;
        }
        
        // If tenantId not found in channel name, try to get it from payload
        if (!tenantId && data.tenantId) {
          tenantId = data.tenantId;
        }
      }

      // Call all callbacks for this channel
      const callbacks = this.subscriptions.get(channel);
      if (callbacks) {
        callbacks.forEach(callback => {
          try {
            callback(data, tenantId);
          } catch (error) {
            console.error(`❌ Error in notification callback for ${channel}:`, error);
          }
        });
      }
    } catch (error) {
      console.error(`❌ Failed to handle notification:`, error);
    }
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel) {
    if (!this.isConnected || !this.listenerClient) {
      return;
    }

    try {
      const escapedChannel = this.escapeChannelName(channel);
      await this.listenerClient.query(`UNLISTEN ${escapedChannel}`);
      this.subscriptions.delete(escapedChannel);
      console.log(`📡 Unsubscribed from PostgreSQL channel: ${escapedChannel}`);
    } catch (error) {
      console.error(`❌ PostgreSQL UNLISTEN failed for ${channel}:`, error);
    }
  }

  /**
   * Check if service is connected
   */
  isServiceConnected() {
    return this.isConnected;
  }
}

export default new PostgresNotificationService();

