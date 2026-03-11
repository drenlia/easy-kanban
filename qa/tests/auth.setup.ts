import { test as setup, expect } from '@playwright/test';
import path from 'path';

/**
 * Global Setup - Authenticate Once
 * 
 * This file runs BEFORE all tests and creates an authenticated session
 * that can be reused across all test files.
 * 
 * Benefits:
 * - Login only once per test run
 * - Much faster test execution
 * - Shared authentication state
 */

const authFile = path.join(__dirname, '../.auth/user.json');

setup('authenticate', async ({ page }) => {
  // Validate environment variables
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set in .env file');
  }

  console.log('🔐 Authenticating user for all tests...');

  // Navigate to login page
  await page.goto('/');

  // Wait for login form
  await expect(page.locator('form')).toBeVisible({ timeout: 10000 });

  // Fill in credentials
  await page.locator('input#email').fill(email);
  await page.locator('input#password').fill(password);

  // Submit login
  await page.locator('button[type="submit"]').click();

  // Wait for successful login
  await page.waitForURL((url) => !url.pathname.includes('login'), { 
    timeout: 10000 
  });

  // Verify we're logged in by checking for main content
  await expect(page.locator('header').or(page.locator('main'))).toBeVisible({ 
    timeout: 5000 
  });

  // Save authenticated state
  await page.context().storageState({ path: authFile });

  console.log('✅ Authentication complete - state saved');
});
