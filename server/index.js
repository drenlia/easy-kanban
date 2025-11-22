import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import http from 'http';
import os from 'os';
// Import our extracted modules
import { initializeDatabase } from './config/database.js';
import { authenticateToken, requireRole, generateToken, JWT_SECRET, JWT_EXPIRES_IN } from './middleware/auth.js';
import { attachmentUpload, avatarUpload, createAttachmentUpload } from './config/multer.js';
import { wrapQuery, getQueryLogs, clearQueryLogs } from './utils/queryLogger.js';
import { checkInstanceStatus, initializeInstanceStatus } from './middleware/instanceStatus.js';
import { loginLimiter, passwordResetLimiter, registrationLimiter, activationLimiter } from './middleware/rateLimiters.js';
import { getAppVersion } from './utils/appVersion.js';

// Import generateRandomPassword function
const generateRandomPassword = (length = 12) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};
import { createDefaultAvatar, getRandomColor } from './utils/avatarGenerator.js';
import { initActivityLogger, logActivity, logCommentActivity } from './services/activityLogger.js';
import { initReportingLogger } from './services/reportingLogger.js';
import * as reportingLogger from './services/reportingLogger.js';
import { initNotificationService, getNotificationService } from './services/notificationService.js';
import { initNotificationThrottler, getNotificationThrottler } from './services/notificationThrottler.js';
import { initializeScheduler, manualTriggers } from './jobs/scheduler.js';
import { TAG_ACTIONS, COMMENT_ACTIONS } from './constants/activityActions.js';
import { clearTranslationCache } from './utils/i18n.js';

// Import route modules
import boardsRouter from './routes/boards.js';
import tasksRouter from './routes/tasks.js';
import membersRouter from './routes/members.js';
import columnsRouter from './routes/columns.js';
import authRouter from './routes/auth.js';
import passwordResetRouter from './routes/password-reset.js';
import viewsRouter from './routes/views.js';
// Lazy loaded routes (loaded on first request to reduce startup memory)
// import adminPortalRouter from './routes/adminPortal.js';
// import reportsRouter from './routes/reports.js';
// Lazy loaded admin/debug routes (loaded on first request to reduce startup memory)
// import sprintsRouter from './routes/sprints.js';
import commentsRouter from './routes/comments.js';
import usersRouter from './routes/users.js';
import filesRouter from './routes/files.js';
import uploadRouter from './routes/upload.js';
// import debugRouter from './routes/debug.js';
import healthRouter, { markServerReady, readyHandler } from './routes/health.js';
// import adminUsersRouter from './routes/adminUsers.js';
// Lazy loaded routes (loaded on first request to reduce startup memory)
// import tagsRouter from './routes/tags.js';
// import prioritiesRouter from './routes/priorities.js';
import settingsRouter from './routes/settings.js';
// import adminSystemRouter from './routes/adminSystem.js';
// import adminNotificationQueueRouter from './routes/adminNotificationQueue.js';
import taskRelationsRouter from './routes/taskRelations.js';
import activityRouter from './routes/activity.js';

// Import real-time services
import redisService from './services/redisService.js';
import websocketService from './services/websocketService.js';

// Import storage utilities
import { updateStorageUsage, initializeStorageUsage, getStorageUsage, getStorageLimit, formatBytes } from './utils/storageUtils.js';

// Import license manager
import { getLicenseManager } from './config/license.js';

// Import tenant routing middleware
import { tenantRouting, isMultiTenant, closeAllTenantDatabases, getTenantDatabase } from './middleware/tenantRouting.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database based on mode (single-tenant or multi-tenant)
let defaultDb = null;
let versionInfo = { appVersion: null, versionChanged: false };

// For single-tenant mode (Docker), initialize database immediately
// For multi-tenant mode (Kubernetes), database will be initialized per-request via middleware
// Optionally, can pre-initialize a tenant at startup using STARTUP_TENANT_ID env var
if (!isMultiTenant()) {
  const dbInit = initializeDatabase();
  defaultDb = dbInit.db;
  versionInfo = { appVersion: dbInit.appVersion, versionChanged: dbInit.versionChanged };
  
  // Initialize services with default database (single-tenant mode)
  initializeInstanceStatus(defaultDb);
  initActivityLogger(defaultDb);
  initReportingLogger(defaultDb);
  initNotificationService(defaultDb);
  initNotificationThrottler(defaultDb);
  initializeScheduler(defaultDb);
  
  console.log('✅ Single-tenant mode: Database initialized');
} else {
  console.log('✅ Multi-tenant mode: Database will be initialized per-request');
  
  // Optionally pre-initialize a tenant at startup (useful for first tenant or testing)
  const startupTenantId = process.env.STARTUP_TENANT_ID;
  if (startupTenantId) {
    console.log(`🔧 Pre-initializing tenant database for: ${startupTenantId}`);
    try {
      const dbInfo = getTenantDatabase(startupTenantId);
      console.log(`✅ Tenant '${startupTenantId}' database pre-initialized at startup`);
    } catch (error) {
      console.warn(`⚠️ Failed to pre-initialize tenant '${startupTenantId}':`, error.message);
    }
  }
  
  // Initialize scheduler for multi-tenant mode (will run jobs for all tenants)
  // Pass null as db parameter - scheduler will use getAllTenantDatabases() instead
  initializeScheduler(null);
}

