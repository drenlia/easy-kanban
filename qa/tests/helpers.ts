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

/**
 * Task Creation Helpers
 * These helpers match the actual Easy Kanban UI flow:
 * 1. Click + button in column header
 * 2. New card appears with "New Task" title
 * 3. Click title to edit
 * 4. Enter new title and save
 */

/**
 * Find a column by its title (case-insensitive)
 * @param page Playwright page
 * @param columnName Name of the column (e.g., "To Do", "In Progress")
 */
export async function findColumn(page: Page, columnName: string) {
  const column = page.locator('[data-column-header]', { 
    hasText: new RegExp(columnName, 'i') 
  }).first();
  await expect(column).toBeVisible({ timeout: 5000 });
  return column;
}

/**
 * Create a new task in a specific column
 * @param page Playwright page
 * @param columnName Name of the column (e.g., "To Do")
 * @param title Title for the new task
 */
export async function createTask(page: Page, columnName: string, title: string) {
  // Find the column
  const column = await findColumn(page, columnName);
  
  // Click the + button in the column header
  const addButton = column.locator('button[data-column-header]');
  await expect(addButton).toBeVisible();
  await addButton.click();
  
  // Wait for "New Task" card to appear
  await expect(page.locator('text=New Task').first()).toBeVisible({ timeout: 5000 });
  
  // Click on the title to edit it
  const newTaskTitle = page.locator('text=New Task').first();
  await newTaskTitle.click();
  
  // Wait for input field and enter title
  const titleInput = page.locator('input.border-blue-400').first();
  await expect(titleInput).toBeVisible({ timeout: 3000 });
  await titleInput.fill(title);
  await titleInput.press('Enter');
  
  // Wait for save to complete
  await page.waitForTimeout(1000);
  
  // Return the task card locator
  return page.locator(`text=${title}`);
}

/**
 * Edit task description
 * @param page Playwright page
 * @param taskTitle Title of the task to edit
 * @param description Description text to set
 */
export async function editTaskDescription(page: Page, taskTitle: string, description: string) {
  // Find the task card
  const taskCard = page.locator(`text=${taskTitle}`).locator('..').locator('..').first();
  
  // Click on the card to focus it
  await taskCard.click();
  await page.waitForTimeout(500);
  
  // Look for description editor (TipTap contenteditable or textarea)
  const descriptionEditor = page.locator('[contenteditable="true"]').or(
    page.locator('textarea[placeholder*="description" i]')
  ).first();
  
  if (await descriptionEditor.isVisible({ timeout: 2000 }).catch(() => false)) {
    await descriptionEditor.fill(description);
    // Click away to save
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(1000);
  }
}

/**
 * Get task ticket number
 * @param page Playwright page
 * @param taskTitle Title of the task
 * @returns Ticket number (e.g., "#123" or "PROJ-123")
 */
export async function getTaskTicketNumber(page: Page, taskTitle: string): Promise<string> {
  const taskCard = page.locator(`text=${taskTitle}`).locator('..').locator('..').first();
  const ticketElement = taskCard.locator('span, div').filter({ 
    hasText: /#\d+|[A-Z]+-\d+/ 
  }).first();
  return await ticketElement.textContent() || '';
}
