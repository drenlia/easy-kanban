/**
 * Async Database Helper
 * 
 * Provides async wrappers for database operations to support both
 * direct better-sqlite3 (sync), DatabaseProxy (async), and PostgreSQL (async) connections.
 * 
 * This allows Option 2 (full async) to work with all connection types.
 */

/**
 * Check if database is a proxy (async) or PostgreSQL (async)
 */
export function isProxyDatabase(db) {
  return db && (db.constructor.name === 'DatabaseProxy' || db.constructor.name === 'PostgresDatabase');
}

/**
 * Check if database is PostgreSQL
 */
export function isPostgresDatabase(db) {
  return db && db.constructor.name === 'PostgresDatabase';
}

/**
 * Convert SQLite SQL to PostgreSQL SQL
 * Handles common SQLite-specific functions and syntax
 */
export function convertSqlToPostgres(sql, isPostgres) {
  if (!isPostgres) return sql;
  
  let pgSql = sql;
  
  // Convert SQLite-specific syntax with PostgreSQL
  // INTEGER PRIMARY KEY AUTOINCREMENT -> SERIAL PRIMARY KEY
  pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  pgSql = pgSql.replace(/AUTOINCREMENT/gi, '');
  
  // DATETIME -> TIMESTAMPTZ
  pgSql = pgSql.replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ');
  
  // Convert json_object() to json_build_object()
  // Pattern: json_object('key1', value1, 'key2', value2, ...)
  pgSql = pgSql.replace(/json_object\s*\(/gi, 'json_build_object(');
  
  // Convert json_group_array() to json_agg()
  // Note: PostgreSQL's json_agg doesn't support DISTINCT directly in the same way
  // We need to handle DISTINCT CASE WHEN separately
  // Pattern: json_group_array(DISTINCT CASE WHEN ... THEN json_build_object(...) ELSE NULL END)
  // Becomes: json_agg(DISTINCT CASE WHEN ... THEN json_build_object(...) ELSE NULL END) FILTER (WHERE ... IS NOT NULL)
  // Actually, PostgreSQL's json_agg with DISTINCT works, but we need to handle NULL filtering
  pgSql = pgSql.replace(/json_group_array\s*\(\s*DISTINCT\s+CASE\s+WHEN\s+([^T]+)\s+THEN\s+json_build_object\([^)]+\)\s+ELSE\s+NULL\s+END\s*\)/gi, 
    (match, condition) => {
      // Extract the condition and wrap json_agg with FILTER
      return `json_agg(DISTINCT CASE WHEN ${condition.trim()} THEN json_build_object(...) ELSE NULL END) FILTER (WHERE ${condition.trim()} IS NOT NULL)`;
    });
  
  // Simple json_group_array() without DISTINCT CASE
  pgSql = pgSql.replace(/json_group_array\s*\(/gi, 'json_agg(');
  
  // Convert datetime() to PostgreSQL timestamp formatting
  // datetime(column) || 'Z' -> to_char(column, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  pgSql = pgSql.replace(/datetime\s*\(([^)]+)\)\s*\|\|\s*['"]Z['"]/gi, (match, column) => {
    return `to_char(${column.trim()}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
  });
  
  // Convert datetime() without || 'Z' to just the column (PostgreSQL timestamps are already ISO format)
  pgSql = pgSql.replace(/datetime\s*\(([^)]+)\)/gi, '$1');
  
  return pgSql;
}

/**
 * Execute a database operation (get, all, or run) with async support
 */
export async function dbGet(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy) || isPostgresDatabase(stmt.db)) {
    return await stmt.get(...params);
  }
  // Direct DB (better-sqlite3) - wrap sync call in Promise
  return Promise.resolve(stmt.get(...params));
}

export async function dbAll(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy) || isPostgresDatabase(stmt.db)) {
    return await stmt.all(...params);
  }
  return Promise.resolve(stmt.all(...params));
}

export async function dbRun(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy) || isPostgresDatabase(stmt.db)) {
    return await stmt.run(...params);
  }
  return Promise.resolve(stmt.run(...params));
}

/**
 * Execute db.exec() with async support
 * 
 * For proxy databases and PostgreSQL, this will execute statements sequentially.
 * Errors are thrown immediately if a statement fails.
 */
export async function dbExec(db, sql) {
  if (isProxyDatabase(db) || isPostgresDatabase(db)) {
    return await db.exec(sql);
  }
  // Direct DB (better-sqlite3) - sync execution
  return Promise.resolve(db.exec(sql));
}

/**
 * Execute db.pragma() with async support
 */
export async function dbPragma(db, name, options = {}) {
  if (isProxyDatabase(db) || isPostgresDatabase(db)) {
    return await db.pragma(name, options);
  }
  // For direct DB, pragma is sync but we wrap it
  const result = db.pragma(name, options);
  return Promise.resolve(result);
}

/**
 * Execute transaction with async support
 * 
 * For proxy databases and PostgreSQL: uses async transaction support
 * For direct databases: uses manual BEGIN/COMMIT/ROLLBACK since
 * better-sqlite3's transaction() doesn't support async callbacks
 */
export async function dbTransaction(db, callback) {
  if (isProxyDatabase(db) || isPostgresDatabase(db)) {
    // Proxy database or PostgreSQL supports async transactions
    const transactionFn = db.transaction(callback);
    return await transactionFn();
  }
  
  // Direct DB (better-sqlite3) - use manual transaction control
  // because transaction() doesn't support async callbacks
  try {
    db.exec('BEGIN');
    const result = await callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