// Clear translation cache on startup to ensure fresh translations are loaded
clearTranslationCache();
console.log('🔄 Translation cache cleared on startup');

const app = express();

// Trust proxy - required when running behind reverse proxy (K8s ingress, nginx, etc.)
// This allows Express to correctly identify client IPs from X-Forwarded-For headers
// Set TRUST_PROXY env var to 'false' to disable, a number (e.g., '1') to trust N proxies, or leave unset to trust all
// For K8s deployments, typically trust the first proxy (ingress controller)
if (process.env.TRUST_PROXY === 'false') {
  app.set('trust proxy', false);
} else if (process.env.TRUST_PROXY) {
  const proxyCount = parseInt(process.env.TRUST_PROXY);
  app.set('trust proxy', isNaN(proxyCount) ? true : proxyCount);
} else {
  // Default: trust all proxies (safe for K8s/cloud deployments)
  app.set('trust proxy', true);
}

// Make default database available to routes (for single-tenant mode)
// In multi-tenant mode, this will be overridden by tenantRouting middleware
app.locals.db = defaultDb;

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Add app version header to all responses
app.use((req, res, next) => {
  // Use database from request (set by tenantRouting in multi-tenant mode)
  const db = req.app.locals.db || defaultDb;
  if (db) {
    res.setHeader('X-App-Version', getAppVersion(db));
  }
  next();
});

// OPTIONS requests are now handled by nginx - disable Express OPTIONS handler to avoid duplicate headers
// app.options('*', (req, res) => {
//   const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
//   const origin = req.headers.origin;
//   
//   if (origin) {
//     const originHostname = new URL(origin).hostname;
//     const isAllowed = allowedOrigins.some(allowedHost => {
//       const allowedHostname = allowedHost.includes('://') 
//         ? new URL(allowedHost).hostname 
//         : allowedHost;
//       return originHostname === allowedHostname;
//     });
//     
//     if (isAllowed) {
//       res.header('Access-Control-Allow-Origin', origin);
//       res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//       res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
//       res.header('Access-Control-Allow-Credentials', 'true');
//     }
//   }
//   
//   res.status(200).end();
// });

// CORS is now handled by nginx - disable Express CORS to avoid duplicate headers
// app.use(cors({
//   origin: (origin, callback) => {
//     const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
//     
//     // If no origin (e.g., mobile apps, Postman), allow it
//     if (!origin) {
//       return callback(null, true);
//     }
//     
//     // Check if the origin's hostname matches any allowed hostname
//     const originHostname = new URL(origin).hostname;
//     const isAllowed = allowedOrigins.some(allowedHost => {
//       // Handle both hostnames and full URLs
//       const allowedHostname = allowedHost.includes('://') 
//         ? new URL(allowedHost).hostname 
//         : allowedHost;
//       return originHostname === allowedHostname;
//     });
//     
//     if (isAllowed) {
//       callback(null, origin); // Return the exact origin for proper CORS headers
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   optionsSuccessStatus: 200 // Some legacy browsers choke on 204
// }));
// Body parser limits (for JSON/URL-encoded, not multipart/form-data)
// Note: multipart/form-data is handled by Multer, which has its own limits
// For larger uploads, also configure nginx: client_max_body_size 100m;
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Note: In production, Vite preview serves static files from dist and proxies API requests
// Express no longer needs to serve static files when Vite preview is running
// This code is kept for backward compatibility but won't be used when vite preview is active
if (process.env.NODE_ENV === 'production' && !process.env.VITE_PREVIEW_RUNNING) {
  const distPath = path.join(__dirname, '../dist');
  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(distPath, {
    maxAge: '1y', // Cache static assets for 1 year
    etag: true,
    lastModified: true
  }));
  console.log(`📦 Serving static files from: ${distPath}`);
}

// Tenant routing middleware (must be before routes that need database)
// In multi-tenant mode, this extracts tenant ID from hostname and loads the appropriate database
// In single-tenant mode, this is a no-op (database already initialized)
if (isMultiTenant()) {
  app.use(tenantRouting);
  console.log('✅ Tenant routing middleware enabled');
}

