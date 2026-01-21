/**
 * PostgreSQL Database Adapter
 * 
 * Provides a better-sqlite3 compatible API for PostgreSQL connections.
 * This allows existing code to work unchanged when switching from SQLite to PostgreSQL.
 * 
 * Usage:
 *   const db = new PostgresDatabase(tenantId);
 *   const stmt = db.prepare('SELECT * FROM users WHERE id = $1');
 *   const user = await stmt.get(userId);
 * 
 * Differences from SQLite:
 * - Parameter placeholders: $1, $2, $3 instead of ?
 * - All methods are async
 * - Schema support for multi-tenant mode
 */

import pg from 'pg';
const { Pool, Client } = pg;

class PostgresStatement {
  constructor(db, query) {
    this.db = db;
    // Convert SQLite syntax to PostgreSQL syntax
    this.query = db.convertSqliteToPostgres(query);
    this.source = query; // For compatibility with queryLogger (keep original)
    this.dbProxy = db; // For compatibility with dbAsync.js
  }

  // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, $3
  convertPlaceholders(query, params) {
    if (params.length === 0) return { query, params };
    
    let paramIndex = 1;
    const convertedQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
    return { query: convertedQuery, params };
  }

  async get(...params) {
    const { query, params: convertedParams } = this.convertPlaceholders(this.query, params);
    const client = await this.db.getClient();
    try {
      const result = await client.query(query, convertedParams);
      return result.rows[0] || null;
    } finally {
      this.db.releaseClient(client);
    }
  }

  async all(...params) {
    const { query, params: convertedParams } = this.convertPlaceholders(this.query, params);
    const client = await this.db.getClient();
    try {
      const result = await client.query(query, convertedParams);
      return result.rows;
    } finally {
      this.db.releaseClient(client);
    }
  }

  async run(...params) {
    const { query, params: convertedParams } = this.convertPlaceholders(this.query, params);
    const client = await this.db.getClient();
    try {
      const result = await client.query(query, convertedParams);
      // Return object similar to better-sqlite3's run() result
      return {
        changes: result.rowCount || 0,
        lastInsertRowid: result.rows[0]?.id || null
      };
    } finally {
      this.db.releaseClient(client);
    }
  }

  // Synchronous versions (not supported, throw error for compatibility)
  getSync(...params) {
    throw new Error('Synchronous methods not supported in PostgreSQL. Use async methods.');
  }

  allSync(...params) {
    throw new Error('Synchronous methods not supported in PostgreSQL. Use async methods.');
  }

  runSync(...params) {
    throw new Error('Synchronous methods not supported in PostgreSQL. Use async methods.');
  }
}

class PostgresDatabase {
  constructor(tenantId = null, options = {}) {
    this.tenantId = tenantId;
    this.closed = false;
    this.schema = tenantId && process.env.MULTI_TENANT === 'true' ? `tenant_${tenantId}` : 'public';
    this.transactionClient = null; // Client used for current transaction (if any)
    
    // Connection configuration
    const config = {
      host: options.host || process.env.POSTGRES_HOST || 'localhost',
      port: options.port || parseInt(process.env.POSTGRES_PORT || '5432'),
      database: options.database || process.env.POSTGRES_DB || 'kanban',
      user: options.user || process.env.POSTGRES_USER || 'postgres',
      password: options.password || process.env.POSTGRES_PASSWORD || 'postgres',
      // Connection pool settings
      max: options.max || 20, // Maximum number of clients in the pool
      idleTimeoutMillis: options.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: options.connectionTimeoutMillis || 10000, // Increased to 10 seconds
    };

    // Use Pool for better connection management
    this.pool = new Pool(config);
  }

  // Get a client from the pool
  // If we're in a transaction, return the transaction client
  async getClient() {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }
    
    // If we're in a transaction, use the transaction client
    if (this.transactionClient) {
      return this.transactionClient;
    }
    
