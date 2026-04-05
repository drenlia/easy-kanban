// Query logging system
let queryLogs = [];
let queryId = 0;

// Import async helpers to detect proxy databases
import { isProxyDatabase } from './dbAsync.js';
import { isServerDebugSqlEnabled } from './sqlDebugSettingsCache.js';

function resolveStmtDb(stmt) {
  return stmt.db || stmt.dbProxy || null;
}

function truncateSql(q, max = 220) {
  if (q == null) return '';
  const s = String(q).replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

function summarizeParams(args, maxLen = 240) {
  try {
    const s = JSON.stringify(args);
    return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
  } catch {
    return `[${args?.length ?? 0} params]`;
  }
}

function trimQueryLogs() {
  if (queryLogs.length > 100) {
    queryLogs = queryLogs.slice(-100);
  }
}

/**
 * @param {object} stmt
 * @param {string} logType GET|ALL|RUN|ERROR label
 * @param {string} queryText
 * @param {any[]} args
 * @param {() => Promise<any>} executor
 */
async function runLoggedQuery(stmt, logType, queryText, args, executor) {
  const db = resolveStmtDb(stmt);
  let sqlDebug = false;
  try {
    sqlDebug = await isServerDebugSqlEnabled(db);
  } catch {
    sqlDebug = false;
  }
  const t0 = Date.now();
  if (sqlDebug) {
    console.log(`[SERVER_DEBUG_SQL] → ${logType} ${truncateSql(queryText)} params=${summarizeParams(args)}`);
  }
  try {
    const result = await executor();
    if (sqlDebug) {
      console.log(`[SERVER_DEBUG_SQL] ← ${logType} ${Date.now() - t0}ms ok`);
    }
    return result;
  } catch (error) {
    if (sqlDebug) {
      console.log(`[SERVER_DEBUG_SQL] ✗ ${logType} ${Date.now() - t0}ms ${error.message}`);
    }
    throw error;
  }
}

// Function to wrap SQL queries with logging (supports both sync and async)
export function wrapQuery(stmt, type) {
  // Check if this is a proxy database (async) or direct DB (sync)
  const isProxy = stmt.dbProxy ? isProxyDatabase(stmt.dbProxy) : false;

  // For proxy databases, methods are already async
  // For direct databases, methods are sync but we wrap them
  const originalRun = stmt.run;
  const originalGet = stmt.get;
  const originalAll = stmt.all;

  if (isProxy) {
    // Proxy mode: wrap async methods
    stmt.run = async function (...args) {
      const id = (++queryId).toString();
      const queryText = stmt.source || stmt.query;
      const timestamp = new Date().toISOString();
      const logType = type || 'RUN';

      return runLoggedQuery(this, logType, queryText, args, async () => {
        try {
          const result = await originalRun.apply(this, args);

          queryLogs.push({
            id,
            type: logType,
            query: queryText,
            timestamp,
            params: args
          });
          trimQueryLogs();

          return result;
        } catch (error) {
          queryLogs.push({
            id,
            type: 'ERROR',
            query: queryText,
            timestamp,
            error: error.message,
            params: args
          });
          trimQueryLogs();

          throw error;
        }
      });
    };

    stmt.get = async function (...args) {
      const id = (++queryId).toString();
      const queryText = stmt.source || stmt.query;
      const timestamp = new Date().toISOString();

      return runLoggedQuery(this, 'GET', queryText, args, async () => {
        try {
          const result = await originalGet.apply(this, args);

          queryLogs.push({
            id,
            type: 'GET',
            query: queryText,
            timestamp,
            params: args
          });
          trimQueryLogs();

          return result;
        } catch (error) {
          queryLogs.push({
            id,
            type: 'ERROR',
            query: queryText,
            timestamp,
            error: error.message,
            params: args
          });
          trimQueryLogs();

          throw error;
        }
      });
    };

    stmt.all = async function (...args) {
      const id = (++queryId).toString();
      const queryText = stmt.source || stmt.query;
      const timestamp = new Date().toISOString();

      return runLoggedQuery(this, 'ALL', queryText, args, async () => {
        try {
          const result = await originalAll.apply(this, args);

          queryLogs.push({
            id,
            type: 'ALL',
            query: queryText,
            timestamp,
            params: args
          });
          trimQueryLogs();

          return result;
        } catch (error) {
          queryLogs.push({
            id,
            type: 'ERROR',
            query: queryText,
            timestamp,
            error: error.message,
            params: args
          });
          trimQueryLogs();

          throw error;
        }
      });
    };
  } else {
    // Direct DB mode: wrap sync methods as async (for consistency with proxy mode)
    stmt.run = async function (...args) {
      const id = (++queryId).toString();
      const queryText = stmt.source;
      const timestamp = new Date().toISOString();
      const logType = type || 'RUN';

      return runLoggedQuery(this, logType, queryText, args, async () => {
        return new Promise((resolve, reject) => {
          try {
            const result = originalRun.apply(this, args);

            queryLogs.push({
              id,
              type: logType,
              query: queryText,
              timestamp,
              params: args
            });
            trimQueryLogs();

            resolve(result);
          } catch (error) {
            queryLogs.push({
              id,
              type: 'ERROR',
              query: queryText,
              timestamp,
              error: error.message,
              params: args
            });
            trimQueryLogs();

            reject(error);
          }
        });
      });
    };

    stmt.get = async function (...args) {
      const id = (++queryId).toString();
      const queryText = stmt.source;
      const timestamp = new Date().toISOString();

      return runLoggedQuery(this, 'GET', queryText, args, async () => {
        return new Promise((resolve, reject) => {
          try {
            const result = originalGet.apply(this, args);

            queryLogs.push({
              id,
              type: 'GET',
              query: queryText,
              timestamp,
              params: args
            });
            trimQueryLogs();

            resolve(result);
          } catch (error) {
            queryLogs.push({
              id,
              type: 'ERROR',
              query: queryText,
              timestamp,
              error: error.message,
              params: args
            });
            trimQueryLogs();

            reject(error);
          }
        });
      });
    };

    stmt.all = async function (...args) {
      const id = (++queryId).toString();
      const queryText = stmt.source;
      const timestamp = new Date().toISOString();

      return runLoggedQuery(this, 'ALL', queryText, args, async () => {
        return new Promise((resolve, reject) => {
          try {
            const result = originalAll.apply(this, args);

            queryLogs.push({
              id,
              type: 'ALL',
              query: queryText,
              timestamp,
              params: args
            });
            trimQueryLogs();

            resolve(result);
          } catch (error) {
            queryLogs.push({
              id,
              type: 'ERROR',
              query: queryText,
              timestamp,
              error: error.message,
              params: args
            });
            trimQueryLogs();

            reject(error);
          }
        });
      });
    };
  }

  return stmt;
}

// Get query logs
export function getQueryLogs() {
  return [...queryLogs]; // Return a copy to prevent external modification
}

// Clear query logs
export function clearQueryLogs() {
  queryLogs = [];
  queryId = 0;
}

// Add manual log entry
export function addQueryLog(type, query, error = null) {
  const id = (++queryId).toString();
  const timestamp = new Date().toISOString();

  queryLogs.push({
    id,
    type,
    query,
    timestamp,
    ...(error && { error })
  });

  trimQueryLogs();
}