// Add instance status middleware (uses database from req.app.locals.db)
app.use((req, res, next) => {
  const db = req.app.locals.db || defaultDb;
  if (db) {
    return checkInstanceStatus(db)(req, res, next);
  }
  next();
});

// Rate limiters are now imported from middleware/rateLimiters.js

// ================================
// DEBUG ENDPOINTS
// ================================


// ================================
// AUTHENTICATION ENDPOINTS
// ================================
// Auth routes have been moved to routes/auth.js

// ================================
// API ROUTES
// ================================

// Lazy loading helper for routes (reduces startup memory)
const lazyRouteLoader = (modulePath) => {
  let router = null;
  let loadingPromise = null;
  
  return async (req, res, next) => {
    try {
      // If router is already loaded, use it immediately
      if (router) {
        return router(req, res, next);
      }
      
      // If currently loading, wait for it
      if (loadingPromise) {
        await loadingPromise;
        if (router) {
          return router(req, res, next);
        }
        // If loading failed, router will be null, fall through to error
      }
      
      // Start loading the module
      loadingPromise = (async () => {
        try {
          console.log(`📦 Lazy loading route module: ${modulePath}`);
          const module = await import(modulePath);
          router = module.default;
          console.log(`✅ Route module loaded: ${modulePath}`);
        } catch (error) {
          console.error(`❌ Failed to load route module ${modulePath}:`, error);
          throw error; // Re-throw to be caught by outer try-catch
        }
      })();
      
      await loadingPromise;
      
      // Router should be loaded now, use it
      if (router) {
        return router(req, res, next);
      } else {
        throw new Error('Router is null after loading');
      }
    } catch (error) {
      console.error(`❌ Error in lazy route loader for ${modulePath}:`, error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Route module failed to load', details: error.message });
      }
      return next(error);
    }
  };
};

