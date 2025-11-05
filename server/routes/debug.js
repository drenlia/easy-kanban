import express from 'express';
import { getQueryLogs, clearQueryLogs } from '../utils/queryLogger.js';

const router = express.Router();

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

