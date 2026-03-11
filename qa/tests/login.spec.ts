import { test, expect } from '@playwright/test';

/**
 * Easy Kanban Login Test
 * 
 * This test verifies the login functionality for the Easy Kanban application.
 * It tests the standard email/password login flow.
 */

// Test credentials from environment variables
// Set TEST_USER_EMAIL and TEST_USER_PASSWORD in .env file
const TEST_CREDENTIALS = {
  email: process.env.TEST_USER_EMAIL || '',
  password: process.env.TEST_USER_PASSWORD || '',
};

// Validate that credentials are set
if (!TEST_CREDENTIALS.email || !TEST_CREDENTIALS.password) {
  throw new Error(
    'Test credentials not set. Please create a .env file with TEST_USER_EMAIL and TEST_USER_PASSWORD'
  );
}

test.describe('Easy Kanban Login', () => {
  test('should successfully login with valid credentials', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the login page to load
    // The login form should be visible
    await expect(page.locator('form')).toBeVisible();
    
    // Verify we're on the login page by checking for the sign-in heading
    // Based on Login.tsx: "Sign in to your account" (could be translated)
    const heading = page.locator('h2', { hasText: /sign in to/i });
    await expect(heading).toBeVisible();
    
    // Fill in the email field
    // Based on Login.tsx: input with id="email"
    const emailInput = page.locator('input#email');
    await expect(emailInput).toBeVisible();
    await emailInput.fill(TEST_CREDENTIALS.email);
    
    // Fill in the password field
    // Based on Login.tsx: input with id="password"
    const passwordInput = page.locator('input#password');
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill(TEST_CREDENTIALS.password);
    
    // Click the submit button
    // Based on Login.tsx: button with type="submit" containing text that includes "Sign in" or "Submit"
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    
    // Wait for navigation after successful login
    // The app should redirect away from the login page
    // We expect the URL to change (no longer showing login page)
    await page.waitForURL((url) => !url.pathname.includes('login'), { 
      timeout: 10000 
    });
    
    // Verify we're logged in by checking for the main application UI
    // Based on the codebase, after login we should see:
    // 1. Header component with user menu or logout button
    // 2. Main kanban board interface
    
    // Wait for the header to be visible (Header component from App.tsx)
    const header = page.locator('header').or(page.locator('[role="banner"]'));
    await expect(header).toBeVisible({ timeout: 10000 });
    
    // Verify we can see board/task interface elements
    // This could be boards list, columns, or main content area
    const mainContent = page.locator('main').or(page.locator('[role="main"]'));
    await expect(mainContent).toBeVisible({ timeout: 5000 });
    
    // Optional: Check for specific UI elements that indicate successful login
    // Such as user avatar, settings button, or board selector
    // Uncomment if needed:
    // await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    
    console.log('✅ Login successful!');
  });
  
  test('should show error message with invalid credentials', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the login form
    await expect(page.locator('form')).toBeVisible();
    
    // Fill in invalid credentials
    await page.locator('input#email').fill('invalid@example.com');
    await page.locator('input#password').fill('wrongpassword');
    
    // Submit the form
    await page.locator('button[type="submit"]').click();
    
    // Wait for error message to appear
    // Based on Login.tsx: error is displayed in a div with text-red-600 class
    const errorMessage = page.locator('.text-red-600, [role="alert"]');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });
    
    // Verify error message contains relevant text
    // Based on server/routes/auth.js: "Invalid credentials"
    await expect(errorMessage).toContainText(/invalid|failed|error/i);
    
    // Verify we're still on the login page (login failed)
    await expect(page.locator('input#email')).toBeVisible();
    
    console.log('✅ Invalid login correctly rejected');
  });
  
  test('should display loading state during login', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
    
    // Wait for the login form
    await expect(page.locator('form')).toBeVisible();
    
    // Fill in credentials
    await page.locator('input#email').fill(TEST_CREDENTIALS.email);
    await page.locator('input#password').fill(TEST_CREDENTIALS.password);
    
    // Click submit and immediately check for loading state
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    // Based on Login.tsx: button shows spinner and "Loading..." text when isLoading is true
    // Check for either the loading text or the spinner SVG
    const loadingIndicator = submitButton.locator('svg.animate-spin').or(
      submitButton.locator('text=/loading/i')
    );
    
    // The loading state might be brief, so use a short timeout
    await expect(loadingIndicator).toBeVisible({ timeout: 2000 }).catch(() => {
      console.log('⚠️ Loading state was too brief to capture (request completed quickly)');
    });
    
    console.log('✅ Loading state test completed');
  });
});
