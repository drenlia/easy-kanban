import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireRole, JWT_SECRET, JWT_EXPIRES_IN } from '../middleware/auth.js';
import { getLicenseManager } from '../config/license.js';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();

// Helper function for conditional debug logging
function debugLog(settingsObj, ...args) {
  if (settingsObj && settingsObj.GOOGLE_SSO_DEBUG === 'true') {
    console.log(...args);
  }
}

// Helper function to get OAuth settings with caching
function getOAuthSettings(db) {
  // Check if we have cached settings and no cache invalidation flag
  if (global.oauthConfigCache && !global.oauthConfigCache.invalidated) {
    console.log('🔄 [GOOGLE SSO] Using cached OAuth settings');
    return global.oauthConfigCache.settings;
  }
  
  // Fetch fresh settings from database
  const settings = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)').all('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CALLBACK_URL', 'GOOGLE_SSO_DEBUG');
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
  
  // Always log basic OAuth config status, detailed logs only if debug enabled
  console.log('🔄 [GOOGLE SSO] OAuth settings loaded:', Object.keys(settingsObj).filter(k => k !== 'GOOGLE_SSO_DEBUG').map(k => `${k}: ${settingsObj[k] ? '✓' : '✗'}`).join(', '), `[DEBUG: ${settingsObj.GOOGLE_SSO_DEBUG === 'true' ? 'ON' : 'OFF'}]`);
  debugLog(settingsObj, '🔄 [GOOGLE SSO] OAuth settings details:', {
    GOOGLE_CLIENT_ID: settingsObj.GOOGLE_CLIENT_ID ? `${settingsObj.GOOGLE_CLIENT_ID.substring(0, 20)}...` : 'NOT_SET',
    GOOGLE_CLIENT_SECRET: settingsObj.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT_SET',
    GOOGLE_CALLBACK_URL: settingsObj.GOOGLE_CALLBACK_URL || 'NOT_SET',
    DEBUG_ENABLED: settingsObj.GOOGLE_SSO_DEBUG === 'true'
  });
  
  return settingsObj;
}

