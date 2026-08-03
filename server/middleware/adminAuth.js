import crypto from 'crypto';
import { adminPortalLimiter } from './rateLimiters.js';

// Admin Portal Authentication Middleware
// This middleware validates INSTANCE_TOKEN for admin portal access

function timingSafeEqualString(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) {
    // Constant-time-ish reject without leaking which side differed in length via early return alone
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export const authenticateAdminPortal = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Admin portal access token required',
      message: 'Include Authorization header with Bearer token'
    });
  }

  // Get the instance token from environment variable
  // Trim whitespace/newlines that might be introduced when reading from environment
  const instanceToken = process.env.INSTANCE_TOKEN?.trim();
  
  if (!instanceToken) {
    console.error('❌ INSTANCE_TOKEN environment variable not set');
    return res.status(500).json({ 
      error: 'Instance configuration error',
      message: 'Instance token not configured'
    });
  }

  const trimmedToken = token.trim();
  if (!timingSafeEqualString(trimmedToken, instanceToken)) {
    console.warn(`⚠️ Invalid admin portal token attempt from ${req.ip}`);
    return res.status(403).json({ 
      error: 'Invalid admin portal token',
      message: 'The provided token does not match the instance token'
    });
  }

  // Token is valid — do not attach the secret to the request object
  req.adminPortal = {
    authenticated: true,
    instanceName: process.env.INSTANCE_NAME || 'easy-kanban-app',
    timestamp: new Date().toISOString()
  };

  console.log(`✅ Admin portal authenticated for instance: ${process.env.INSTANCE_NAME || 'easy-kanban-app'}`);
  next();
};

/** Real rate limiter (express-rate-limit). Prefer this over the legacy no-op name. */
export const adminPortalRateLimit = adminPortalLimiter;
