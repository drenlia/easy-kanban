import { createClient } from 'redis';

class RedisService {
  constructor() {
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.publisher = createClient({ url: redisUrl });
      this.subscriber = createClient({ url: redisUrl });

      await this.publisher.connect();
      await this.subscriber.connect();
      
      this.isConnected = true;
      console.log('✅ Redis connected');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      // Don't throw error - app should continue without Redis
    }
  }

  async disconnect() {
    try {
      if (this.publisher) {
        await this.publisher.disconnect();
      }
      if (this.subscriber) {
        await this.subscriber.disconnect();
      }
      this.isConnected = false;
    } catch (error) {
      console.error('❌ Redis disconnect failed:', error);
    }
  }

  // Get tenant-prefixed channel name (for multi-tenant isolation)
  getTenantChannel(channel, tenantId = null) {
    // In multi-tenant mode, prefix channels with tenant ID
    if (tenantId && process.env.MULTI_TENANT === 'true') {
      return `tenant-${tenantId}-${channel}`;
    }
    // Single-tenant mode: use channel as-is
    return channel;
  }

  async publish(channel, data, tenantId = null) {
    if (!this.isConnected) {
      console.log(`⚠️ Redis not connected, skipping publish to ${channel}`);
      return;
    }
    
    try {
      const tenantChannel = this.getTenantChannel(channel, tenantId);
      await this.publisher.publish(tenantChannel, JSON.stringify(data));
    } catch (error) {
      console.error(`❌ Redis publish failed for ${channel}:`, error);
    }
  }

  async subscribe(channel, callback, tenantId = null) {
    if (!this.isConnected) {
      console.log(`⚠️ Redis not connected, skipping subscribe to ${channel}`);
      return;
    }
    
    try {
      const tenantChannel = this.getTenantChannel(channel, tenantId);
      // v5: Subscribe with callback (v5 still supports callback pattern)
      // The callback receives (message, channelName) parameters
      await this.subscriber.subscribe(tenantChannel, (message, channelName) => {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (parseError) {
          console.error(`❌ Failed to parse message from ${channelName || tenantChannel}:`, parseError);
        }
      });
      
      console.log(`📡 Subscribed to ${tenantChannel}`);
    } catch (error) {
      console.error(`❌ Redis subscribe failed for ${channel}:`, error);
    }
  }

  // Subscribe to all tenant channels (for WebSocket service that needs to listen to all tenants)
  // In multi-tenant mode, subscribes to pattern `tenant-*-{channel}` to receive messages from all tenants
  // In single-tenant mode, subscribes to base channel
  async subscribeToAllTenants(channel, callback) {
    if (!this.isConnected) {
      console.log(`⚠️ Redis not connected, skipping subscribe to ${channel}`);
      return;
    }
    
    if (process.env.MULTI_TENANT === 'true') {
      // In multi-tenant mode, subscribe to pattern to receive messages from all tenants
      try {
        const pattern = `tenant-*-${channel}`;
        // Use pSubscribe for pattern matching (Redis v5 supports this)
        await this.subscriber.pSubscribe(pattern, (message, receivedPattern) => {
          try {
            const data = JSON.parse(message);
            // Extract tenantId from the pattern (e.g., "tenant-app-task-updated" -> "app")
            const match = receivedPattern.match(/tenant-([^-]+)-/);
            const tenantId = match ? match[1] : null;
            callback(data, tenantId);
          } catch (parseError) {
            console.error(`❌ Failed to parse message from ${receivedPattern}:`, parseError);
          }
        });
        console.log(`📡 Subscribed to pattern: ${pattern}`);
      } catch (error) {
        console.error(`❌ Redis pattern subscribe failed for ${channel}:`, error);
        console.log(`⚠️ Falling back to base channel subscription (may not work correctly in multi-tenant mode)`);
        // Fallback: subscribe to base channel (single-tenant compatibility)
        await this.subscribe(channel, callback);
      }
    } else {
      // Single-tenant mode: subscribe to base channel
      await this.subscribe(channel, callback);
    }
  }

  async unsubscribe(channel) {
    if (!this.isConnected) {
      return;
    }
    
    try {
      await this.subscriber.unsubscribe(channel);
      console.log(`📡 Unsubscribed from ${channel}`);
    } catch (error) {
      console.error(`❌ Redis unsubscribe failed for ${channel}:`, error);
    }
  }

  isRedisConnected() {
    return this.isConnected;
  }
}

export default new RedisService();
