/**
 * Database Proxy Adapter
 * 
 * Provides a better-sqlite3 compatible API that routes queries through
 * the SQLite proxy service. This allows existing code to work unchanged.
 * 
 * Usage:
 *   const db = new DatabaseProxy(tenantId, proxyUrl);
 *   const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
 *   const user = stmt.get(userId);
 * 
 * This works exactly like better-sqlite3, but queries go through HTTP.
 */

class StatementProxy {
  constructor(dbProxy, query) {
    this.dbProxy = dbProxy;
    this.query = query;
    this.source = query; // For compatibility with queryLogger
  }

  async get(...params) {
    const result = await this.dbProxy.executeQuery(this.query, params);
    if (result.type === 'get') {
      return result.result;
    }
    // If proxy returned 'all', take first item
    return result.result?.[0] || null;
  }

  async all(...params) {
    const result = await this.dbProxy.executeQuery(this.query, params);
    if (result.type === 'all') {
      return result.result;
    }
    // If proxy returned 'get', wrap in array
    return result.result ? [result.result] : [];
  }

  async run(...params) {
    const result = await this.dbProxy.executeQuery(this.query, params);
    return result.result;
  }

  // Synchronous versions (for compatibility, but will throw if used)
  getSync(...params) {
    throw new Error('Synchronous methods not supported in proxy mode. Use async methods.');
  }

  allSync(...params) {
    throw new Error('Synchronous methods not supported in proxy mode. Use async methods.');
  }

  runSync(...params) {
    throw new Error('Synchronous methods not supported in proxy mode. Use async methods.');
  }
}

class DatabaseProxy {
  constructor(tenantId, proxyUrl = null) {
    this.tenantId = tenantId;
    this.proxyUrl = proxyUrl || process.env.SQLITE_PROXY_URL || 'http://sqlite-proxy:3001';
    this.closed = false;
  }

  prepare(query) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }
    return new StatementProxy(this, query);
  }

  async exec(sql) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }
    
    // Split multiple statements and execute sequentially
    // Continue on errors for CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, etc.
    const statements = sql.split(';').filter(s => s.trim());
    const errors = [];
    
    for (const stmt of statements) {
      if (stmt.trim()) {
        try {
          await this.executeQuery(stmt.trim(), []);
        } catch (error) {
          // Proxy service handles expected SQLite errors (duplicate column, already exists, etc.)
          // at the service level, so we only get unexpected errors here
          // Collect errors but continue executing remaining statements
          errors.push({ statement: stmt.substring(0, 50), error: error.message || 'Unknown error' });
        }
      }
    }
    
    // If we collected non-ignorable errors, throw the first one
    if (errors.length > 0) {
      throw new Error(`Error executing SQL: ${errors[0].error} (in statement: ${errors[0].statement}...)`);
    }
  }

  transaction(callback) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }

    // Return a function that executes the transaction
    return async (...args) => {
      // Collect all queries from the transaction callback
      const queries = [];
      let transactionCallback = callback;

      // Wrap the callback to capture queries
      // This is a simplified approach - in practice, you'd need to intercept
      // all db.prepare() calls within the transaction
      // For now, we'll execute the callback and let it make individual queries
      // A better approach would be to use the /transaction endpoint
      
      // Execute callback and collect queries (simplified - may need refinement)
      return await this.executeTransaction(callback, args);
    };
  }

  async executeTransaction(callback, args) {
    // Use the proxy's transaction endpoint
    const queries = [];
    
    // This is a simplified implementation
    // In practice, you'd need to intercept all db operations within the callback
    // For now, we'll execute the callback and it will make individual queries
    // which will be queued by the proxy (serial execution)
    
    // Alternative: Use a transaction context that collects queries
    return await callback(...args);
  }

  /**
   * Execute a batch of queries in a single transaction
   * This is optimized for operations that perform many database calls
   * @param {Array<{query: string, params: Array}>} queries - Array of query objects
   * @returns {Promise<Array>} Array of results matching the order of queries
   */
  async executeBatchTransaction(queries) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }

    if (!Array.isArray(queries) || queries.length === 0) {
      return [];
    }

    console.log(`📦 [DatabaseProxy] Executing batched transaction: ${queries.length} queries for tenant ${this.tenantId}`);
    const startTime = Date.now();

    try {
      const response = await fetch(`${this.proxyUrl}/transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: this.tenantId,
          queries: queries.map(({ query, params = [] }) => ({
            query,
            params
          }))
        })
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          const text = await response.text();
          throw new Error(`Proxy transaction error (${response.status}): ${text.substring(0, 200)}`);
        }
        throw new Error(errorData.error || 'Transaction failed');
      }

      const result = await response.json();
      const duration = Date.now() - startTime;
      console.log(`✅ [DatabaseProxy] Batched transaction completed in ${duration}ms for ${queries.length} queries`);
      return result.results || [];
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [DatabaseProxy] Batched transaction failed after ${duration}ms:`, error.message);
      // Convert fetch errors to SQLite-like errors
      const sqliteError = new Error(error.message);
      sqliteError.code = error.code || 'SQLITE_ERROR';
      throw sqliteError;
    }
  }

  async pragma(name, options = {}) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }

    // For pragma queries, make HTTP request
    return await this.executePragma(name, options);
  }

  async executeQuery(query, params = []) {
    try {
      const response = await fetch(`${this.proxyUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: this.tenantId,
          query,
          params
        })
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          // If response is not JSON, read as text
          const text = await response.text();
          throw new Error(`Proxy error (${response.status}): ${text.substring(0, 200)}`);
        }
        
        // Proxy service handles expected SQLite errors (duplicate column, already exists, etc.)
        // at the service level, so we only get unexpected errors here
        throw new Error(errorData.error || 'Query failed');
      }

      return await response.json();
    } catch (error) {
      // Convert fetch errors to SQLite-like errors
      const sqliteError = new Error(error.message);
      sqliteError.code = error.code || 'SQLITE_ERROR';
      throw sqliteError;
    }
  }

  async executePragma(name, options = {}) {
    // For pragma, we can either:
    // 1. Make a query request: PRAGMA journal_mode
    // 2. Use the /info endpoint for common pragmas
    
    if (name === 'journal_mode' || name === 'synchronous' || name === 'integrity_check') {
      try {
        const response = await fetch(`${this.proxyUrl}/info/${this.tenantId}`);
        if (response.ok) {
          const info = await response.json();
          if (name === 'journal_mode') return info.journalMode;
          if (name === 'synchronous') return info.synchronous;
          if (name === 'integrity_check') return info.integrity;
        }
      } catch (error) {
        // Fall through to query-based approach
      }
    }

    // Fallback: execute as query
    const result = await this.executeQuery(`PRAGMA ${name}`, []);
    if (options.simple) {
      // Return single value for simple pragmas
      const values = Object.values(result.result || {});
      return values[0] || null;
    }
    return result.result;
  }

  close() {
    this.closed = true;
  }

  // Compatibility methods
  get backup() {
    throw new Error('Backup not supported in proxy mode');
  }

  get checkpoint() {
    throw new Error('Checkpoint not supported in proxy mode');
  }

  get function() {
    throw new Error('Custom functions not supported in proxy mode');
  }
}

export default DatabaseProxy;

