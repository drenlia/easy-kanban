/**
 * Easy Kanban Admin Portal Client
 * 
 * This client library provides easy access to deployed Easy Kanban instances
 * using the INSTANCE_TOKEN for authentication.
 * 
 * Usage:
 *   const client = new EasyKanbanAdminClient('https://my-company.ezkan.cloud', 'kanban-token-12345');
 *   await client.createUser({ email: 'user@example.com', password: 'password', firstName: 'John', lastName: 'Doe', role: 'user' });
 *   await client.updateSettings({ SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587' });
 */

class EasyKanbanAdminClient {
  constructor(baseUrl, instanceToken) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.instanceToken = instanceToken;
    this.apiBase = `${this.baseUrl}/api/admin-portal`;
  }

  /**
   * Make authenticated API request
   */
  async request(endpoint, options = {}) {
    const url = `${this.apiBase}${endpoint}`;
    const config = {
      headers: {
        'Authorization': `Bearer ${this.instanceToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return data;
    } catch (error) {
      console.error(`Admin Portal API Error (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Get instance information
   */
  async getInstanceInfo() {
    return this.request('/info');
  }

  /**
   * Health check
   */
  async healthCheck() {
    return this.request('/health');
  }

  /**
   * Get all settings
   */
  async getSettings() {
    const response = await this.request('/settings');
    return response.data;
  }

  /**
   * Update a single setting
   */
  async updateSetting(key, value) {
    const response = await this.request(`/settings/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: JSON.stringify({ value })
    });
    return response.data;
  }

  /**
   * Update multiple settings
   */
  async updateSettings(settings) {
    const response = await this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    return response.data;
  }

  /**
   * Configure SMTP settings
   */
  async configureSMTP(smtpConfig) {
    const settings = {
      SMTP_HOST: smtpConfig.host,
      SMTP_PORT: smtpConfig.port,
      SMTP_USERNAME: smtpConfig.username,
      SMTP_PASSWORD: smtpConfig.password,
      SMTP_FROM_EMAIL: smtpConfig.fromEmail,
      SMTP_SECURE: smtpConfig.secure || 'tls',
      MAIL_ENABLED: smtpConfig.enabled !== false ? 'true' : 'false'
    };

    return this.updateSettings(settings);
  }

  /**
   * Update site settings
   */
  async updateSiteSettings(siteConfig) {
    const settings = {};
    
    if (siteConfig.siteUrl) settings.SITE_URL = siteConfig.siteUrl;
    if (siteConfig.siteName) settings.SITE_NAME = siteConfig.siteName;
    
    return this.updateSettings(settings);
  }

  /**
   * Get all users
   */
  async getUsers() {
    const response = await this.request('/users');
    return response.data;
  }

  /**
   * Create a new user
   */
  async createUser(userData) {
    const response = await this.request('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
    return response.data;
  }

  /**
   * Update user
   */
  async updateUser(userId, userData) {
    const response = await this.request(`/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
    return response.data;
  }

  /**
   * Delete user
   */
  async deleteUser(userId) {
    const response = await this.request(`/users/${userId}`, {
      method: 'DELETE'
    });
    return response.data;
  }

  /**
   * Bulk operations
   */
  
  /**
   * Setup a new instance with default configuration
   */
  async setupInstance(config) {
    const results = [];

    // Update site settings
    if (config.site) {
      const siteResult = await this.updateSiteSettings(config.site);
      results.push({ type: 'site', result: siteResult });
    }

    // Configure SMTP
    if (config.smtp) {
      const smtpResult = await this.configureSMTP(config.smtp);
      results.push({ type: 'smtp', result: smtpResult });
    }

    // Create admin user
    if (config.adminUser) {
      const adminResult = await this.createUser({
        ...config.adminUser,
        role: 'admin'
      });
      results.push({ type: 'admin', result: adminResult });
    }

    // Create additional users
    if (config.users && Array.isArray(config.users)) {
      for (const user of config.users) {
        const userResult = await this.createUser(user);
        results.push({ type: 'user', result: userResult });
      }
    }

    return results;
  }

  /**
   * Get instance summary
   */
  async getInstanceSummary() {
    const [info, health, settings, users] = await Promise.all([
      this.getInstanceInfo(),
      this.healthCheck(),
      this.getSettings(),
      this.getUsers()
    ]);

    return {
      instance: info.data,
      health: health,
      settingsCount: Object.keys(settings).length,
      userCount: users.length,
      activeUsers: users.filter(u => u.isActive).length,
      adminUsers: users.filter(u => u.roles.includes('admin')).length
    };
  }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EasyKanbanAdminClient;
} else if (typeof window !== 'undefined') {
  window.EasyKanbanAdminClient = EasyKanbanAdminClient;
}

export default EasyKanbanAdminClient;
