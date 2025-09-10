// Query logging system
let queryLogs = [];
let queryId = 0;

// Function to wrap SQL queries with logging
export function wrapQuery(stmt, type) {
  const originalRun = stmt.run;
  const originalGet = stmt.get;
  const originalAll = stmt.all;

  stmt.run = function(...args) {
    const id = ++queryId;
    const query = stmt.source;
    const timestamp = new Date().toISOString();

    try {
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

  stmt.get = function(...args) {
    const id = ++queryId;
    const query = stmt.source;
    const timestamp = new Date().toISOString();

    try {
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

  stmt.all = function(...args) {
    const id = ++queryId;
    const query = stmt.source;
    const timestamp = new Date().toISOString();

    try {
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
