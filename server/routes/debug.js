import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { getQueryLogs, clearQueryLogs } from '../utils/queryLogger.js';

const router = express.Router();

router.use(authenticateToken, requireRole(['admin']));

// Get query logs
router.get('/logs', (req, res) => {
  res.json(getQueryLogs());
});

// Clear query logs
router.post('/logs/clear', (req, res) => {
  clearQueryLogs();
  res.json({ message: 'Query logs cleared' });
});

export default router;
