/**
 * CSP violation reports — public ingest + admin list/clear.
 */

import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { cspReportLimiter } from '../middleware/rateLimiters.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
import { cspReports as cspQueries } from '../utils/sqlManager/index.js';
import { normalizeCspReportBody } from '../utils/cspReportNormalize.js';

const ingestRouter = express.Router();
const adminRouter = express.Router();

/** Public: browsers POST CSP reports here (no JWT). Always 204. */
ingestRouter.post('/', cspReportLimiter, async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(204).end();
    }

    const rows = normalizeCspReportBody(req.body, req.get('user-agent'));
    for (const row of rows) {
      await cspQueries.insertCspReport(db, row);
      console.log(
        `🛡️ CSP report: ${row.violatedDirective || '?'} blocked=${row.blockedUri || '(none)'} doc=${row.documentUri || '?'}`
      );
    }
    if (rows.length > 0) {
      await cspQueries.pruneCspReports(db);
    }
  } catch (error) {
    console.error('CSP report ingest error:', error?.message || error);
  }
  return res.status(204).end();
});

adminRouter.get('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    const reports = await cspQueries.listCspReports(db, 100);
    const count = await cspQueries.countCspReports(db);
    res.json({ reports, count });
  } catch (error) {
    console.error('CSP reports list error:', error);
    res.status(500).json({ error: 'Failed to load CSP reports' });
  }
});

adminRouter.delete('/', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }
    await cspQueries.clearCspReports(db);
    res.json({ ok: true });
  } catch (error) {
    console.error('CSP reports clear error:', error);
    res.status(500).json({ error: 'Failed to clear CSP reports' });
  }
});

export { ingestRouter as cspIngestRouter, adminRouter as cspAdminRouter };
export default ingestRouter;
