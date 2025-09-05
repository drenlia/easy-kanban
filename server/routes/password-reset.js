import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { wrapQuery } from '../utils/queryLogger.js';

const router = express.Router();

// Request password reset
router.post('/request', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    const { db } = req.app.locals;
    
    // Find user by email
    const user = wrapQuery(
      db.prepare('SELECT id, email, first_name, last_name FROM users WHERE email = ? AND is_active = 1'), 
      'SELECT'
    ).get(email);
    
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return res.json({ 
        message: 'If an account with that email exists, you will receive a password reset link shortly.' 
      });
    }
    
    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    // Store reset token in database
    wrapQuery(
      db.prepare(`
        INSERT INTO password_reset_tokens (user_id, token, expires_at) 
        VALUES (?, ?, ?)
      `), 
      'INSERT'
    ).run(user.id, resetToken, expiresAt.toISOString());
    
    // TODO: Send email with reset link
    // For now, we'll just log the reset link for development
    // Build reset URL using origin, host, or fallback
    let baseUrl = req.get('origin');
    if (!baseUrl) {
      const host = req.get('host');
      const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      baseUrl = host ? `${protocol}://${host}` : 'http://localhost:3000';
    }
    const resetUrl = `${baseUrl}/#reset-password?token=${resetToken}`;
    console.log('🔐 Password reset requested for:', user.email);
    console.log('🔗 Reset URL:', resetUrl);
    
    // Check if email is enabled in settings
    const mailEnabledSetting = wrapQuery(
      db.prepare('SELECT value FROM settings WHERE key = ?'), 
      'SELECT'
    ).get('MAIL_ENABLED');
    
    if (mailEnabledSetting && mailEnabledSetting.value === 'true') {
      // Get email settings
      const emailSettings = {};
      const settingsKeys = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM', 'SITE_NAME'];
      
      settingsKeys.forEach(key => {
        const setting = wrapQuery(
          db.prepare('SELECT value FROM settings WHERE key = ?'), 
          'SELECT'
        ).get(key);
        emailSettings[key] = setting ? setting.value : '';
      });
      
      // Send email using EmailService
      try {
        const EmailService = await import('../services/emailService.js');
        const emailService = new EmailService.default(db);
        await emailService.sendPasswordResetEmail(user, resetToken, resetUrl);
        console.log('✅ Password reset email sent to:', user.email);
      } catch (emailError) {
        console.error('❌ Failed to send password reset email:', emailError);
        // Don't reveal email sending failures to user
      }
    } else {
      console.log('📧 Email not configured. Reset link logged above.');
    }
    
    res.json({ 
      message: 'If an account with that email exists, you will receive a password reset link shortly.' 
    });
    
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password with token
router.post('/reset', async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  try {
    const { db } = req.app.locals;
    
    // Find valid reset token
    const resetToken = wrapQuery(
      db.prepare(`
        SELECT rt.*, u.email, u.first_name, u.last_name 
        FROM password_reset_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token = ? AND rt.expires_at > datetime('now') AND rt.used = 0
      `), 
      'SELECT'
    ).get(token);
    
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Use transaction to update password and mark token as used
    db.transaction(() => {
      // Update user password
      wrapQuery(
        db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?'), 
        'UPDATE'
      ).run(passwordHash, resetToken.user_id);
      
      // Mark token as used
      wrapQuery(
        db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?'), 
        'UPDATE'
      ).run(resetToken.id);
    })();
    
    console.log('✅ Password reset successful for:', resetToken.email);
    
    res.json({ 
      message: 'Password has been reset successfully. You can now login with your new password.'
    });
    
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Verify reset token (for frontend validation)
router.get('/verify/:token', (req, res) => {
  const { token } = req.params;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  try {
    const { db } = req.app.locals;
    
    // Check if token is valid
    const resetToken = wrapQuery(
      db.prepare(`
        SELECT rt.*, u.email 
        FROM password_reset_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token = ? AND rt.expires_at > datetime('now') AND rt.used = 0
      `), 
      'SELECT'
    ).get(token);
    
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    res.json({ 
      valid: true, 
      email: resetToken.email,
      expiresAt: resetToken.expires_at 
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

// Email functionality now handled by EmailService in services/emailService.js

export default router;
