# Redis v5 Migration Guide

## Current Implementation (v4.7.0)

```javascript
// server/services/redisService.js
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
```

## Required Changes for v5.x

Based on node-redis v5 API, the `subscribe()` method may have changed. Here are the potential migration paths:

### Option 1: Event-Based Pattern (Most Likely)

In node-redis v5, subscriptions typically use event handlers instead of callbacks:

```javascript
// server/services/redisService.js - Updated for v5
import { createClient } from 'redis';

class RedisService {
  constructor() {
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;
    this.subscriptionCallbacks = new Map(); // Store callbacks per channel
  }

  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.publisher = createClient({ url: redisUrl });
      this.subscriber = createClient({ url: redisUrl });

      // Set up message event handler for v5
      this.subscriber.on('message', (channel, message) => {
        const callback = this.subscriptionCallbacks.get(channel);
        if (callback) {
          try {
            const data = JSON.parse(message);
            callback(data);
          } catch (parseError) {
            console.error(`❌ Failed to parse message from ${channel}:`, parseError);
          }
        }
      });

      await this.publisher.connect();
      await this.subscriber.connect();
      
      this.isConnected = true;
      console.log('✅ Redis connected');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      // Don't throw error - app should continue without Redis
    }
  }

  async subscribe(channel, callback) {
    if (!this.isConnected) {
      console.log(`⚠️ Redis not connected, skipping subscribe to ${channel}`);
      return;
    }
    
    try {
      // Store callback for this channel
      this.subscriptionCallbacks.set(channel, callback);
      
      // Subscribe to channel (v5 API - no callback parameter)
      await this.subscriber.subscribe(channel);
      
      console.log(`📡 Subscribed to ${channel}`);
    } catch (error) {
      console.error(`❌ Redis subscribe failed for ${channel}:`, error);
    }
  }

  // ... rest of the methods remain the same
}
```

### Option 2: If Callback Pattern Still Works

If node-redis v5 still supports the callback pattern (less likely), minimal changes:

```javascript
async subscribe(channel, callback) {
  if (!this.isConnected) {
    console.log(`⚠️ Redis not connected, skipping subscribe to ${channel}`);
    return;
  }
  
  try {
    // v5 might still support callback, but verify
    await this.subscriber.subscribe(channel, (message, channelName) => {
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
```

### Option 3: Using pSubscribe for Pattern Matching (If Needed)

If you need pattern-based subscriptions:

```javascript
// For pattern subscriptions (e.g., 'task-*')
await this.subscriber.pSubscribe('task-*', (message, channel) => {
  // Handle pattern-matched messages
});
```

## Recommended Migration Path

**Use Option 1 (Event-Based Pattern)** as it's the most likely v5 API. Here's the exact code:

### Step 1: Update `redisService.js`

1. Add `subscriptionCallbacks` Map to store callbacks
2. Set up `message` event handler in `connect()`
3. Update `subscribe()` to store callback and call `subscribe()` without callback parameter

### Step 2: Test

1. All existing `redisService.subscribe()` calls in `websocketService.js` will continue to work (no changes needed)
2. Test that messages are received correctly
3. Verify all 50+ subscriptions work

### Step 3: Handle Unsubscribe (If Needed)

If you need to unsubscribe:

```javascript
async unsubscribe(channel) {
  if (!this.isConnected) {
    return;
  }
  
  try {
    await this.subscriber.unsubscribe(channel);
    this.subscriptionCallbacks.delete(channel);
    console.log(`📡 Unsubscribed from ${channel}`);
  } catch (error) {
    console.error(`❌ Redis unsubscribe failed for ${channel}:`, error);
  }
}
```

## Files That Need Changes

1. ✅ **`server/services/redisService.js`** - Update subscribe method (1 file)
2. ✅ **`server/services/websocketService.js`** - No changes needed (uses wrapper)
3. ✅ **All route files** - No changes needed (they use `publish()` which remains the same)

## Testing Checklist

- [ ] Test single channel subscription
- [ ] Test multiple channel subscriptions (all 50+ channels)
- [ ] Test message parsing (JSON)
- [ ] Test error handling (disconnected Redis)
- [ ] Test reconnection scenarios
- [ ] Verify WebSocket broadcasts still work
- [ ] Test publish/subscribe flow end-to-end

## Rollback Plan

If issues arise:
1. Revert `package.json` to `redis@^4.7.0`
2. Revert `redisService.js` changes
3. Run `npm install`

## Summary

**Minimal Changes Required:**
- 1 file to update: `server/services/redisService.js`
- Main change: Switch from callback-based `subscribe()` to event-based pattern
- All existing code using `redisService.subscribe()` will continue to work unchanged

**Risk Level: Low-Medium**
- Isolated to one service file
- Easy to test
- Easy to rollback

