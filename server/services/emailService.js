import nodemailer from 'nodemailer';
import { wrapQuery } from '../utils/queryLogger.js';
import { EmailTemplates } from './emailTemplates.js';

/**
 * Email Service - Handles all email functionality across the app
 */
class EmailService {
  constructor(db) {
    this.db = db;
    this.transporter = null;
  }

  /**
   * Get email settings from database (async to support proxy databases)
   */
  async getEmailSettings() {
    const emailSettings = {};
    const settingsKeys = ['MAIL_ENABLED', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME', 'SMTP_SECURE', 'SITE_NAME'];
    
    // Use Promise.all to fetch all settings in parallel
    const settingPromises = settingsKeys.map(async (key) => {
      const setting = await wrapQuery(
        this.db.prepare('SELECT value FROM settings WHERE key = ?'), 
        'SELECT'
      ).get(key);
      let value = setting ? setting.value : '';
      
      // Set default value for SMTP_SECURE if not set
      if (key === 'SMTP_SECURE' && !value) {
        value = 'tls'; // Default to TLS
      }
      
      return { key, value };
    });
    
    const settings = await Promise.all(settingPromises);
    settings.forEach(({ key, value }) => {
      emailSettings[key] = value;
    });
    
    return emailSettings;
  }

  /**
   * Check if email is enabled and properly configured
   */
  async validateEmailConfig() {
    const settings = await this.getEmailSettings();
    
    // Check if email is enabled
    if (settings.MAIL_ENABLED !== 'true') {
      return {
        valid: false,
        error: 'Email is not enabled',
        details: 'Set MAIL_ENABLED to "true" in settings to use email functionality',
        settings: {
          ...settings,
          SMTP_PASSWORD: settings.SMTP_PASSWORD ? '[HIDDEN]' : '[NOT SET]'
        }
      };
    }

    // Check if demo mode is enabled
    if (process.env.DEMO_ENABLED === 'true') {
      return {
        valid: false,
        error: 'Email disabled in demo mode',
        details: 'Email functionality is disabled in demo environments to prevent sending emails',
        demoMode: true
      };
    }

    // Validate required settings
    const requiredSettings = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'];
    const missingSettings = requiredSettings.filter(key => !settings[key]);
    
    if (missingSettings.length > 0) {
      return {
        valid: false,
        error: 'Missing required email settings',
        details: `Missing: ${missingSettings.join(', ')}`,
        missingSettings,
        currentSettings: {
          ...settings,
          SMTP_PASSWORD: settings.SMTP_PASSWORD ? '[HIDDEN]' : '[NOT SET]'
        }
      };
    }

    return { valid: true, settings };
  }

  /**
   * Validate email configuration for testing (doesn't require MAIL_ENABLED to be true)
   */
  async validateEmailConfigForTesting() {
    const settings = await this.getEmailSettings();
    
    // Check if demo mode is enabled
    if (process.env.DEMO_ENABLED === 'true') {
      return {
        valid: false,
        error: 'Email disabled in demo mode',
        details: 'Email functionality is disabled in demo environments to prevent sending emails',
        demoMode: true
      };
    }

    // Validate required settings (excluding MAIL_ENABLED)
    const requiredSettings = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'];
    const missingSettings = requiredSettings.filter(key => !settings[key]);
    
    if (missingSettings.length > 0) {
      return {
        valid: false,
        error: 'Missing required email settings',
        details: `Missing: ${missingSettings.join(', ')}`,
        missingSettings,
        currentSettings: {
          ...settings,
          SMTP_PASSWORD: settings.SMTP_PASSWORD ? '[HIDDEN]' : '[NOT SET]'
        }
      };
    }

    return { valid: true, settings };
  }

  /**
   * Create and configure nodemailer transporter
   */
  async createTransporter(settings) {
    if (!settings) {
      const validation = await this.validateEmailConfig();
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      settings = validation.settings;
    }

    // Ensure SMTP_SECURE has a default value
    const smtpSecure = settings.SMTP_SECURE || 'tls';
    
    const transporter = nodemailer.createTransport({
      host: settings.SMTP_HOST,
      port: parseInt(settings.SMTP_PORT),
      secure: smtpSecure === 'ssl', // true for SSL (port 465), false for TLS (port 587)
      auth: {
        user: settings.SMTP_USERNAME,
        pass: settings.SMTP_PASSWORD
      },
      // Additional options for better compatibility
      requireTLS: smtpSecure === 'tls',
      tls: {
        rejectUnauthorized: false // Allow self-signed certificates
      }
    });

    // Verify SMTP connection
    await transporter.verify();
    this.transporter = transporter;
    
    return transporter;
  }

  /**
   * Send test email to verify configuration
   */
  async sendTestEmail(recipientEmail) {
    const validation = await this.validateEmailConfigForTesting();
    if (!validation.valid) {
      throw validation;
    }

    const settings = validation.settings;
    const transporter = await this.createTransporter(settings);

    const testEmailContent = {
      from: `"${settings.SMTP_FROM_NAME || 'Easy Kanban'}" <${settings.SMTP_FROM_EMAIL}>`,
      to: recipientEmail,
      subject: `Email Test - ${settings.SITE_NAME || 'Easy Kanban'}`,
      text: `Hello!\n\nThis is a test email from your Easy Kanban application.\n\nIf you're reading this, your email configuration is working correctly!\n\nSent at: ${new Date().toISOString()}\n\nBest regards,\nEasy Kanban System`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">📧 Email Test Successful!</h2>
          <p>Hello!</p>
          <p>This is a test email from your <strong>Easy Kanban</strong> application.</p>
          <p>If you're reading this, your email configuration is working correctly! 🎉</p>
          <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Test Details:</strong></p>
            <ul>
              <li><strong>Sent at:</strong> ${new Date().toISOString()}</li>
              <li><strong>From:</strong> ${settings.SMTP_FROM_EMAIL}</li>
              <li><strong>SMTP Host:</strong> ${settings.SMTP_HOST}</li>
              <li><strong>SMTP Port:</strong> ${settings.SMTP_PORT}</li>
              <li><strong>Security:</strong> ${(settings.SMTP_SECURE || 'tls').toUpperCase()}</li>
            </ul>
          </div>
          <p>Best regards,<br><strong>Easy Kanban System</strong></p>
        </div>
      `
    };

    console.log('📧 Sending test email to:', recipientEmail);
    const info = await transporter.sendMail(testEmailContent);
    console.log('✅ Test email sent successfully:', info.messageId);

    return {
      success: true,
      message: 'Email sent successfully!',
      messageId: info.messageId,
      timestamp: new Date().toISOString(),
      settings: {
        to: recipientEmail,
        host: settings.SMTP_HOST,
        port: settings.SMTP_PORT,
        secure: (settings.SMTP_SECURE || 'tls').toUpperCase(),
        from: settings.SMTP_FROM_EMAIL,
        user: settings.SMTP_USERNAME
      },
      emailSent: true
    };
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user, resetToken, resetUrl) {
    const validation = await this.validateEmailConfig();
    if (!validation.valid) {
      console.log('📧 Email not sent - validation failed:', validation.error);
      return { success: false, reason: validation.error };
    }

    const settings = validation.settings;
    const transporter = await this.createTransporter(settings);

    // Use EmailTemplates for consistent, translatable content
    const emailTemplate = EmailTemplates.passwordReset({
      user,
      resetUrl,
      siteName: settings.SITE_NAME || 'Easy Kanban',
      db: this.db
    });

    const emailContent = {
      from: `"${settings.SMTP_FROM_NAME || 'Easy Kanban'}" <${settings.SMTP_FROM_EMAIL}>`,
      to: user.email,
      subject: emailTemplate.subject,
      text: emailTemplate.text,
      html: emailTemplate.html
    };

    console.log('📧 Sending password reset email to:', user.email);
    const info = await transporter.sendMail(emailContent);
    console.log('✅ Password reset email sent successfully:', info.messageId);

    return {
      success: true,
      messageId: info.messageId,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generic method to send any email
   */
  async sendEmail(emailOptions) {
    const validation = await this.validateEmailConfig();
    if (!validation.valid) {
      throw validation;
    }

    const settings = validation.settings;
    const transporter = await this.createTransporter(settings);

    // Set default from address if not provided
    if (!emailOptions.from) {
      emailOptions.from = `"${settings.SMTP_FROM_NAME || 'Easy Kanban'}" <${settings.SMTP_FROM_EMAIL}>`;
    }

    console.log('📧 Sending email to:', emailOptions.to);
    const info = await transporter.sendMail(emailOptions);
    console.log('✅ Email sent successfully:', info.messageId);

    return {
      success: true,
      messageId: info.messageId,
      timestamp: new Date().toISOString()
    };
  }
}

export default EmailService;
