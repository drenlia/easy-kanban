import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Playwright Configuration for Easy Kanban E2E Tests
 * 
 * Configuration optimized for:
 * - Reusing browser instances across tests (faster)
 * - Running tests in same browser context (realistic)
 * - Global authentication (login once)
 */
export default defineConfig({
  testDir: './tests',
  
  // Maximum time one test can run for
  timeout: 30 * 1000,
  
  expect: {
    // Maximum time expect() should wait for the condition to be met
    timeout: 5000
  },
  
  // Run tests serially (same browser, faster for small suites)
  // Change to true for large test suites
  fullyParallel: false,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Number of workers (1 = serial, undefined = parallel)
  // Use 1 worker to reuse same browser across tests
  workers: 1,
  
  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  
  // Shared settings for all the projects below
  use: {
    // Base URL to use in actions like `await page.goto('/')`
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3222',
    
    // Collect trace when retrying the failed test
    trace: 'on-first-retry',
    
    // Screenshot on failure
    screenshot: 'only-on-failure',
    
    // Video on failure
    video: 'retain-on-failure',
    
    // Reuse existing browser context (much faster!)
    // This keeps you logged in across tests
    reuseExistingServer: true,
  },

  // Configure projects
  projects: [
    // Setup project - runs first to authenticate
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      // Setup always runs in its own context
    },
    
    // Main test project - uses authenticated state
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Run in headed mode (visible browser)
        headless: false,
        // Use authenticated state from setup
        storageState: '.auth/user.json',
        // Keep browser open between tests (faster!)
        // Context is reused when workers: 1
      },
      dependencies: ['setup'], // Run setup first
    },
  ],
});
