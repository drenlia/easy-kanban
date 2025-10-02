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

  async publish(channel, data) {
    if (!this.isConnected) {
      console.log(`⚠️ Redis not connected, skipping publish to ${channel}`);
      return;
    }
    
    try {
      await this.publisher.publish(channel, JSON.stringify(data));
    } catch (error) {
      console.error(`❌ Redis publish failed for ${channel}:`, error);
    }
  }

  async subscribe(channel, callback) {
    if (!this.isConnected) {
      console.log(`⚠️ Redis not connected, skipping subscribe to ${channel}`);
      return;
    }
    
    try {
      await this.subscriber.subscribe(channel, (message) => {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (parseError) {
          console.error(`❌ Failed to parse message from ${channel}:`, parseError);
        }
      });
    } catch (error) {
      console.error(`❌ Redis subscribe failed for ${channel}:`, error);
    }
  }

  isRedisConnected() {
    return this.isConnected;
  }
}

export default new RedisService();
