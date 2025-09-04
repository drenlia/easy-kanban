import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireRole, JWT_SECRET, JWT_EXPIRES_IN } from '../middleware/auth.js';

const router = express.Router();

// Helper function to get OAuth settings with caching
function getOAuthSettings(db) {
  // Check if we have cached settings and no cache invalidation flag
  if (global.oauthConfigCache && !global.oauthConfigCache.invalidated) {
    console.log('🔄 [GOOGLE SSO] Using cached OAuth settings');
    return global.oauthConfigCache.settings;
  }
  
  // Fetch fresh settings from database
  console.log('🔄 [GOOGLE SSO] Loading OAuth settings from database...');
  const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?)').all('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL');
  const settingsObj = {};
  settings.forEach(setting => {
    settingsObj[setting.key] = setting.value;
  });
  
  // Cache the settings
  global.oauthConfigCache = {
    settings: settingsObj,
    invalidated: false,
    timestamp: Date.now()
  };
  
  console.log('🔄 [GOOGLE SSO] OAuth settings loaded from database:', Object.keys(settingsObj).map(k => `${k}: ${settingsObj[k] ? '✓' : '✗'}`).join(', '));
  console.log('🔄 [GOOGLE SSO] OAuth settings details:', {
    GOOGLE_CLIENT_ID: settingsObj.GOOGLE_CLIENT_ID ? `${settingsObj.GOOGLE_CLIENT_ID.substring(0, 20)}...` : 'NOT_SET',
    GOOGLE_CLIENT_SECRET: settingsObj.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT_SET',
    GOOGLE_CALLBACK_URL: settingsObj.GOOGLE_CALLBACK_URL || 'NOT_SET'
  });
  
  return settingsObj;
}

