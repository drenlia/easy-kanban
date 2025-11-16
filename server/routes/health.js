import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';
import websocketService from '../services/websocketService.js';

const router = express.Router();

// Track server initialization state
let isServerReady = false;
let servicesInitialized = false;

// Mark server as ready (called after services are initialized)
export const markServerReady = () => {
  isServerReady = true;
  servicesInitialized = true;
  console.log('✅ Server marked as ready');
};

// Readiness check handler - exported for use in multiple routes
export const readyHandler = (req, res) => {
  try {
    const db = req.app.locals.db;
    
    // Check database
    const dbCheck = wrapQuery(db.prepare('SELECT 1'), 'SELECT').get();
    if (!dbCheck) {
      return res.status(503).json({ 
        status: 'not ready', 
        reason: 'database_not_connected',
        timestamp: new Date().toISOString()
      });
    }
    
    // Check if services are initialized
    if (!servicesInitialized) {
      return res.status(503).json({ 
        status: 'not ready', 
        reason: 'services_initializing',
        timestamp: new Date().toISOString()
      });
    }
    
    // Check Redis (optional - app can work without it)
    const redisConnected = redisService.isRedisConnected();
    
    // Server is ready
    res.status(200).json({ 
      status: 'ready', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: redisConnected ? 'connected' : 'optional',
      websocket: 'initialized',
      servicesInitialized: true
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'not ready', 
      reason: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Readiness check endpoint - checks if all services are initialized and ready
router.get('/ready', readyHandler);

// Health check endpoint (liveness probe - checks if server is running)
router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    wrapQuery(db.prepare('SELECT 1'), 'SELECT').get();
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: redisService.isRedisConnected(),
      websocket: websocketService.getClientCount(),
      ready: isServerReady
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

