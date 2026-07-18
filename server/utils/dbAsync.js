/**
 * Async Database Helpers (PostgreSQL-only)
 *
 * Thin wrappers around PostgresDatabase prepare/get/all/run/exec/transaction.
 * All operations are async; there is no better-sqlite3 / DatabaseProxy path.
 */

/**
 * Execute a prepared statement get()
 */
export async function dbGet(stmt, ...params) {
  return await stmt.get(...params);
}

/**
 * Execute a prepared statement all()
 */
export async function dbAll(stmt, ...params) {
  return await stmt.all(...params);
}

/**
 * Execute a prepared statement run()
 */
export async function dbRun(stmt, ...params) {
  return await stmt.run(...params);
}

/**
 * Execute raw SQL via db.exec()
 */
export async function dbExec(db, sql) {
  return await db.exec(sql);
}

/**
 * Execute db.pragma() if present; otherwise return null.
 * PostgresDatabase.pragma throws — callers should avoid PRAGMA.
 */
export async function dbPragma(db, name, options = {}) {
  if (db && typeof db.pragma === 'function') {
    return await db.pragma(name, options);
  }
  return null;
}

/**
 * Run callback inside a database transaction
 */
export async function dbTransaction(db, callback) {
  const transactionFn = db.transaction(callback);
  return await transactionFn();
}