// Google OAuth endpoints
router.get('/google/url', (req, res) => {
  try {
    console.log('🔐 [GOOGLE SSO] Starting Google OAuth URL generation...');
    console.log('🔐 [GOOGLE SSO] Request headers:', {
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer,
      userAgent: req.headers['user-agent']?.substring(0, 50) + '...'
    });
    
    const db = req.app.locals.db;
    const settingsObj = getOAuthSettings(db);
    
    console.log('🔐 [GOOGLE SSO] OAuth settings validation:', {
      hasClientId: !!settingsObj.GOOGLE_CLIENT_ID,
      hasClientSecret: !!settingsObj.GOOGLE_CLIENT_SECRET,
      hasCallbackUrl: !!settingsObj.GOOGLE_CALLBACK_URL,
      callbackUrl: settingsObj.GOOGLE_CALLBACK_URL || 'NOT_SET',
      clientIdPrefix: settingsObj.GOOGLE_CLIENT_ID ? settingsObj.GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'NOT_SET'
    });
    
    if (!settingsObj.GOOGLE_CLIENT_ID || !settingsObj.GOOGLE_CLIENT_SECRET || !settingsObj.GOOGLE_CALLBACK_URL) {
      console.error('🔐 [GOOGLE SSO] ❌ OAuth not fully configured');
      return res.status(400).json({ error: 'Google OAuth not fully configured. Please set Client ID, Client Secret, and Callback URL.' });
    }
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(settingsObj.GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(settingsObj.GOOGLE_CALLBACK_URL)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline`;
    
    console.log('🔐 [GOOGLE SSO] ✅ Generated OAuth URL successfully');
    console.log('🔐 [GOOGLE SSO] OAuth URL components:', {
      baseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      clientId: settingsObj.GOOGLE_CLIENT_ID.substring(0, 20) + '...',
      redirectUri: settingsObj.GOOGLE_CALLBACK_URL,
      scope: 'openid email profile'
    });
    
    res.json({ url: googleAuthUrl });
  } catch (error) {
    console.error('🔐 [GOOGLE SSO] ❌ Error generating OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

router.get('/google/callback', async (req, res) => {
  try {
    console.log('🔐 [GOOGLE SSO] ======== CALLBACK STARTED ========');
    const { code, error, error_description } = req.query;
    const db = req.app.locals.db;
    
    console.log('🔐 [GOOGLE SSO] Callback request details:', {
      host: req.headers.host,
      url: req.url,
      fullUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      query: req.query,
      hasCode: !!code,
      codeLength: code ? code.length : 0
    });
    
    // Check for OAuth errors from Google
    if (error) {
      console.error('🔐 [GOOGLE SSO] ❌ OAuth error from Google:', {
        error,
        error_description,
        query: req.query
      });
      return res.redirect(`/?error=oauth_${error}`);
    }
    
    if (!code) {
      console.error('🔐 [GOOGLE SSO] ❌ No authorization code received');
      return res.redirect('/?error=oauth_failed');
    }
    
    console.log('🔐 [GOOGLE SSO] ✅ Authorization code received successfully');
    
    // Get OAuth settings
    const settingsObj = getOAuthSettings(db);
    
    if (!settingsObj.GOOGLE_CLIENT_ID || !settingsObj.GOOGLE_CLIENT_SECRET || !settingsObj.GOOGLE_CALLBACK_URL) {
      console.error('🔐 [GOOGLE SSO] ❌ OAuth settings not configured in callback');
      return res.redirect('/?error=oauth_not_configured');
    }
    
    console.log('🔐 [GOOGLE SSO] Preparing token exchange with Google...');
    
    // Exchange code for access token
    const tokenPayload = {
      client_id: settingsObj.GOOGLE_CLIENT_ID,
      client_secret: settingsObj.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: settingsObj.GOOGLE_CALLBACK_URL
    };
    
    console.log('🔐 [GOOGLE SSO] Token exchange payload:', {
      client_id: settingsObj.GOOGLE_CLIENT_ID.substring(0, 20) + '...',
      grant_type: tokenPayload.grant_type,
      redirect_uri: tokenPayload.redirect_uri,
      codeLength: code.length
    });
    
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenPayload)
    });
    
    console.log('🔐 [GOOGLE SSO] Token exchange response:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      ok: tokenResponse.ok
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('🔐 [GOOGLE SSO] ❌ Google token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText
      });
      return res.redirect('/?error=oauth_token_failed');
    }
    
    const tokenData = await tokenResponse.json();
    console.log('🔐 [GOOGLE SSO] ✅ Token exchange successful:', {
      hasAccessToken: !!tokenData.access_token,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in
    });
    
    // Get user info from Google
    console.log('🔐 [GOOGLE SSO] Fetching user info from Google...');
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    console.log('🔐 [GOOGLE SSO] User info response:', {
      status: userInfoResponse.status,
      statusText: userInfoResponse.statusText,
      ok: userInfoResponse.ok
    });
    
    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      console.error('🔐 [GOOGLE SSO] ❌ Google user info failed:', {
        status: userInfoResponse.status,
        statusText: userInfoResponse.statusText,
        error: errorText
      });
      return res.redirect('/?error=oauth_userinfo_failed');
    }
    
    const userInfo = await userInfoResponse.json();
    console.log('🔐 [GOOGLE SSO] ✅ User info received from Google:', {
      email: userInfo.email,
      name: userInfo.name,
      given_name: userInfo.given_name,
      family_name: userInfo.family_name,
      picture: userInfo.picture ? 'provided' : 'not_provided',
      verified_email: userInfo.verified_email
    });
    
    // Check if user exists
    console.log('🔐 [GOOGLE SSO] Checking if user exists in database...');
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(userInfo.email);
    let isNewUser = false;
    
    console.log('🔐 [GOOGLE SSO] User lookup result:', {
      userExists: !!user,
      userEmail: userInfo.email
    });
    
    if (!user) {
      console.log('🔐 [GOOGLE SSO] Creating new user account...');
      // Create new user
      const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      console.log('🔐 [GOOGLE SSO] Generated user ID:', userId);
      
      // Generate a dummy password hash for Google users (they don't have passwords)
      const dummyPasswordHash = await bcrypt.hash('google-oauth-user', 10);
      const userStmt = db.prepare(`
        INSERT INTO users (id, email, first_name, last_name, auth_provider, google_avatar_url, password_hash) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      try {
        userStmt.run(userId, userInfo.email, userInfo.given_name || '', userInfo.family_name || '', 'google', userInfo.picture, dummyPasswordHash);
        console.log('🔐 [GOOGLE SSO] ✅ User created in database');
      } catch (error) {
        console.error('🔐 [GOOGLE SSO] ❌ Failed to create user:', error);
        return res.redirect('/?error=user_creation_failed');
      }
      
      // Assign user role
      console.log('🔐 [GOOGLE SSO] Assigning user role...');
      try {
        const userRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id;
        const userRoleStmt = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
        userRoleStmt.run(userId, userRoleId);
        console.log('🔐 [GOOGLE SSO] ✅ User role assigned');
      } catch (error) {
        console.error('🔐 [GOOGLE SSO] ❌ Failed to assign user role:', error);
      }
      
      // Create team member
      console.log('🔐 [GOOGLE SSO] Creating team member...');
      try {
        const memberName = userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim();
        const memberColor = '#' + Math.floor(Math.random()*16777215).toString(16);
        const memberStmt = db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)');
        memberStmt.run(userId, memberName, memberColor, userId);
        console.log('🔐 [GOOGLE SSO] ✅ Team member created:', { memberName, memberColor });
      } catch (error) {
        console.error('🔐 [GOOGLE SSO] ❌ Failed to create team member:', error);
      }
      
      user = { id: userId, email: userInfo.email, firstName: userInfo.given_name, lastName: userInfo.family_name };
      isNewUser = true;
      console.log('🔐 [GOOGLE SSO] ✅ New user setup complete');
    } else {
      console.log('🔐 [GOOGLE SSO] ✅ Existing user found, proceeding with login');
    }
    
    // Get user roles from database (for both new and existing users)
    console.log('🔐 [GOOGLE SSO] Fetching user roles...');
    const roles = db.prepare(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `).all(user.id);
    
    const userRoles = roles.map(r => r.name);
    console.log('🔐 [GOOGLE SSO] User roles found:', userRoles);
    
    // Generate JWT token - must match local login structure
    console.log('🔐 [GOOGLE SSO] Generating JWT token...');
    const jwtPayload = { 
      id: user.id, 
      email: user.email,
      role: userRoles.includes('admin') ? 'admin' : 'user',
      roles: userRoles
    };
    
    const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    console.log('🔐 [GOOGLE SSO] ✅ JWT token generated:', {
      userId: user.id,
      email: user.email,
      role: jwtPayload.role,
      roles: userRoles,
      tokenLength: token.length
    });
    
    // Prepare redirect URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const redirectUrl = isNewUser 
      ? `${baseUrl}/#login?token=${token}&newUser=true`
      : `${baseUrl}/#login?token=${token}`;
    
    console.log('🔐 [GOOGLE SSO] Preparing redirect:', {
      isNewUser,
      redirectUrl: redirectUrl.replace(/token=[^&]+/, 'token=***'),
      baseUrl
    });
    
    // Redirect to login page with token and newUser flag
    console.log('🔐 [GOOGLE SSO] ======== AUTHENTICATION COMPLETE ========');
    if (isNewUser) {
      res.redirect(`/#login?token=${token}&newUser=true`);
    } else {
      res.redirect(`/#login?token=${token}`);
    }
    
  } catch (error) {
    console.error('🔐 [GOOGLE SSO] ❌ ======== AUTHENTICATION FAILED ========');
    console.error('🔐 [GOOGLE SSO] ❌ Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    console.error('🔐 [GOOGLE SSO] ❌ Request context:', {
      url: req.url,
      query: req.query,
      headers: {
        host: req.headers.host,
        referer: req.headers.referer,
        userAgent: req.headers['user-agent']?.substring(0, 100)
      }
    });
    res.redirect('/?error=oauth_failed');
  }
});

