import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getRequestDatabase } from './tenantRouting.js';
import { wrapQuery } from '../utils/queryLogger.js';
import { userApiTokens as tokenQueries } from '../utils/sqlManager/index.js';
import { isAiEnabled } from '../utils/aiEnabled.js';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_EXPIRES_IN = '24h';

// Debug: Log the JWT secret being used
console.log('🔑 Auth middleware initialized with JWT_SECRET:', JWT_SECRET ? `${JWT_SECRET.substring(0, 8)}...` : 'undefined');

/**
 * Authenticate personal access tokens (ek_…). Used when JWT verification fails
 * or the bearer token looks like a PAT.
 */
async function authenticatePersonalAccessToken(req, rawToken) {
  if (!rawToken || !rawToken.startsWith('ek_')) {
    return null;
  }

  const db = getRequestDatabase(req);
  if (!db) {
    return null;
  }

  if (!(await isAiEnabled(db))) {
    return null;
  }

  // Prefix is ek_ + 8 hex chars for indexed lookup
  const prefix = rawToken.slice(0, 11);
  const candidates = await tokenQueries.getActiveTokensByPrefix(db, prefix);
  for (const row of candidates) {
    const ok = await bcrypt.compare(rawToken, row.token_hash);
    if (!ok) continue;

    const userRow = await wrapQuery(
      db.prepare('SELECT id, email, is_active FROM users WHERE id = $1'),
      'SELECT'
    ).get(row.user_id);

    if (!userRow || userRow.is_active === false) {
      return null;
    }

    const roles = await wrapQuery(
      db.prepare(`
        SELECT r.name FROM roles r
        JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = $1
      `),
      'SELECT'
    ).all(userRow.id);

    const roleNames = roles.map((r) => r.name);
    // Fire-and-forget last-used stamp
    tokenQueries.touchLastUsed(db, row.id).catch(() => {});

    return {
      id: userRow.id,
      email: userRow.email,
      role: roleNames[0] || 'user',
      roles: roleNames,
      authType: 'pat',
      tokenId: row.id
    };
  }

  return null;
}

// Authentication middleware
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      console.log(`❌ [AUTH] No token provided for ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Access token required' });
    }

    // Personal access tokens for agent automation
    if (token.startsWith('ek_')) {
      const patUser = await authenticatePersonalAccessToken(req, token);
      if (!patUser) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      req.user = patUser;
      return next();
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
    
    // Verify user still exists in the tenant DB (demo resets, deleted accounts, tenant switches).
    // Previously this ran only when MULTI_TENANT=true; single-tenant demo wipe left valid JWTs
    // for deleted user IDs and the UI got stuck off the login page.
    const db = getRequestDatabase(req);
    if (db) {
      try {
        const userInDb = await wrapQuery(db.prepare('SELECT id FROM users WHERE id = ?'), 'SELECT').get(user.id);
        
        if (!userInDb) {
          console.log(`❌ [AUTH] Token validation failed: User ${user.email} (${user.id}) does not exist in database`);
          return res.status(401).json({ error: 'Invalid or expired token' });
        }
      } catch (dbError) {
        console.error('❌ [AUTH] Error checking user in database:', dbError);
        return res.status(401).json({ error: 'Authentication failed' });
      }
    }
    
    req.user = { ...user, authType: 'jwt' };
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
