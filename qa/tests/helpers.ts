/**
 * Easy Kanban Test Utilities
 * 
 * Shared utilities and helpers for Playwright tests
 * 
 * AUTHENTICATION NOTE:
 * Most tests should NOT call login() directly!
 * Authentication is handled globally via auth.setup.ts
 * 
 * The login() function is kept for:
 * - Testing login functionality itself (auth tests)
 * - Special cases where you need to login as different user
 * - Manual testing scenarios
 */

import { Page, expect } from '@playwright/test';

/**
 * Login helper function
 * 
 * ⚠️ WARNING: Don't use this in regular tests!
 * Authentication is handled globally via auth.setup.ts
 * 
 * Use this ONLY for:
 * - Testing login functionality (auth/login.spec.ts)
 * - Testing with different user credentials
 * - Logout/login flows
 */
export async function login(page: Page, email: string, password: string) {
  await page.goto('/');
  
  // Wait for login form
  await expect(page.locator('form')).toBeVisible();
  
  // Fill credentials
  await page.locator('input#email').fill(email);
  await page.locator('input#password').fill(password);
  
  // Submit
  await page.locator('button[type="submit"]').click();
  
  // Wait for successful login (URL change or main content)
  await page.waitForURL((url) => !url.pathname.includes('login'), { 
    timeout: 10000 
  });
}

/**
 * Logout helper function
 * Performs logout operation
 */
export async function logout(page: Page) {
  // Look for user menu or logout button
  // Adjust selector based on actual UI
  const userMenu = page.locator('[data-testid="user-menu"]').or(
    page.locator('button', { hasText: /logout|sign out/i })
  );
  
  await userMenu.click();
  
  // Click logout option if in dropdown
  const logoutButton = page.locator('button', { hasText: /logout|sign out/i });
  if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutButton.click();
  }
  
  // Wait for login page
  await expect(page.locator('input#email')).toBeVisible({ timeout: 5000 });
}

/**
 * Wait for network idle
 * Useful after actions that trigger multiple API calls
 */
export async function waitForNetworkIdle(page: Page, timeout: number = 2000) {
  await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Take a screenshot with a descriptive name
 */
export async function takeScreenshot(page: Page, name: string) {
  await page.screenshot({ 
    path: `test-results/${name}-${Date.now()}.png`,
    fullPage: true 
  });
}

/**
 * Check if user is logged in
 * 
 * Note: With global auth, tests should always be logged in
 * This is mainly useful for auth tests themselves
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const loginForm = page.locator('input#email');
  return !(await loginForm.isVisible({ timeout: 2000 }).catch(() => false));
}

/**
 * Navigate to application
 * User should already be authenticated via global setup
 */
export async function navigateToApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for Kanban board to be ready
 */
export async function waitForKanbanBoard(page: Page) {
  await expect(page.locator('[data-testid="kanban-board"]').or(
    page.locator('main')
  )).toBeVisible({ timeout: 10000 });
}

/**
 * Default test credentials from environment variables
 * Set these in .env file (not committed to git)
 * Used by auth.setup.ts for global authentication
 */
export const TEST_USER = {
  email: process.env.TEST_USER_EMAIL || '',
  password: process.env.TEST_USER_PASSWORD || '',
};
