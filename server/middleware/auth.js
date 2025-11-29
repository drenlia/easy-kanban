import jwt from 'jsonwebtoken';
import { getRequestDatabase } from './tenantRouting.js';
import { wrapQuery } from '../utils/queryLogger.js';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_EXPIRES_IN = '24h';

// Debug: Log the JWT secret being used
console.log('🔑 Auth middleware initialized with JWT_SECRET:', JWT_SECRET ? `${JWT_SECRET.substring(0, 8)}...` : 'undefined');

// Authentication middleware
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      console.log(`❌ [AUTH] No token provided for ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Access token required' });
    }

    // Verify JWT token
    const user = await new Promise((resolve, reject) => {
      jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
          console.log(`❌ [AUTH] JWT verification failed for ${req.method} ${req.path}:`, err.message);
          reject(err);
        } else {
          resolve(decoded);
        }
      });
    });
    
    // In multi-tenant mode, verify user exists in the current tenant's database
    // This ensures tokens from one tenant cannot be used on another tenant
    const db = getRequestDatabase(req);
    if (process.env.MULTI_TENANT === 'true' && db) {
      try {
        const userInDb = await wrapQuery(db.prepare('SELECT id FROM users WHERE id = ?'), 'SELECT').get(user.id);
        
        if (!userInDb) {
          console.log(`❌ [AUTH] Token validation failed: User ${user.email} (${user.id}) does not exist in current tenant's database`);
          return res.status(401).json({ error: 'Invalid token for this tenant' });
        }
      } catch (dbError) {
        console.error('❌ [AUTH] Error checking user in tenant database:', dbError);
        // If database check fails, reject the token for security
        return res.status(401).json({ error: 'Authentication failed' });
      }
    }
    
    req.user = user;
    next();
  } catch (err) {
    // Return 401 for authentication errors (invalid/expired token)
    // This distinguishes from 403 which should be used for authorization errors (insufficient permissions)
    console.error(`❌ [AUTH] Authentication error for ${req.method} ${req.path}:`, err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Role-based access control middleware
export const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
};

// JWT utilities
export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

export { JWT_SECRET, JWT_EXPIRES_IN };