// Use route modules
app.use('/api/members', membersRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/tasks', authenticateToken, tasksRouter);
app.use('/api/views', viewsRouter);
app.use('/api/auth', authRouter);
app.use('/api/password-reset', passwordResetRouter);
// Lazy loaded routes (loaded on first request to reduce startup memory)
app.use('/api/reports', lazyRouteLoader('./routes/reports.js'));
app.use('/api/admin/sprints', lazyRouteLoader('./routes/sprints.js'));
app.use('/api/comments', commentsRouter);
app.use('/api/users', usersRouter);
app.use('/api/upload', uploadRouter); // File upload endpoint (for backward compatibility)
app.use('/api/files', filesRouter);
app.use('/api/attachments', filesRouter);
app.use('/api/debug', lazyRouteLoader('./routes/debug.js'));
app.use('/health', healthRouter);
// Mount ready endpoint at both /ready and /api/ready for flexibility
app.get('/ready', readyHandler);
app.get('/api/ready', readyHandler);
app.use('/api/admin/users', lazyRouteLoader('./routes/adminUsers.js'));
// Lazy loaded routes (loaded on first request to reduce startup memory)
app.use('/api/tags', lazyRouteLoader('./routes/tags.js'));
app.use('/api/admin/tags', lazyRouteLoader('./routes/tags.js'));
app.use('/api/admin/priorities', lazyRouteLoader('./routes/priorities.js'));
app.use('/api/priorities', lazyRouteLoader('./routes/priorities.js'));
// Settings endpoints (eager loaded - required immediately for frontend)
app.use('/api/settings', settingsRouter);
app.use('/api/admin/settings', settingsRouter);
app.use('/api/storage', settingsRouter);
app.use('/api/admin', lazyRouteLoader('./routes/adminSystem.js'));
app.use('/api/admin/notification-queue', lazyRouteLoader('./routes/adminNotificationQueue.js'));
app.use('/api/tasks', taskRelationsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/user', activityRouter);
app.use('/api/user', usersRouter); // User settings routes

// Admin Portal API routes (external access using INSTANCE_TOKEN) - Lazy loaded
app.use('/api/admin-portal', lazyRouteLoader('./routes/adminPortal.js'));

// ================================
// ADDITIONAL ENDPOINTS
// ================================

// Version info endpoint (public, useful for debugging and K8s readiness checks)
app.get('/api/version', (req, res) => {
  try {
    // Try to read full version info from version.json
    const versionPath = new URL('./version.json', import.meta.url);
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
    res.json(versionData);
  } catch (error) {
    // Fallback to basic version info
    res.json({
      version: getAppVersion(defaultDb),
      source: 'environment',
      environment: process.env.NODE_ENV || 'production'
    });
  }
});

// Comments routes have been moved to routes/comments.js

// File upload and user routes have been moved to routes/users.js

// Admin user routes have been moved to routes/adminUsers.js

// Tags routes have been moved to routes/tags.js

// Priorities routes have been moved to routes/priorities.js

// Settings routes have been moved to routes/settings.js

// getContainerMemoryInfo has been moved to utils/containerMemory.js
// Admin system routes have been moved to routes/adminSystem.js

// Test email route has been moved to routes/adminSystem.js


// Public priorities endpoint - moved to routes/priorities.js

// Tags endpoints
// GET /api/tags moved to routes/tags.js

// Task relations routes (tags, watchers, collaborators, attachments) have been moved to routes/taskRelations.js
// Activity and user status routes have been moved to routes/activity.js
// User settings routes have been moved to routes/users.js

// Attachment routes have been moved to routes/files.js
// File serving routes have been moved to routes/files.js
// Debug routes have been moved to routes/debug.js
// Health route has been moved to routes/health.js

// ================================
// SPA FALLBACK FOR CLIENT-SIDE ROUTING
// ================================

// Serve the React app for all non-API routes
// Express 5: catch-all route requires named wildcard parameter
app.get('/*splat', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/attachments/') || req.path.startsWith('/avatars/')) {
    return res.status(404).json({ error: 'Not Found' });
  }
  
  // For all other routes (including /project/, /task/, etc.), serve the React app
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// ================================
// START SERVER
// ================================

const PORT = process.env.PORT || 3222;

// Create HTTP server
const server = http.createServer(app);

// Initialize real-time services BEFORE server starts listening
// This ensures the Redis adapter is configured before any connections are accepted
async function initializeServices() {
  try {
    // Initialize Redis
    await redisService.connect();
    
    // Initialize WebSocket (now async due to Redis adapter setup)
    // CRITICAL: This must happen BEFORE server.listen() to ensure adapter is ready
    await websocketService.initialize(server);
    
    console.log('✅ Real-time services initialized');
    
    // Broadcast app version to all connected clients
    // If version changed, broadcast immediately; otherwise wait briefly for WebSocket connections
    const broadcastVersion = () => {
      // In single-tenant mode, broadcast version from default database
      if (defaultDb) {
        const appVersion = getAppVersion(defaultDb);
        redisService.publish('version-updated', { version: appVersion }, null);
        console.log(`📦 Broadcasting app version: ${appVersion}${versionInfo.versionChanged ? ' (version changed - notifying users)' : ''}`);
      }
      // In multi-tenant mode, version updates are broadcast per-tenant when databases are initialized
      // (handled in tenantRouting middleware)
    };
    
    if (versionInfo.versionChanged && versionInfo.appVersion) {
      // Version changed - broadcast immediately to notify users
      broadcastVersion();
    } else {
      // Normal startup - wait briefly for WebSocket connections
      setTimeout(broadcastVersion, 1000);
    }
  } catch (error) {
    console.error('❌ Failed to initialize real-time services:', error);
    // Continue without real-time features
  }
}

// Initialize services BEFORE starting the server
// This ensures the Redis adapter is configured before any Socket.IO connections are accepted
await initializeServices();

// Start server AFTER services are initialized
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`✅ Readiness check: http://localhost:${PORT}/ready`);
  console.log(`🔧 Debug logs: http://localhost:${PORT}/api/debug/logs`);
  console.log(`✨ Refactored server with modular architecture`);
  
  // Mark server as ready after services are initialized
  markServerReady();
  
  // Defer storage usage calculation to reduce startup memory
  // Initialize after 30 seconds to allow server to stabilize
  // Only initialize for single-tenant mode (multi-tenant databases are created per-request)
  if (!isMultiTenant() && defaultDb) {
    setTimeout(() => {
      initializeStorageUsage(defaultDb);
    }, 30000);
  } else {
    console.log('📊 Multi-tenant mode: Storage usage will be calculated per-tenant on first request');
  }
});

// Graceful shutdown handler
const gracefulShutdown = async () => {
  // Close all tenant database connections (multi-tenant mode)
  if (isMultiTenant()) {
    closeAllTenantDatabases();
  }
  
  // Close default database (single-tenant mode)
  if (defaultDb) {
    try {
      defaultDb.close();
      console.log('✅ Closed default database');
    } catch (error) {
      console.error('❌ Error closing default database:', error);
    }
  }
  
  // Stop notification processing and flush pending notifications
  const throttler = getNotificationThrottler();
  if (throttler) {
    throttler.stopProcessing();
    await throttler.flushAllNotifications();
  }
  
  // Disconnect WebSocket service (closes Socket.IO server and Redis adapter clients)
  await websocketService.disconnect();
  
  // Disconnect Redis service
  await redisService.disconnect();
  
  console.log('✅ Graceful shutdown complete');
  process.exit(0);
};

process.on('SIGINT', async () => {
  console.log('\n🔄 Received SIGINT, shutting down gracefully...');
  await gracefulShutdown();
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
  await gracefulShutdown();
});
