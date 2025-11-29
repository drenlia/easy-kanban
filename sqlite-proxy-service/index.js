/**
 * SQLite Proxy Service
 * 
 * Standalone service for Easy Kanban multi-tenant deployments.
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

// Configuration for query logging
const LOG_SLOW_QUERIES = process.env.LOG_SLOW_QUERIES !== 'false'; // Default: true
const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '100', 10); // Default: 100ms
const LOG_ALL_QUERIES = process.env.LOG_ALL_QUERIES === 'true'; // Default: false (only log slow queries)

// Execute query with queuing (ensures serial execution per tenant)
async function executeQuery(tenantId, query, params = []) {
  // Get or create queue for this tenant
  if (!queryQueues.has(tenantId)) {
    queryQueues.set(tenantId, Promise.resolve());
  }
  
  // Queue this query to execute after previous ones
  const previousQuery = queryQueues.get(tenantId);
  const currentQuery = previousQuery.then(() => {
    const startTime = process.hrtime.bigint(); // High-resolution timer (nanoseconds)
    const db = getDatabase(tenantId);
    const queryUpper = query.trim().toUpperCase();
    
    try {
      const stmt = db.prepare(query);
      
      // Determine query type
      let result;
      if (queryUpper.startsWith('SELECT')) {
        if (queryUpper.includes('LIMIT 1') || queryUpper.match(/SELECT\s+\w+\s+FROM/)) {
          result = { type: 'get', result: stmt.get(...params) };
        } else {
          result = { type: 'all', result: stmt.all(...params) };
        }
      } else {
        result = { type: 'run', result: stmt.run(...params) };
      }
      
      // Calculate execution time (convert nanoseconds to milliseconds)
      const durationNs = process.hrtime.bigint() - startTime;
      const durationMs = Number(durationNs) / 1_000_000;
      
      // Log query execution time (only if enabled and meets threshold)
      if (LOG_SLOW_QUERIES && (LOG_ALL_QUERIES || durationMs >= SLOW_QUERY_THRESHOLD_MS)) {
        const queryPreview = query.length > 80 ? query.substring(0, 80) + '...' : query;
        console.log(`⏱️  [Proxy] Query took ${durationMs.toFixed(2)}ms (tenant: ${tenantId}): ${queryPreview}`);
      }
      
      return result;
    } catch (error) {
      // Handle expected SQLite errors for schema operations
      // These are normal for existing databases and should not propagate as errors
      const errorMsg = (error.message || '').toLowerCase();
      const isSchemaOperation = queryUpper.startsWith('CREATE') || 
                                 queryUpper.startsWith('ALTER') ||
                                 queryUpper.startsWith('DROP');
      
      // For CREATE/ALTER/DROP operations, ignore "already exists" and "duplicate" errors
      // These are expected when running schema initialization on existing databases
      if (isSchemaOperation && (
          errorMsg.includes('duplicate column name') ||
          errorMsg.includes('duplicate column') ||
          errorMsg.includes('duplicate table') ||
          errorMsg.includes('already exists') ||
          errorMsg.includes('duplicate index')
        )) {
        // Return success for CREATE/ALTER/DROP operations that fail due to existing schema
        // This allows schema initialization to be idempotent
        console.log(`ℹ️  Schema operation skipped (already exists): ${query.substring(0, 80)}...`);
        return { type: 'run', result: { changes: 0, lastInsertRowid: null } };
      }
      
      // Re-throw unexpected errors
      throw error;
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
  const { tenantId, query, params = [] } = req.body;
  
  try {
    if (!tenantId || !query) {
      return res.status(400).json({ 
        error: 'Missing required fields: tenantId and query' 
      });
    }
    
    // Validate query (prevent dangerous operations)
    // Allow safe ALTER operations (ADD COLUMN), but block destructive ones
    const queryUpper = query.trim().toUpperCase();
    
    // Block dangerous operations (check for SQL commands, not words in identifiers)
    // Use word boundaries or specific patterns to avoid false positives
    if (queryUpper.includes('DROP TABLE') || 
        queryUpper.includes('DROP INDEX') || 
        queryUpper.includes('DROP VIEW') || 
        queryUpper.includes('DROP TRIGGER') ||
        (queryUpper.includes('ALTER TABLE') && queryUpper.includes('DROP')) ||
        queryUpper.startsWith('ATTACH ') ||  // Only block if ATTACH is at start (SQL command)
        queryUpper.includes(' ATTACH ') ||   // Or if ATTACH is a separate word
        queryUpper.startsWith('DETACH ') ||  // Only block if DETACH is at start
        queryUpper.includes(' DETACH ') ||   // Or if DETACH is a separate word
        queryUpper.startsWith('VACUUM') ||    // VACUUM command
        queryUpper.includes(' VACUUM ')) {   // Or as separate word
      console.error(`🚫 Blocked dangerous query for tenant ${tenantId}: ${query.substring(0, 100)}...`);
      return res.status(403).json({ 
        error: 'Dangerous operations not allowed via proxy' 
      });
    }
    
    // Allow: CREATE, ALTER TABLE ... ADD COLUMN, INSERT, UPDATE, DELETE, SELECT, etc.
    
    const result = await executeQuery(tenantId, query, params);
    res.json(result);
    
  } catch (error) {
    // Log unexpected errors (expected errors are already handled in executeQuery)
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
    
    console.log(`📦 [Proxy] Received batched transaction: ${queries.length} queries for tenant ${tenantId}`);
    const startTime = process.hrtime.bigint(); // High-resolution timer
    
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
    
    // Calculate execution time (convert nanoseconds to milliseconds)
    const durationNs = process.hrtime.bigint() - startTime;
    const durationMs = Number(durationNs) / 1_000_000;
    console.log(`✅ [Proxy] Batched transaction completed in ${durationMs.toFixed(2)}ms for ${queries.length} queries (tenant: ${tenantId})`);
    
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
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Database path: ${process.env.DB_BASE_PATH || '/app/server/data'}`);
  console.log(`⏱️  Slow query logging: ${LOG_SLOW_QUERIES ? 'enabled' : 'disabled'} (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`);
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

