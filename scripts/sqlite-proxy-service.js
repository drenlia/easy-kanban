/**
 * SQLite Proxy Service
 * 
 * This service acts as a middleware/proxy for SQLite databases.
 * It ensures only one connection per database, preventing NFS locking issues.
 * 
 * Architecture:
 * - All pods send SQL queries to this service via HTTP
 * - Service maintains one connection pool per tenant database
 * - Queries are queued and executed serially per database
 * 
 * Deployment:
 * - Deploy as a separate Kubernetes service
 * - Easy-kanban pods connect to it instead of opening direct DB connections
 */

import express from 'express';
import Database from 'better-sqlite3';
import { join } from 'path';

const app = express();
app.use(express.json());

// Connection pool: tenantId -> Database instance
const dbPool = new Map();

// Query queue per tenant (prevents concurrent writes)
const queryQueues = new Map();

// Get or create database connection for tenant
function getDatabase(tenantId) {
  if (dbPool.has(tenantId)) {
    return dbPool.get(tenantId);
  }

  const basePath = process.env.DB_BASE_PATH || '/app/server/data';
  const dbPath = join(basePath, 'tenants', tenantId, 'kanban.db');
  
  // Enable WAL mode for better concurrency
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL'); // Faster than FULL, still safe with WAL
  
  dbPool.set(tenantId, db);
  console.log(`✅ Opened database connection for tenant: ${tenantId}`);
  
  return db;
}

// Execute query with queuing (ensures serial execution per tenant)
async function executeQuery(tenantId, query, params = []) {
  // Get or create queue for this tenant
  if (!queryQueues.has(tenantId)) {
    queryQueues.set(tenantId, Promise.resolve());
  }
  
  // Queue this query to execute after previous ones
  const previousQuery = queryQueues.get(tenantId);
  const currentQuery = previousQuery.then(() => {
    const db = getDatabase(tenantId);
    const stmt = db.prepare(query);
    
    // Determine query type
    const queryUpper = query.trim().toUpperCase();
    if (queryUpper.startsWith('SELECT')) {
      if (queryUpper.includes('LIMIT 1') || queryUpper.match(/SELECT\s+\w+\s+FROM/)) {
        return { type: 'get', result: stmt.get(...params) };
      }
      return { type: 'all', result: stmt.all(...params) };
    } else {
      return { type: 'run', result: stmt.run(...params) };
    }
  });
  
  queryQueues.set(tenantId, currentQuery);
  return currentQuery;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    connections: dbPool.size,
    timestamp: new Date().toISOString()
  });
});

// Execute SQL query endpoint
app.post('/query', async (req, res) => {
  try {
    const { tenantId, query, params = [] } = req.body;
    
    if (!tenantId || !query) {
      return res.status(400).json({ 
        error: 'Missing required fields: tenantId and query' 
      });
    }
    
    // Validate query (prevent dangerous operations)
    const queryUpper = query.trim().toUpperCase();
    const dangerous = ['DROP', 'ALTER', 'ATTACH', 'DETACH', 'VACUUM'];
    if (dangerous.some(cmd => queryUpper.includes(cmd))) {
      return res.status(403).json({ 
        error: 'Dangerous operations not allowed via proxy' 
      });
    }
    
    const result = await executeQuery(tenantId, query, params);
    res.json(result);
    
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ 
      error: error.message,
      code: error.code 
    });
  }
});

// Transaction endpoint (for multi-statement operations)
app.post('/transaction', async (req, res) => {
  try {
    const { tenantId, queries } = req.body;
    
    if (!tenantId || !Array.isArray(queries)) {
      return res.status(400).json({ 
        error: 'Missing required fields: tenantId and queries array' 
      });
    }
    
    const db = getDatabase(tenantId);
    const results = db.transaction(() => {
      return queries.map(({ query, params = [] }) => {
        const stmt = db.prepare(query);
        const queryUpper = query.trim().toUpperCase();
        
        if (queryUpper.startsWith('SELECT')) {
          if (queryUpper.includes('LIMIT 1')) {
            return stmt.get(...params);
          }
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      });
    })();
    
    res.json({ results });
    
  } catch (error) {
    console.error('Transaction error:', error);
    res.status(500).json({ 
      error: error.message,
      code: error.code 
    });
  }
});

// Get database info
app.get('/info/:tenantId', (req, res) => {
  try {
    const { tenantId } = req.params;
    const db = getDatabase(tenantId);
    
    const info = {
      tenantId,
      journalMode: db.pragma('journal_mode', { simple: true }),
      synchronous: db.pragma('synchronous', { simple: true }),
      integrity: db.pragma('integrity_check', { simple: true })
    };
    
    res.json(info);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 SQLite Proxy Service listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down SQLite Proxy Service...');
  dbPool.forEach((db, tenantId) => {
    db.close();
    console.log(`✅ Closed database connection for tenant: ${tenantId}`);
  });
  process.exit(0);
});

