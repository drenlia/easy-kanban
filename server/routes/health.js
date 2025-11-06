import express from 'express';
import { wrapQuery } from '../utils/queryLogger.js';
import redisService from '../services/redisService.js';
import websocketService from '../services/websocketService.js';

const router = express.Router();

// Health check endpoint
router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    wrapQuery(db.prepare('SELECT 1'), 'SELECT').get();
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: redisService.isRedisConnected(),
      websocket: websocketService.getClientCount()
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

