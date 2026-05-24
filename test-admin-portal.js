#!/usr/bin/env node

/**
 * Test script for Easy Kanban Admin Portal Integration
 * 
 * This script demonstrates how to use the admin portal API to:
 * 1. Connect to a deployed instance
 * 2. Configure SMTP settings
 * 3. Update site settings
 * 4. Create users
 * 5. Manage the instance
 * 
 * Usage:
 *   node test-admin-portal.js <instance_url> <instance_token>
 * 
 * Example:
 *   node test-admin-portal.js https://my-company.ezkan.cloud kanban-token-12345
 * 
 * SMTP credentials are loaded from .env (see .env.example). Required variables:
 *   ADMIN_PORTAL_TEST_SMTP_USERNAME, ADMIN_PORTAL_TEST_SMTP_PASSWORD,
 *   ADMIN_PORTAL_TEST_SMTP_FROM_EMAIL
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EasyKanbanAdminClient from './admin-portal-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = join(__dirname, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and set SMTP credentials before running this script.`
    );
  }
  return value;
}

loadEnvFile();

async function testAdminPortal(instanceUrl, instanceToken) {
  console.log('🚀 Testing Easy Kanban Admin Portal Integration');
  console.log(`📍 Instance: ${instanceUrl}`);
  console.log(`🔑 Token: ${instanceToken.substring(0, 10)}...`);
  console.log('');

  const client = new EasyKanbanAdminClient(instanceUrl, instanceToken);

  try {
    // 1. Test connection and get instance info
    console.log('1️⃣ Testing connection...');
    const info = await client.getInstanceInfo();
    console.log('✅ Connected successfully!');
    console.log(`   Instance: ${info.data.instanceName}`);
    console.log(`   Environment: ${info.data.environment}`);
    console.log(`   Version: ${info.data.version}`);
    console.log('');

    // 2. Health check
    console.log('2️⃣ Checking instance health...');
    const health = await client.healthCheck();
    console.log(`✅ Health Status: ${health.status}`);
    console.log(`   Database: ${health.database}`);
    console.log('');

    // 3. Get current settings
    console.log('3️⃣ Fetching current settings...');
    const settings = await client.getSettings();
    console.log(`✅ Found ${Object.keys(settings).length} settings`);
    console.log(`   Site URL: ${settings.SITE_URL || 'Not set'}`);
    console.log(`   Site Name: ${settings.SITE_NAME || 'Not set'}`);
    console.log(`   SMTP Host: ${settings.SMTP_HOST || 'Not set'}`);
    console.log(`   Mail Enabled: ${settings.MAIL_ENABLED || 'Not set'}`);
    console.log('');

    // 4. Configure SMTP (example)
    console.log('4️⃣ Configuring SMTP settings...');
    await client.configureSMTP({
      host: 'smtp.gmail.com',
      port: '587',
      username: requireEnv('ADMIN_PORTAL_TEST_SMTP_USERNAME'),
      password: requireEnv('ADMIN_PORTAL_TEST_SMTP_PASSWORD'),
      fromEmail: requireEnv('ADMIN_PORTAL_TEST_SMTP_FROM_EMAIL'),
      secure: 'tls',
      enabled: true
    });
    console.log('✅ SMTP settings configured');
    console.log('');

    // 5. Update site settings
    console.log('5️⃣ Updating site settings...');
    await client.updateSiteSettings({
      siteUrl: instanceUrl,
      siteName: 'My Company Kanban Board'
    });
    console.log('✅ Site settings updated');
    console.log('');

    // 6. Get current users
    console.log('6️⃣ Fetching current users...');
    const users = await client.getUsers();
    console.log(`✅ Found ${users.length} users`);
    users.forEach(user => {
      console.log(`   - ${user.firstName} ${user.lastName} (${user.email}) - ${user.roles.join(', ')}`);
    });
    console.log('');

    // 7. Create a test user (optional - comment out if you don't want to create users)
    console.log('7️⃣ Creating test user...');
    const testUser = await client.createUser({
      email: 'test@example.com',
      password: 'testpassword123',
      firstName: 'Test',
      lastName: 'User',
      role: 'user'
    });
    console.log(`✅ Test user created: ${testUser.email}`);
    console.log('');

    // 8. Get instance summary
    console.log('8️⃣ Getting instance summary...');
    const summary = await client.getInstanceSummary();
    console.log('✅ Instance Summary:');
    console.log(`   Instance: ${summary.instance.instanceName}`);
    console.log(`   Environment: ${summary.instance.environment}`);
    console.log(`   Settings: ${summary.settingsCount} configured`);
    console.log(`   Users: ${summary.userCount} total, ${summary.activeUsers} active`);
    console.log(`   Admins: ${summary.adminUsers}`);
    console.log('');

    console.log('🎉 All tests completed successfully!');
    console.log('');
    console.log('📋 Summary of actions performed:');
    console.log('   ✅ Connected to instance');
    console.log('   ✅ Verified health status');
    console.log('   ✅ Configured SMTP settings');
    console.log('   ✅ Updated site settings');
    console.log('   ✅ Created test user');
    console.log('   ✅ Retrieved instance summary');
    console.log('');
    console.log('🔗 Your instance is now ready for use!');
    console.log(`   Access URL: ${instanceUrl}`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('');
    console.error('🔍 Troubleshooting:');
    console.error('   1. Verify the instance URL is correct and accessible');
    console.error('   2. Check that the instance token is valid');
    console.error('   3. Ensure the instance is running and healthy');
    console.error('   4. Check network connectivity');
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.log('Usage: node test-admin-portal.js <instance_url> <instance_token>');
    console.log('');
    console.log('Example:');
    console.log('  node test-admin-portal.js https://my-company.ezkan.cloud kanban-token-12345');
    console.log('');
    console.log('To get the instance URL and token, run:');
    console.log('  ./k8s/deploy-instance.sh my-company kanban-token-12345');
    process.exit(1);
  }

  const [instanceUrl, instanceToken] = args;
  
  // Validate URL format
  try {
    new URL(instanceUrl);
  } catch (error) {
    console.error('❌ Invalid URL format:', instanceUrl);
    process.exit(1);
  }

  await testAdminPortal(instanceUrl, instanceToken);
}

// Run the test
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});
