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

// Import route modules
import boardsRouter from './routes/boards.js';
import tasksRouter from './routes/tasks.js';
import membersRouter from './routes/members.js';
import columnsRouter from './routes/columns.js';
import authRouter from './routes/auth.js';
import passwordResetRouter from './routes/password-reset.js';
import viewsRouter from './routes/views.js';
import adminPortalRouter from './routes/adminPortal.js';
import reportsRouter from './routes/reports.js';
import sprintsRouter from './routes/sprints.js';
import commentsRouter from './routes/comments.js';
import usersRouter from './routes/users.js';
import filesRouter from './routes/files.js';
import uploadRouter from './routes/upload.js';
import debugRouter from './routes/debug.js';
import healthRouter from './routes/health.js';
import adminUsersRouter from './routes/adminUsers.js';
import tagsRouter from './routes/tags.js';
import prioritiesRouter from './routes/priorities.js';
import settingsRouter from './routes/settings.js';
import adminSystemRouter from './routes/adminSystem.js';
import taskRelationsRouter from './routes/taskRelations.js';
import activityRouter from './routes/activity.js';

// Import real-time services
import redisService from './services/redisService.js';
import websocketService from './services/websocketService.js';

// Import storage utilities
import { updateStorageUsage, initializeStorageUsage, getStorageUsage, getStorageLimit, formatBytes } from './utils/storageUtils.js';

// Import license manager
import { getLicenseManager } from './config/license.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize database using extracted module and capture version info
const dbInit = initializeDatabase();
const db = dbInit.db;
const versionInfo = { appVersion: dbInit.appVersion, versionChanged: dbInit.versionChanged };

// Initialize instance status setting
initializeInstanceStatus(db);

// Initialize activity logger, reporting logger, and notification service with database instance
initActivityLogger(db);
initReportingLogger(db);
initNotificationService(db);
initNotificationThrottler(db);

// Initialize background job scheduler
initializeScheduler(db);

const app = express();

// Make database available to routes
app.locals.db = db;

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
  res.setHeader('X-App-Version', getAppVersion(db));
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Add instance status middleware
app.use(checkInstanceStatus(db));

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

// Use route modules
app.use('/api/members', membersRouter);
app.use('/api/boards', boardsRouter);
app.use('/api/columns', columnsRouter);
app.use('/api/tasks', authenticateToken, tasksRouter);
app.use('/api/views', viewsRouter);
app.use('/api/auth', authRouter);
app.use('/api/password-reset', passwordResetRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/admin/sprints', sprintsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/users', usersRouter);
app.use('/api/upload', uploadRouter); // File upload endpoint (for backward compatibility)
app.use('/api/files', filesRouter);
app.use('/api/attachments', filesRouter);
app.use('/api/debug', debugRouter);
app.use('/health', healthRouter);
app.use('/api/admin/users', adminUsersRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/admin/tags', tagsRouter);
app.use('/api/admin/priorities', prioritiesRouter);
app.use('/api/priorities', prioritiesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/admin/settings', settingsRouter);
app.use('/api/storage', settingsRouter);
app.use('/api/admin', adminSystemRouter);
app.use('/api/tasks', taskRelationsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/user', activityRouter);
app.use('/api/user', usersRouter); // User settings routes

// Admin Portal API routes (external access using INSTANCE_TOKEN)
app.use('/api/admin-portal', adminPortalRouter);

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
      version: getAppVersion(),
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
app.get('*', (req, res) => {
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

// Initialize real-time services
async function initializeServices() {
  try {
    // Initialize Redis
    await redisService.connect();
    
    // Initialize WebSocket
    websocketService.initialize(server);
    
    console.log('✅ Real-time services initialized');
    
    // Broadcast app version to all connected clients
    // If version changed, broadcast immediately; otherwise wait briefly for WebSocket connections
    const broadcastVersion = () => {
      const appVersion = getAppVersion();
      redisService.publish('version-updated', { version: appVersion });
      console.log(`📦 Broadcasting app version: ${appVersion}${versionInfo.versionChanged ? ' (version changed - notifying users)' : ''}`);
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

// Start server
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Debug logs: http://localhost:${PORT}/api/debug/logs`);
  console.log(`✨ Refactored server with modular architecture`);
  
  // Initialize storage usage tracking
  initializeStorageUsage(db);
  
  // Initialize real-time services
  await initializeServices();
});

// Graceful shutdown handler
process.on('SIGINT', async () => {
  console.log('\n🔄 Received SIGINT, shutting down gracefully...');
  
  // Stop notification processing and flush pending notifications
  const throttler = getNotificationThrottler();
  if (throttler) {
    throttler.stopProcessing();
    await throttler.flushAllNotifications();
  }
  
  console.log('✅ Graceful shutdown complete');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
  
  // Stop notification processing and flush pending notifications
  const throttler = getNotificationThrottler();
  if (throttler) {
    throttler.stopProcessing();
    await throttler.flushAllNotifications();
  }
  
  console.log('✅ Graceful shutdown complete');
  process.exit(0);
});
