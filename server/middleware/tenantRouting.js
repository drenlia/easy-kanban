/**
 * Tenant Routing Middleware
 * 
 * Extracts tenant ID from hostname and loads the appropriate database.
 * Supports both multi-tenant (Kubernetes) and single-tenant (Docker) modes.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase, getDbPath } from '../config/database.js';
import redisService from '../services/redisService.js';

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
const initializeDatabaseForTenant = async (tenantId) => {
  // Use the refactored initializeDatabase from database.js
  return await initializeDatabase(tenantId);
};

// Get or create database connection for tenant
const getTenantDatabase = async (tenantId) => {
  // Normalize tenantId for cache key (null for single-tenant)
  const cacheKey = tenantId || 'default';
  
  // Check cache first
  if (dbCache.has(cacheKey)) {
    const cached = dbCache.get(cacheKey);
    // Verify database is still open
    try {
      const { wrapQuery } = await import('../utils/queryLogger.js');
      await wrapQuery(cached.db.prepare('SELECT 1'), 'SELECT').get();
      return cached;
    } catch (error) {
      // Database closed, remove from cache
      dbCache.delete(cacheKey);
    }
  }
  
  // Initialize database (creates tables, runs migrations, etc.)
  const dbInfo = await initializeDatabaseForTenant(tenantId);
  
  // If version changed, broadcast to this tenant
  if (dbInfo.versionChanged && dbInfo.appVersion) {
    redisService.publish('version-updated', { version: dbInfo.appVersion }, tenantId);
    console.log(`📦 Broadcasting version update to tenant ${tenantId || 'default'}: ${dbInfo.appVersion}`);
  }
  
  // Initialize storage usage for this tenant (only on first database creation, not on cache hits)
  // This ensures STORAGE_USED is accurate from the start
  // Initialize asynchronously to avoid blocking the request
  import('../utils/storageUtils.js').then(({ initializeStorageUsage }) => {
    initializeStorageUsage(dbInfo.db);
  }).catch(err => {
    console.warn(`⚠️ Failed to initialize storage usage for tenant ${tenantId || 'default'}:`, err.message);
  });
  
  // Cache the connection
  dbCache.set(cacheKey, dbInfo);
  
  return dbInfo;
};

// Tenant routing middleware
export const tenantRouting = async (req, res, next) => {
  try {
    // Extract tenant ID from hostname
    // Priority order:
    // 1. X-Forwarded-Host (set by ingress/nginx) - most reliable for multi-tenant
    // 2. X-Original-Host (some proxies set this)
    // 3. Host header
    // 4. req.hostname
    const forwardedHost = req.get('x-forwarded-host');
    const originalHost = req.get('x-original-host');
    const hostHeader = req.get('host');
    const hostname = forwardedHost || originalHost || hostHeader || req.hostname;
    
    // Debug: log all hostname sources for troubleshooting
    if (isMultiTenant()) {
      console.log(`🔍 Tenant routing - X-Forwarded-Host: ${forwardedHost || 'none'}, X-Original-Host: ${originalHost || 'none'}, Host: ${hostHeader || 'none'}, hostname: ${req.hostname || 'none'}, Using: ${hostname}`);
    }
    
    let tenantId = extractTenantId(hostname);
    
    // Debug logging for tenant extraction
    if (isMultiTenant()) {
      console.log(`🔍 Tenant routing - Hostname: ${hostname}, Extracted tenantId: ${tenantId || 'null (single-tenant)'}`);
    }
    
    // For admin portal routes, allow tenant to be specified via query parameter or header
    // This allows admin portal to access any tenant's database
    if (req.path.startsWith('/api/admin-portal') && isMultiTenant()) {
      const queryTenantId = req.query.tenantId || req.headers['x-tenant-id'];
      if (queryTenantId && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(queryTenantId)) {
        tenantId = queryTenantId;
        console.log(`🔑 Admin portal accessing tenant via parameter: ${tenantId}`);
      }
    }
    
    // Store tenant ID in request for use in routes
    req.tenantId = tenantId;
    
    // Get or create tenant database
    const dbInfo = await getTenantDatabase(tenantId);
    
    // Log database path for debugging
    if (isMultiTenant() && tenantId) {
      const dbPath = getTenantDbPath(tenantId);
      console.log(`📊 Using tenant database: ${dbPath}`);
    }
    
    // Make database available to routes
    // CRITICAL: Use req.locals for per-request data to avoid race conditions
    // req.app.locals is SHARED across all requests, causing database mix-ups in multi-tenant mode
    if (!req.locals) {
      req.locals = {};
    }
    req.locals.db = dbInfo.db;
    req.locals.tenantStoragePaths = getTenantStoragePaths(tenantId);
    if (isMultiTenant() && tenantId) {
      req.locals.currentTenant = tenantId;
    }
    
    // DO NOT set req.app.locals.db in multi-tenant mode - it's shared and causes race conditions!
    // Only set it in single-tenant mode for backward compatibility
    if (!isMultiTenant()) {
      req.app.locals.db = dbInfo.db;
      req.app.locals.tenantStoragePaths = getTenantStoragePaths(tenantId);
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

// Get all cached tenant databases (for scheduled jobs in multi-tenant mode)
export const getAllTenantDatabases = async () => {
  const databases = [];
  const { wrapQuery } = await import('../utils/queryLogger.js');
  
  for (const [tenantId, dbInfo] of dbCache.entries()) {
    try {
      // Verify database is still open (async for proxy support)
      await wrapQuery(dbInfo.db.prepare('SELECT 1'), 'SELECT').get();
      databases.push({ tenantId: tenantId === 'default' ? null : tenantId, db: dbInfo.db });
    } catch (error) {
      // Database closed, skip it
      console.warn(`⚠️ Skipping closed database for tenant: ${tenantId}`);
    }
  }
  return databases;
};

// Helper function to get database from request (avoids race conditions)
// Prefers req.locals.db (per-request) over req.app.locals.db (shared)
export const getRequestDatabase = (req, defaultDb = null) => {
  return req.locals?.db || req.app.locals?.db || defaultDb;
};

// Export utility functions
export { getTenantDbPath, getTenantStoragePaths, isMultiTenant, extractTenantId, getTenantDatabase };

