/**
 * Async Database Helper
 * 
 * Provides async wrappers for database operations to support both
 * direct better-sqlite3 (sync) and DatabaseProxy (async) connections.
 * 
 * This allows Option 2 (full async) to work with both connection types.
 */

/**
 * Check if database is a proxy (async) or direct (sync)
 */
export function isProxyDatabase(db) {
  return db && db.constructor.name === 'DatabaseProxy';
}

/**
 * Execute a database operation (get, all, or run) with async support
 */
export async function dbGet(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy)) {
    return await stmt.get(...params);
  }
  // Direct DB (better-sqlite3) - wrap sync call in Promise
  return Promise.resolve(stmt.get(...params));
}

export async function dbAll(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy)) {
    return await stmt.all(...params);
  }
  return Promise.resolve(stmt.all(...params));
}

export async function dbRun(stmt, ...params) {
  if (isProxyDatabase(stmt.dbProxy)) {
    return await stmt.run(...params);
  }
  return Promise.resolve(stmt.run(...params));
}

/**
 * Execute db.exec() with async support
 * 
 * For proxy databases, this will execute statements sequentially.
 * Errors are thrown immediately if a statement fails.
 */
export async function dbExec(db, sql) {
  if (isProxyDatabase(db)) {
    return await db.exec(sql);
  }
  // Direct DB (better-sqlite3) - sync execution
  return Promise.resolve(db.exec(sql));
}

/**
 * Execute db.pragma() with async support
 */
export async function dbPragma(db, name, options = {}) {
  if (isProxyDatabase(db)) {
    return await db.pragma(name, options);
  }
  // For direct DB, pragma is sync but we wrap it
  const result = db.pragma(name, options);
  return Promise.resolve(result);
}

/**
 * Execute transaction with async support
 * 
 * For proxy databases: uses async transaction support
 * For direct databases: uses manual BEGIN/COMMIT/ROLLBACK since
 * better-sqlite3's transaction() doesn't support async callbacks
 */
export async function dbTransaction(db, callback) {
  if (isProxyDatabase(db)) {
    // Proxy database supports async transactions
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

