/**
 * Tenant Routing Middleware
 * 
 * Extracts tenant ID from hostname and loads the appropriate database.
 * Supports both multi-tenant (Kubernetes) and single-tenant (Docker) modes.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDbPath } from '../config/database.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Database connection cache (tenantId -> Database instance)
const dbCache = new Map();

// Check if multi-tenant mode is enabled
const isMultiTenant = () => {
  return process.env.MULTI_TENANT === 'true';
};

// Extract tenant ID from hostname
// Examples:
//   customer1.ezkan.cloud -> customer1
//   customer2.ezkan.cloud -> customer2
//   localhost -> null (single-tenant mode)
const extractTenantId = (hostname) => {
  if (!hostname) return null;
  
  // Skip if not in multi-tenant mode
  if (!isMultiTenant()) {
    return null;
  }
  
  // Extract subdomain (tenant ID) from hostname
  // Remove port if present (e.g., localhost:3010 -> localhost)
  const hostnameWithoutPort = hostname.split(':')[0];
  
  // Get domain from environment or use default
  const domain = process.env.TENANT_DOMAIN || 'ezkan.cloud';
  
  // Check if hostname matches tenant pattern: {tenantId}.{domain}
  if (hostnameWithoutPort.endsWith(`.${domain}`)) {
    const parts = hostnameWithoutPort.split('.');
    if (parts.length >= 2) {
      const tenantId = parts[0];
      // Validate tenant ID (alphanumeric and hyphens only)
      if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(tenantId)) {
        return tenantId;
      }
    }
  }
  
  // For localhost or direct IP access, return null (single-tenant)
  return null;
};

// Get database path for a tenant (uses database.js function)
const getTenantDbPath = (tenantId) => {
  return getDbPath(tenantId);
};

// Get tenant storage paths (attachments, avatars)
const getTenantStoragePaths = (tenantId) => {
  const basePath = process.env.DOCKER_ENV === 'true'
    ? '/app/server'
    : join(dirname(__dirname), '..');
  
  if (tenantId && isMultiTenant()) {
    return {
      attachments: join(basePath, 'attachments', 'tenants', tenantId),
      avatars: join(basePath, 'avatars', 'tenants', tenantId)
    };
  }
  
  // Single-tenant: backward compatible paths
  return {
    attachments: join(basePath, 'attachments'),
    avatars: join(basePath, 'avatars')
  };
};

// Initialize database for a tenant
// This uses initializeDatabase from database.js which handles:
// - Creating directory if needed
// - Creating database file if needed
// - Creating tables
// - Running migrations
// - Initializing default data
const initializeDatabaseForTenant = (tenantId) => {
  // Use the refactored initializeDatabase from database.js
  return initializeDatabase(tenantId);
};

// Get or create database connection for tenant
const getTenantDatabase = (tenantId) => {
  // Normalize tenantId for cache key (null for single-tenant)
  const cacheKey = tenantId || 'default';
  
  // Check cache first
  if (dbCache.has(cacheKey)) {
    const cached = dbCache.get(cacheKey);
    // Verify database is still open
    try {
      cached.db.prepare('SELECT 1').get();
      return cached;
    } catch (error) {
      // Database closed, remove from cache
      dbCache.delete(cacheKey);
    }
  }
  
  // Initialize database (creates tables, runs migrations, etc.)
  const dbInfo = initializeDatabaseForTenant(tenantId);
  
  // Cache the connection
  dbCache.set(cacheKey, dbInfo);
  
  return dbInfo;
};

// Tenant routing middleware
export const tenantRouting = (req, res, next) => {
  try {
    // Extract tenant ID from hostname
    const hostname = req.get('host') || req.hostname;
    const tenantId = extractTenantId(hostname);
    
    // Store tenant ID in request for use in routes
    req.tenantId = tenantId;
    
    // Get or create tenant database
    const dbInfo = getTenantDatabase(tenantId);
    
    // Make database available to routes (replaces app.locals.db)
    req.app.locals.db = dbInfo.db;
    
    // Store tenant storage paths
    req.app.locals.tenantStoragePaths = getTenantStoragePaths(tenantId);
    
    // Log tenant access (only in multi-tenant mode)
    if (isMultiTenant() && tenantId) {
      req.app.locals.currentTenant = tenantId;
    }
    
    next();
  } catch (error) {
    console.error('❌ Tenant routing error:', error);
    
    // If tenant database initialization fails, return 500
    res.status(500).json({
      success: false,
      error: 'Failed to initialize tenant database',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get tenant ID from request (utility function)
export const getTenantId = (req) => {
  return req.tenantId || null;
};

// Get tenant storage paths (utility function)
export const getTenantPaths = (req) => {
  return req.app.locals.tenantStoragePaths || {
    attachments: process.env.DOCKER_ENV === 'true' 
      ? '/app/server/attachments' 
      : join(dirname(__dirname), '..', 'attachments'),
    avatars: process.env.DOCKER_ENV === 'true'
      ? '/app/server/avatars'
      : join(dirname(__dirname), '..', 'avatars')
  };
};

// Cleanup: Close all database connections (for graceful shutdown)
export const closeAllTenantDatabases = () => {
  console.log('🔄 Closing all tenant database connections...');
  for (const [tenantId, dbInfo] of dbCache.entries()) {
    try {
      dbInfo.db.close();
      console.log(`✅ Closed database for tenant: ${tenantId}`);
    } catch (error) {
      console.error(`❌ Error closing database for tenant ${tenantId}:`, error);
    }
  }
  dbCache.clear();
};

// Export utility functions
export { getTenantDbPath, getTenantStoragePaths, isMultiTenant };