    // Otherwise, get a fresh client from the pool
    const client = await this.pool.connect();
    
    // Set search_path for multi-tenant mode (must be set for each client)
    if (this.schema !== 'public') {
      // Quote schema name to handle special characters (like hyphens in tenant IDs)
      const quotedSchema = `"${this.schema}"`;
      await client.query(`SET search_path TO ${quotedSchema}, public`);
    }
    
    return client;
  }
  
  // Release a client back to the pool
  // Don't release transaction clients - they're released when the transaction ends
  releaseClient(client) {
    if (client && client !== this.transactionClient) {
      client.release();
    }
  }

  prepare(query) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }
    // Automatically convert SQLite SQL to PostgreSQL SQL
    const convertedQuery = this.convertSqliteToPostgres(query);
    return new PostgresStatement(this, convertedQuery);
  }
  
  // Convert SQLite SQL to PostgreSQL SQL automatically
  // This allows route files to use SQLite syntax and have it automatically converted
  convertSqliteToPostgres(sql) {
    let pgSql = sql;
    
    // Convert SQLite-specific syntax with PostgreSQL
    // INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY
    pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    pgSql = pgSql.replace(/AUTOINCREMENT/gi, '');
    
    // DATETIME -> TIMESTAMPTZ
    pgSql = pgSql.replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ');
    
    // Convert json_object() to json_build_object()
    pgSql = pgSql.replace(/json_object\s*\(/gi, 'json_build_object(');
    
    // Convert json_group_array() to json_agg()
    // Note: We remove DISTINCT as PostgreSQL can't use DISTINCT on JSON directly
    // Deduplication should be handled in application code
    pgSql = pgSql.replace(/json_group_array\s*\(\s*DISTINCT\s+/gi, 'json_agg(');
    pgSql = pgSql.replace(/json_group_array\s*\(/gi, 'json_agg(');
    
    // Convert datetime() to PostgreSQL timestamp formatting
    // datetime(column) || 'Z' -> to_char(column, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    pgSql = pgSql.replace(/datetime\s*\(([^)]+)\)\s*\|\|\s*['"]Z['"]/gi, (match, column) => {
      return `to_char(${column.trim()}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
    });
    
    // Convert datetime() without || 'Z' to just the column (PostgreSQL timestamps are already ISO format)
    pgSql = pgSql.replace(/datetime\s*\(([^)]+)\)/gi, '$1');
    
    // Convert datetime('now') to CURRENT_TIMESTAMP
    pgSql = pgSql.replace(/datetime\s*\(\s*['"]now['"]\s*\)/gi, 'CURRENT_TIMESTAMP');
    
    // Convert boolean comparisons: is_active = 1 -> is_active = true, is_active = 0 -> is_active = false
    // This handles common boolean column patterns: is_*, *_active, shared, used, force_logout
    // Pattern: column_name = 0 or column_name = 1 (with word boundaries to avoid matching in numbers)
    const booleanColumns = [
      'is_active', 'is_finished', 'is_archived', 'is_deleted', 'is_completed',
      'shared', 'used', 'force_logout'
    ];
    
    // Convert = 1 to = true for boolean columns
    booleanColumns.forEach(col => {
      // Match column name followed by = 1 (with word boundaries)
      const pattern1 = new RegExp(`\\b${col}\\s*=\\s*1\\b`, 'gi');
      pgSql = pgSql.replace(pattern1, `${col} = true`);
      
      // Match column name followed by = 0 (with word boundaries)
      const pattern0 = new RegExp(`\\b${col}\\s*=\\s*0\\b`, 'gi');
      pgSql = pgSql.replace(pattern0, `${col} = false`);
    });
    
    // Also handle generic is_* patterns (catch any is_* column we might have missed)
    pgSql = pgSql.replace(/\b(is_\w+)\s*=\s*1\b/gi, '$1 = true');
    pgSql = pgSql.replace(/\b(is_\w+)\s*=\s*0\b/gi, '$1 = false');
    
    // Convert INSERT OR REPLACE to INSERT ... ON CONFLICT DO UPDATE
    // Pattern: INSERT OR REPLACE INTO table (cols) VALUES (...) -> INSERT INTO table (cols) VALUES (...) ON CONFLICT (key) DO UPDATE SET ...
    // This handles both simple and complex INSERT OR REPLACE statements, including multi-line SQL
    // Use [\s\S] to match any character including newlines, with non-greedy matching
    pgSql = pgSql.replace(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([\s\S]+?)\)\s+VALUES\s*\(([\s\S]+?)\)/gi, (match, table, columns, values) => {
      // Extract column names (handle newlines and whitespace)
      const colNames = columns.split(',').map(col => col.trim().replace(/\s+/g, ' '));
      const firstCol = colNames[0]; // First column is usually the primary key
      
      // Build UPDATE SET clause for all columns except the first (conflict key)
      const updateClause = colNames.slice(1).map(col => {
        return `${col} = EXCLUDED.${col}`;
      }).join(', ');
      
      // Preserve the original VALUES clause (may contain CURRENT_TIMESTAMP or other expressions)
      // Normalize whitespace in columns and values for cleaner output
      const normalizedColumns = columns.replace(/\s+/g, ' ').trim();
      const normalizedValues = values.replace(/\s+/g, ' ').trim();
      
      return `INSERT INTO ${table} (${normalizedColumns}) VALUES (${normalizedValues}) ON CONFLICT (${firstCol}) DO UPDATE SET ${updateClause}`;
    });
    
    // Handle column name case sensitivity
    // PostgreSQL lowercases unquoted identifiers, and our migrated schema has lowercase columns
    // So we need to convert camelCase column references to lowercase
    // Pattern: Match camelCase identifiers (starts with lowercase, contains uppercase)
    // But avoid SQL keywords, function names, and string literals
    
    // Common SQL keywords and functions to avoid converting
    const sqlKeywords = new Set([
      'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'AND', 'OR', 'NOT',
      'IN', 'IS', 'NULL', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'GROUP', 'BY', 'ORDER', 'LIMIT', 'OFFSET',
      'INSERT', 'UPDATE', 'DELETE', 'SET', 'VALUES', 'INTO', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX',
      'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CONSTRAINT', 'UNIQUE', 'CHECK', 'DEFAULT', 'TRUE', 'FALSE',
      'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'COALESCE', 'CURRENT_TIMESTAMP', 'CURRENT_DATE',
      'json_build_object', 'json_agg', 'to_char', 'CAST', 'CONVERT'
    ]);
    
    // Convert camelCase column names to lowercase
    // Match: word boundary + lowercase letter + any chars + uppercase letter + any chars + word boundary
    // But exclude if it's a keyword, in quotes, or part of a function call
    const camelCasePattern = /\b([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)\b/g;
    pgSql = pgSql.replace(camelCasePattern, (match, identifier, offset) => {
      // Don't convert if it's a SQL keyword
      if (sqlKeywords.has(identifier.toUpperCase())) {
        return match;
      }
      
      // Check if we're inside a string literal
      const before = pgSql.substring(0, offset);
      const singleQuotes = (before.match(/'/g) || []).length;
      const doubleQuotes = (before.match(/"/g) || []).length;
      const isInString = (singleQuotes % 2 !== 0) || (doubleQuotes % 2 !== 0);
      
      if (isInString) {
        return match; // Don't convert if inside a string
      }
      
      // Check if already quoted (don't convert quoted identifiers)
      if (offset > 0 && pgSql[offset - 1] === '"' && 
          offset + match.length < pgSql.length && pgSql[offset + match.length] === '"') {
        return match; // Already quoted, keep as is
      }
      
      // Check if it's part of a function call (e.g., json_build_object('id', ...))
      const beforeMatch = pgSql.substring(Math.max(0, offset - 50), offset);
      const isFunctionCall = /[a-zA-Z_]\s*\([^)]*$/.test(beforeMatch);
      if (isFunctionCall) {
        return match; // Don't convert function parameters
      }
      
      // Convert camelCase to lowercase
      return identifier.toLowerCase();
    });
    
    return pgSql;
  }

  async exec(sql) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }
    
    const client = await this.getClient();
    
    try {
      // Split multiple statements and execute sequentially
      // PostgreSQL doesn't support multiple statements in a single query, so we split them
      const statements = sql.split(';').filter(s => s.trim());
      const errors = [];
      
      for (const stmt of statements) {
        if (stmt.trim()) {
          // Remove comment lines from the beginning of statements
          // Comments can appear before CREATE TABLE statements
          let cleaned = stmt.trim();
          // Remove leading comment lines (lines starting with --)
          const lines = cleaned.split('\n');
          const nonCommentLines = [];
          for (const line of lines) {
            const trimmedLine = line.trim();
            // Skip pure comment lines, but keep everything else
            if (trimmedLine && !trimmedLine.startsWith('--')) {
              nonCommentLines.push(line);
            }
          }
          cleaned = nonCommentLines.join('\n').trim();
          
          // Skip empty statements after removing comments
          if (!cleaned) {
            continue;
          }
          
          // Skip pure comment statements
          if (cleaned.startsWith('--')) {
            continue;
          }
          
          try {
            // Log CREATE TABLE statements for debugging
            if (cleaned.toUpperCase().startsWith('CREATE TABLE')) {
              const tableMatch = cleaned.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["']?(\w+)["']?/i);
              if (tableMatch) {
                console.log(`🔧 Executing CREATE TABLE for: ${tableMatch[1]}`);
              }
            }
            
            // Convert SQLite syntax to PostgreSQL
            const pgSql = this.convertSqliteToPostgres(cleaned);
            
            await client.query(pgSql);
          } catch (error) {
            // Ignore errors for CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, etc.
            // PostgreSQL doesn't have IF NOT EXISTS for all statements, so we check error codes
            if (error.code === '42P07' || error.code === '42710') {
              // Table/index already exists - ignore
              continue;
            }
            
            // Log the error for debugging (but continue executing remaining statements)
            console.error(`❌ SQL execution error (code: ${error.code}): ${error.message}`);
            console.error(`   Statement: ${cleaned.substring(0, 200)}...`);
            
            // Collect other errors but continue executing remaining statements
            errors.push({ statement: cleaned.substring(0, 50), error: error.message || 'Unknown error', code: error.code });
          }
        }
      }
      
      // If we collected non-ignorable errors, throw the first one with all error details
      if (errors.length > 0) {
        const errorDetails = errors.map(e => `  - ${e.error} (code: ${e.code || 'unknown'}) in: ${e.statement}...`).join('\n');
        throw new Error(`Error executing SQL (${errors.length} error(s)):\n${errorDetails}`);
      }
    } finally {
      this.releaseClient(client);
    }
  }

  transaction(callback) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }

    // Return a function that executes the transaction
    return async (...args) => {
      // Get a client for this transaction
      const client = await this.pool.connect();
      
      // Set this as the transaction client so all queries use it
      this.transactionClient = client;
      
      try {
        // Set search_path for this transaction
        if (this.schema !== 'public') {
          // Quote schema name to handle special characters (like hyphens in tenant IDs)
          const quotedSchema = `"${this.schema}"`;
          await client.query(`SET LOCAL search_path TO ${quotedSchema}, public`);
        }
        
        await client.query('BEGIN');
        const result = await callback(...args);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        // Clear transaction client and release it
        this.transactionClient = null;
        client.release();
      }
    };
  }

  async pragma(name, options = {}) {
    if (this.closed) {
      throw new Error('Database connection is closed');
    }

    // PostgreSQL doesn't have PRAGMA, but we can simulate some common ones
    const client = await this.getClient();
    
    try {
      // Map common SQLite pragmas to PostgreSQL equivalents
      const pragmaMap = {
        'journal_mode': async () => {
          const result = await client.query("SHOW wal_level");
          return result.rows[0]?.wal_level || 'wal';
        },
        'synchronous': async () => {
          const result = await client.query("SHOW synchronous_commit");
          return result.rows[0]?.synchronous_commit || 'on';
        },
        'integrity_check': async () => {
          // PostgreSQL doesn't have a simple integrity check, return OK
          return { status: 'ok' };
        }
      };

      if (pragmaMap[name]) {
        return await pragmaMap[name]();
      }

      // For unknown pragmas, try to execute as a query
      try {
        const result = await client.query(`SELECT ${name} AS value`);
        if (options.simple) {
          return result.rows[0]?.value || null;
        }
        return result.rows[0] || null;
      } catch (error) {
        console.warn(`Pragma ${name} not supported in PostgreSQL:`, error.message);
        return null;
      }
    } finally {
      this.releaseClient(client);
    }
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

    console.log(`📦 [PostgresDatabase] Executing batched transaction: ${queries.length} queries`);
    const startTime = Date.now();

    const client = await this.pool.connect();
    
    try {
      // Set search_path for this transaction
      if (this.schema !== 'public') {
        // Quote schema name to handle special characters (like hyphens in tenant IDs)
        const quotedSchema = `"${this.schema}"`;
        await client.query(`SET LOCAL search_path TO ${quotedSchema}, public`);
      }
      
      await client.query('BEGIN');
      
      const results = [];
      for (const { query, params = [] } of queries) {
        // Convert SQLite ? placeholders to PostgreSQL $1, $2, $3
        const convertedQuery = this.convertPlaceholdersInQuery(query, params);
        const result = await client.query(convertedQuery.query, convertedQuery.params);
        results.push(result);
      }
      
      await client.query('COMMIT');
      
      const duration = Date.now() - startTime;
      console.log(`✅ [PostgresDatabase] Batched transaction completed in ${duration}ms for ${queries.length} queries`);
      
      return results;
    } catch (error) {
      await client.query('ROLLBACK');
      const duration = Date.now() - startTime;
      console.error(`❌ [PostgresDatabase] Batched transaction failed after ${duration}ms:`, error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  // Helper to convert SQLite ? placeholders to PostgreSQL $1, $2, $3
  convertPlaceholdersInQuery(query, params) {
    if (params.length === 0) return { query, params };
    
    let paramIndex = 1;
    const convertedQuery = query.replace(/\?/g, () => `$${paramIndex++}`);
    return { query: convertedQuery, params };
  }

  async close() {
    await this.pool.end();
    this.closed = true;
  }

  // Compatibility methods
  get backup() {
    throw new Error('Backup not supported in PostgreSQL adapter');
  }

  get checkpoint() {
    throw new Error('Checkpoint not supported in PostgreSQL adapter');
  }

  get function() {
    throw new Error('Custom functions not supported in PostgreSQL adapter');
  }

  // Helper method to ensure schema exists (for multi-tenant mode)
  async ensureSchema() {
    if (this.schema === 'public') {
      return; // Public schema always exists
    }

    const adminClient = await this.pool.connect();
    try {
      // Create schema if it doesn't exist
      // Quote schema name to handle special characters (like hyphens in tenant IDs)
      const quotedSchema = `"${this.schema}"`;
      await adminClient.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`);
      console.log(`✅ Schema '${this.schema}' ready for tenant: ${this.tenantId}`);
    } catch (error) {
      if (error.code !== '42P06') { // Schema already exists
        throw error;
      }
    } finally {
      adminClient.release();
    }
  }
}

export default PostgresDatabase;

