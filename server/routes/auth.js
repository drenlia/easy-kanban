import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken, requireRole, JWT_SECRET, JWT_EXPIRES_IN } from '../middleware/auth.js';

const router = express.Router();

// Helper function to get OAuth settings with caching
function getOAuthSettings(db) {
  // Check if we have cached settings and no cache invalidation flag
  if (global.oauthConfigCache && !global.oauthConfigCache.invalidated) {
    return global.oauthConfigCache.settings;
  }
  
  // Fetch fresh settings from database
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
  
  console.log('🔄 OAuth settings loaded from database:', Object.keys(settingsObj).map(k => `${k}: ${settingsObj[k] ? '✓' : '✗'}`).join(', '));
  return settingsObj;
}

// Google OAuth endpoints
router.get('/google/url', (req, res) => {
  try {
    const db = req.app.locals.db;
    const settingsObj = getOAuthSettings(db);
    
    if (!settingsObj.GOOGLE_CLIENT_ID || !settingsObj.GOOGLE_CLIENT_SECRET || !settingsObj.GOOGLE_CALLBACK_URL) {
      return res.status(400).json({ error: 'Google OAuth not fully configured. Please set Client ID, Client Secret, and Callback URL.' });
    }
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(settingsObj.GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(settingsObj.GOOGLE_CALLBACK_URL)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('openid email profile')}` +
      `&access_type=offline`;
    
    res.json({ url: googleAuthUrl });
  } catch (error) {
    console.error('Error generating Google OAuth URL:', error);
    res.status(500).json({ error: 'Failed to generate OAuth URL' });
  }
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const db = req.app.locals.db;
    
    if (!code) {
      return res.redirect('/?error=oauth_failed');
    }
    
    // Get OAuth settings
    const settingsObj = getOAuthSettings(db);
    
    if (!settingsObj.GOOGLE_CLIENT_ID || !settingsObj.GOOGLE_CLIENT_SECRET || !settingsObj.GOOGLE_CALLBACK_URL) {
      return res.redirect('/?error=oauth_not_configured');
    }
    
    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: settingsObj.GOOGLE_CLIENT_ID,
        client_secret: settingsObj.GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: settingsObj.GOOGLE_CALLBACK_URL
      })
    });
    
    if (!tokenResponse.ok) {
      console.error('Google token exchange failed:', await tokenResponse.text());
      return res.redirect('/?error=oauth_token_failed');
    }
    
    const tokenData = await tokenResponse.json();
    
    // Get user info from Google
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    if (!userInfoResponse.ok) {
      console.error('Google user info failed:', await userInfoResponse.text());
      return res.redirect('/?error=oauth_userinfo_failed');
    }
    
    const userInfo = await userInfoResponse.json();
    
    // Check if user exists
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(userInfo.email);
    let isNewUser = false;
    
    if (!user) {
      // Create new user
      const userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      // Generate a dummy password hash for Google users (they don't have passwords)
      const dummyPasswordHash = await bcrypt.hash('google-oauth-user', 10);
      const userStmt = db.prepare(`
        INSERT INTO users (id, email, first_name, last_name, auth_provider, google_avatar_url, password_hash) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      userStmt.run(userId, userInfo.email, userInfo.given_name || '', userInfo.family_name || '', 'google', userInfo.picture, dummyPasswordHash);
      
      // Assign user role
      const userRoleId = db.prepare('SELECT id FROM roles WHERE name = ?').get('user').id;
      const userRoleStmt = db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
      userRoleStmt.run(userId, userRoleId);
      
      // Create team member
      const memberName = userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim();
      const memberColor = '#' + Math.floor(Math.random()*16777215).toString(16);
      const memberStmt = db.prepare('INSERT INTO members (id, name, color, user_id) VALUES (?, ?, ?, ?)');
      memberStmt.run(userId, memberName, memberColor, userId);
      
      user = { id: userId, email: userInfo.email, firstName: userInfo.given_name, lastName: userInfo.family_name };
      isNewUser = true;
    }
    
    // Get user roles from database (for both new and existing users)
    const roles = db.prepare(`
      SELECT r.name 
      FROM roles r 
      JOIN user_roles ur ON r.id = ur.role_id 
      WHERE ur.user_id = ?
    `).all(user.id);
    
    const userRoles = roles.map(r => r.name);
    
    // Generate JWT token - must match local login structure
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        role: userRoles.includes('admin') ? 'admin' : 'user',
        roles: userRoles
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    
    // Redirect to login page with token and newUser flag
    if (isNewUser) {
      res.redirect(`/#login?token=${token}&newUser=true`);
    } else {
      res.redirect(`/#login?token=${token}`);
    }
    
  } catch (error) {
    console.error('Google OAuth callback error:', error);
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

export default router;
