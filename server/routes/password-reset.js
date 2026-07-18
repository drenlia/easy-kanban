import express from 'express';
import { dbExec } from '../utils/dbAsync.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { getRequestDatabase } from '../middleware/tenantRouting.js';
// MIGRATED: Import sqlManager
import { passwordReset as passwordResetQueries, auth as authQueries } from '../utils/sqlManager/index.js';

const router = express.Router();

// Password reset request rate limiter: 3 attempts per hour
const passwordResetRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset requests per hour
  message: {
    error: 'Too many password reset requests, please try again in 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Password reset completion rate limiter: 6 attempts per hour (more generous)
const passwordResetCompletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 6, // 6 password reset completions per hour
  message: {
    error: 'Too many password reset attempts, please try again in 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Request password reset
router.post('/request', passwordResetRequestLimiter, async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Find user by email using sqlManager
    const user = await passwordResetQueries.getUserByEmailForPasswordReset(db, email);
    
    if (!user) {
      // Return success even if user doesn't exist (security best practice)
      return res.json({ 
        message: 'If an account with that email exists, you will receive a password reset link shortly.' 
      });
    }
    
    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    
    // MIGRATED: Store reset token using sqlManager
    try {
      await passwordResetQueries.createPasswordResetToken(db, user.id, resetToken, expiresAt.toISOString());
    } catch (tokenError) {
      // Handle duplicate key error (sequence out of sync in PostgreSQL)
      if (tokenError.code === '23505' && tokenError.constraint === 'password_reset_tokens_pkey') {
        console.error('⚠️ Password reset token sequence out of sync. Attempting to fix...');
        // Try to reset the sequence (PostgreSQL only)
        try {
          // MIGRATED: Get max id using sqlManager
          const maxId = await passwordResetQueries.getMaxPasswordResetTokenId(db);
          const nextId = maxId + 1;

          // Reset sequence using dbExec (raw SQL execution)
          await dbExec(db, `SELECT setval('password_reset_tokens_id_seq', ${nextId}, false)`);
          console.log(`✅ Reset password_reset_tokens_id_seq to ${nextId}`);

          // Retry the insert
          await passwordResetQueries.createPasswordResetToken(db, user.id, resetToken, expiresAt.toISOString());
        } catch (fixError) {
          console.error('❌ Failed to fix sequence:', fixError);
          throw tokenError; // Re-throw original error
        }
      } else {
        throw tokenError; // Re-throw if it's a different error
      }
    }
    
    // Build reset URL using APP_URL from database (tenant-specific)
    // Priority: 1) APP_URL from database, 2) Construct from tenantId, 3) Request origin/host, 4) Fallback
    let baseUrl = null;
    
    // MIGRATED: Try to get APP_URL from database using sqlManager
    const appUrlSetting = await authQueries.getSetting(db, 'APP_URL');
    
    if (appUrlSetting?.value) {
      baseUrl = appUrlSetting.value.replace(/\/$/, '');
    } else {
      // Construct from tenantId if available (multi-tenant mode)
      const tenantId = req.tenantId;
      if (tenantId) {
        const domain = process.env.TENANT_DOMAIN || 'ezkan.cloud';
        baseUrl = `https://${tenantId}.${domain}`;
      } else {
        // Fallback to request origin/host
        baseUrl = req.get('origin');
        if (!baseUrl) {
          const host = req.get('host');
          const protocol = req.secure || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
          baseUrl = host ? `${protocol}://${host}` : 'http://localhost:3000';
        }
      }
    }
    
    const resetUrl = `${baseUrl}/#reset-password?token=${resetToken}`;
    console.log('🔐 Password reset requested for:', user.email);
    console.log('🔗 Reset URL:', resetUrl);
    
    // Send email using EmailService (which handles MAIL_ENABLED check and SMTP_ settings internally)
    try {
      const EmailService = await import('../services/emailService.js');
      const emailService = new EmailService.default(db);
      // Normalize user object for email service (handle camelCase from sqlManager)
      const userForEmail = {
        id: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName
      };
      await emailService.sendPasswordResetEmail(userForEmail, resetToken, resetUrl);
      console.log('✅ Password reset email sent to:', user.email);
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError);
      // Don't reveal email sending failures to user (EmailService handles validation internally)
      console.log('📧 Email not configured or failed. Reset link logged above.');
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
router.post('/reset', passwordResetCompletionLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Find valid reset token using sqlManager
    const resetToken = await passwordResetQueries.getPasswordResetToken(db, token);
    
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password and mark token as used in one batched transaction
    const userId = resetToken.userId || resetToken.user_id;
    await db.executeBatchTransaction([
      {
        query: 'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        params: [passwordHash, userId]
      },
      {
        query: 'UPDATE password_reset_tokens SET used = true WHERE id = $1',
        params: [resetToken.id]
      }
    ]);

    
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
router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;
  
  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }
  
  try {
    const db = getRequestDatabase(req);
    
    // MIGRATED: Check if token is valid using sqlManager
    const resetToken = await passwordResetQueries.verifyPasswordResetToken(db, token);
    
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    
    res.json({ 
      valid: true, 
      email: resetToken.email,
      expiresAt: resetToken.expiresAt || resetToken.expires_at 
    });
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

// Email functionality now handled by EmailService in services/emailService.js

export default router;
