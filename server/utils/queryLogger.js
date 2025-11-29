// Query logging system
let queryLogs = [];
let queryId = 0;

// Import async helpers to detect proxy databases
import { isProxyDatabase } from './dbAsync.js';

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
    stmt.run = async function(...args) {
      const id = ++queryId;
      const query = stmt.source || stmt.query;
      const timestamp = new Date().toISOString();

      try {
        const result = await originalRun.apply(this, args);
        
        // Log successful query
        queryLogs.push({
          id: id.toString(),
          type: type || 'RUN',
          query,
          timestamp,
          params: args
        });
        
        // Keep only last 100 logs to prevent memory issues
        if (queryLogs.length > 100) {
          queryLogs = queryLogs.slice(-100);
        }
        
        return result;
      } catch (error) {
        // Log failed query
        queryLogs.push({
          id: id.toString(),
          type: 'ERROR',
          query,
          timestamp,
          error: error.message,
          params: args
        });
        
        if (queryLogs.length > 100) {
          queryLogs = queryLogs.slice(-100);
        }
        
        throw error;
      }
    };

    stmt.get = async function(...args) {
      const id = ++queryId;
      const query = stmt.source || stmt.query;
      const timestamp = new Date().toISOString();

      try {
        const result = await originalGet.apply(this, args);
        
        queryLogs.push({
          id: id.toString(),
          type: 'GET',
          query,
          timestamp,
          params: args
        });
        
        if (queryLogs.length > 100) {
          queryLogs = queryLogs.slice(-100);
        }
        
        return result;
      } catch (error) {
        queryLogs.push({
          id: id.toString(),
          type: 'ERROR',
          query,
          timestamp,
          error: error.message,
          params: args
        });
        
        if (queryLogs.length > 100) {
          queryLogs = queryLogs.slice(-100);
        }
        
        throw error;
      }
    };

    stmt.all = async function(...args) {
      const id = ++queryId;
      const query = stmt.source || stmt.query;
      const timestamp = new Date().toISOString();

      try {
        const result = await originalAll.apply(this, args);
        
        queryLogs.push({
          id: id.toString(),
          type: 'ALL',
          query,
          timestamp,
          params: args
        });
        
        if (queryLogs.length > 100) {
          queryLogs = queryLogs.slice(-100);
        }
        
        return result;
      } catch (error) {
        queryLogs.push({
          id: id.toString(),
          type: 'ERROR',
          query,
          timestamp,
          error: error.message,
          params: args
        });
        
        if (queryLogs.length > 100) {
          queryLogs = queryLogs.slice(-100);
        }
        
        throw error;
      }
    };
  } else {
    // Direct DB mode: wrap sync methods as async (for consistency with proxy mode)
    stmt.run = async function(...args) {
      const id = ++queryId;
      const query = stmt.source;
      const timestamp = new Date().toISOString();

      return new Promise((resolve, reject) => {
        try {
          // Execute sync call
          const result = originalRun.apply(this, args);
          
          // Log successful query
          queryLogs.push({
            id: id.toString(),
            type: type || 'RUN',
            query,
            timestamp,
            params: args
          });
          
          // Keep only last 100 logs to prevent memory issues
          if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(-100);
          }
          
          resolve(result);
        } catch (error) {
          // Log failed query
          queryLogs.push({
            id: id.toString(),
            type: 'ERROR',
            query,
            timestamp,
            error: error.message,
            params: args
          });
          
          if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(-100);
          }
          
          reject(error);
        }
      });
    };

    stmt.get = async function(...args) {
      const id = ++queryId;
      const query = stmt.source;
      const timestamp = new Date().toISOString();

      return new Promise((resolve, reject) => {
        try {
          // Execute sync call
          const result = originalGet.apply(this, args);
          
          queryLogs.push({
            id: id.toString(),
            type: 'GET',
            query,
            timestamp,
            params: args
          });
          
          if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(-100);
          }
          
          resolve(result);
        } catch (error) {
          queryLogs.push({
            id: id.toString(),
            type: 'ERROR',
            query,
            timestamp,
            error: error.message,
            params: args
          });
          
          if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(-100);
          }
          
          reject(error);
        }
      });
    };

    stmt.all = async function(...args) {
      const id = ++queryId;
      const query = stmt.source;
      const timestamp = new Date().toISOString();

      return new Promise((resolve, reject) => {
        try {
          // Execute sync call
          const result = originalAll.apply(this, args);
          
          queryLogs.push({
            id: id.toString(),
            type: 'ALL',
            query,
            timestamp,
            params: args
          });
          
          if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(-100);
          }
          
          resolve(result);
        } catch (error) {
          queryLogs.push({
            id: id.toString(),
            type: 'ERROR',
            query,
            timestamp,
            error: error.message,
            params: args
          });
          
          if (queryLogs.length > 100) {
            queryLogs = queryLogs.slice(-100);
          }
          
          reject(error);
        }
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
  const id = ++queryId;
  const timestamp = new Date().toISOString();
  
  queryLogs.push({
    id: id.toString(),
    type,
    query,
    timestamp,
    ...(error && { error })
  });
  
  if (queryLogs.length > 100) {
    queryLogs = queryLogs.slice(-100);
  }
}