// Google OAuth endpoints
router.get('/google/url', (req, res) => {
  try {
    const db = req.app.locals.db;
    const settingsObj = getOAuthSettings(db);
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Starting Google OAuth URL generation...');
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Request headers:', {
      host: req.headers.host,
      origin: req.headers.origin,
      referer: req.headers.referer,
      userAgent: req.headers['user-agent']?.substring(0, 50) + '...'
    });
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] OAuth settings validation:', {
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
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] ✅ Generated OAuth URL successfully');
    debugLog(settingsObj, '🔐 [GOOGLE SSO] OAuth URL components:', {
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
    const { code, error, error_description } = req.query;
    const db = req.app.locals.db;
    
    // Get OAuth settings first to check debug mode
    const settingsObj = getOAuthSettings(db);
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] ======== CALLBACK STARTED ========');
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Raw callback URL:', req.originalUrl);
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Callback request details:', {
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
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] ✅ Authorization code received successfully');
    
    if (!settingsObj.GOOGLE_CLIENT_ID || !settingsObj.GOOGLE_CLIENT_SECRET || !settingsObj.GOOGLE_CALLBACK_URL) {
      console.error('🔐 [GOOGLE SSO] ❌ OAuth settings not configured in callback');
      return res.redirect('/?error=oauth_not_configured');
    }
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Preparing token exchange with Google...');
    
    // Exchange code for access token
    const tokenPayload = {
      client_id: settingsObj.GOOGLE_CLIENT_ID,
      client_secret: settingsObj.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: settingsObj.GOOGLE_CALLBACK_URL
    };
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Token exchange payload:', {
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
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Token exchange response:', {
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
    debugLog(settingsObj, '🔐 [GOOGLE SSO] ✅ Token exchange successful:', {
      hasAccessToken: !!tokenData.access_token,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in
    });
    
    // Get user info from Google
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Fetching user info from Google...');
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] User info response:', {
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
    debugLog(settingsObj, '🔐 [GOOGLE SSO] ✅ User info received from Google:', {
      email: userInfo.email,
      name: userInfo.name,
      given_name: userInfo.given_name,
      family_name: userInfo.family_name,
      picture: userInfo.picture ? 'provided' : 'not_provided',
      verified_email: userInfo.verified_email
    });
    
    // Check if user exists
    debugLog(settingsObj, '🔐 [GOOGLE SSO] Checking if user exists in database...');
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(userInfo.email);
    let isNewUser = false;
    
    debugLog(settingsObj, '🔐 [GOOGLE SSO] User lookup result:', {
      userExists: !!user,
      userEmail: userInfo.email
    });
    
    if (!user) {
      console.log('🔐 [GOOGLE SSO] ❌ User not found in system:', userInfo.email);
      debugLog(settingsObj, '🔐 [GOOGLE SSO] User must be invited first before using Google OAuth');
      return res.redirect('/?error=user_not_invited');
    } else {
      console.log('🔐 [GOOGLE SSO] ✅ Existing user found, checking if active...');
      
      // Check if user is active
      if (!user.is_active) {
        // Special case: invited user (local auth, inactive) logging in with Google for the first time
        if (user.auth_provider === 'local') {
          console.log('🔐 [GOOGLE SSO] 🎯 Invited user activating via Google SSO:', userInfo.email);
          debugLog(settingsObj, '🔐 [GOOGLE SSO] Auto-activating invited user via Google OAuth');
          
          try {
            // Activate the account and convert to Google auth
            db.prepare(`
              UPDATE users 
              SET is_active = 1,
                  auth_provider = 'google', 
                  google_avatar_url = ?,
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(userInfo.picture, user.id);
            
            // Clean up any pending invitation tokens for this user
            db.prepare('DELETE FROM user_invitations WHERE user_id = ? AND used_at IS NULL').run(user.id);
            
            console.log('🔐 [GOOGLE SSO] ✅ Invited user activated and converted to Google auth');
            
            // Update user object to reflect activation
            user.is_active = 1;
            user.auth_provider = 'google';
          } catch (error) {
            console.error('🔐 [GOOGLE SSO] ❌ Failed to activate invited user:', error);
            return res.redirect('/?error=activation_failed');
          }
        } else {
          // User was previously active but has been deactivated (not an invitation case)
          console.log('🔐 [GOOGLE SSO] ❌ User account is deactivated:', userInfo.email);
          debugLog(settingsObj, '🔐 [GOOGLE SSO] Deactivated user attempted to login via Google OAuth');
          return res.redirect('/?error=account_deactivated');
        }
      } else {
        console.log('🔐 [GOOGLE SSO] ✅ User is active, proceeding with login');
        
        // Update auth_provider to 'google' and store Google avatar (for users converting from local to Google)
        if (user.auth_provider !== 'google') {
          console.log('🔐 [GOOGLE SSO] Converting user from local to Google auth...');
          try {
            db.prepare(`
              UPDATE users 
              SET auth_provider = 'google', 
                  google_avatar_url = ?,
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(userInfo.picture, user.id);
            console.log('🔐 [GOOGLE SSO] ✅ User auth_provider updated to google');
          } catch (error) {
            console.error('🔐 [GOOGLE SSO] ❌ Failed to update auth_provider:', error);
          }
        } else {
          // Just update the Google avatar in case it changed
          try {
            db.prepare(`
              UPDATE users 
              SET google_avatar_url = ?,
                  updated_at = datetime('now')
              WHERE id = ?
            `).run(userInfo.picture, user.id);
          } catch (error) {
            console.error('🔐 [GOOGLE SSO] ❌ Failed to update Google avatar:', error);
          }
        }
      }
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
    
    // Clear force_logout flag on successful login
    db.prepare('UPDATE users SET force_logout = 0 WHERE id = ?').run(user.id);
    
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

// Test endpoint to verify callback routing (no auth required for testing)
router.get('/test/callback', (req, res) => {
  console.log('🧪 [TEST] Callback test endpoint hit!', {
    url: req.url,
    query: req.query,
    headers: {
      host: req.headers.host,
      'x-forwarded-host': req.headers['x-forwarded-host'],
      'x-forwarded-proto': req.headers['x-forwarded-proto'],
      origin: req.headers.origin,
      referer: req.headers.referer
    }
  });
  res.json({ 
    message: 'Callback routing test successful!', 
    timestamp: new Date().toISOString(),
    receivedAt: `${req.protocol}://${req.get('host')}${req.originalUrl}`
  });
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

// Check instance status for logged-in users
router.get('/instance-status', authenticateToken, (req, res) => {
  try {
    const db = req.app.locals.db;
    const statusSetting = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('INSTANCE_STATUS');
    const status = statusSetting ? statusSetting.value : 'active';
    
    const getStatusMessage = (status) => {
      switch (status) {
        case 'active':
          return 'This instance is running normally.';
        case 'suspended':
          return 'This instance has been temporarily suspended. Please contact support for assistance.';
        case 'terminated':
          return 'This instance has been terminated. Please contact support for assistance.';
        case 'failed':
          return 'This instance failed to deploy properly. Please contact support for assistance.';
        case 'deploying':
          return 'This instance is currently being deployed. Please try again in a few minutes.';
        default:
          return 'This instance is currently unavailable. Please contact support.';
      }
    };
    
    res.json({
      status: status,
      isActive: status === 'active',
      message: getStatusMessage(status),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error checking instance status:', error);
    res.status(500).json({ error: 'Failed to check instance status' });
  }
});

// Check if current user is instance owner
router.get('/is-owner', authenticateToken, (req, res) => {
  try {
    const ownerSetting = wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('OWNER');
    const ownerEmail = ownerSetting ? ownerSetting.value : null;
    
    const isOwner = ownerEmail === req.user.email;
    
    res.json({
      isOwner: isOwner,
      ownerEmail: ownerEmail,
      currentUser: req.user.email
    });
  } catch (error) {
    console.error('Error checking owner status:', error);
    res.status(500).json({ error: 'Failed to check owner status' });
  }
});

// License info endpoint (Admin only)
router.get('/license-info', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const licenseManager = getLicenseManager(req.app.locals.db);
    const licenseInfo = await licenseManager.getLicenseInfo();
    
    res.json(licenseInfo);
  } catch (error) {
    console.error('Error fetching license info:', error);
    res.status(500).json({ error: 'Failed to fetch license info' });
  }
});

export default router;