// Manual OAuth config reload endpoint (for testing)
router.post('/reload-oauth', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    if (global.oauthConfigCache) {
      global.oauthConfigCache.invalidated = true;
      console.log('🔄 Manual OAuth config reload triggered by admin');
    }
    res.json({ message: 'OAuth configuration reloaded successfully' });
  } catch (error) {
    console.error('Reload OAuth error:', error);
    res.status(500).json({ error: 'Failed to reload OAuth configuration' });
  }
});

// Debug endpoint to check OAuth configuration (Admin only)
router.get('/debug/oauth', authenticateToken, requireRole(['admin']), (req, res) => {
  try {
    console.log('🔍 [DEBUG] OAuth configuration debug requested by admin');
    const db = req.app.locals.db;
    const settingsObj = getOAuthSettings(db);
    
    const debugInfo = {
      timestamp: new Date().toISOString(),
      server: {
        nodeVersion: process.version,
        platform: process.platform,
        host: req.headers.host,
        protocol: req.protocol,
        baseUrl: `${req.protocol}://${req.get('host')}`
      },
      oauth: {
        hasClientId: !!settingsObj.GOOGLE_CLIENT_ID,
        hasClientSecret: !!settingsObj.GOOGLE_CLIENT_SECRET,
        hasCallbackUrl: !!settingsObj.GOOGLE_CALLBACK_URL,
        clientIdPrefix: settingsObj.GOOGLE_CLIENT_ID ? settingsObj.GOOGLE_CLIENT_ID.substring(0, 20) + '...' : 'NOT_SET',
        callbackUrl: settingsObj.GOOGLE_CALLBACK_URL || 'NOT_SET'
      },
      environment: {
        JWT_SECRET_LENGTH: JWT_SECRET ? JWT_SECRET.length : 0,
        JWT_EXPIRES_IN,
        cacheStatus: global.oauthConfigCache ? 'ACTIVE' : 'NOT_INITIALIZED'
      }
    };
    
    console.log('🔍 [DEBUG] OAuth debug info:', debugInfo);
    res.json(debugInfo);
  } catch (error) {
    console.error('🔍 [DEBUG] OAuth debug error:', error);
    res.status(500).json({ error: 'Failed to get OAuth debug info' });
  }
});

export default router;
