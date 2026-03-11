# Easy Kanban Playwright Test Suite

## 📁 Project Structure

```
qa/
├── playwright.config.ts      # Playwright configuration
├── package.json              # Dependencies and scripts
├── setup.sh                  # Setup script
├── README.md                 # Documentation
├── .gitignore               # Git ignore rules
└── tests/
    ├── login.spec.ts        # Login tests
    └── helpers.ts           # Test utilities
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd qa
./setup.sh
```

Or manually:

```bash
cd qa
npm install
npx playwright install chromium
```

### 2. Run Tests

```bash
# Run all tests (headed mode - visible browser)
npm test

# Run with UI mode (interactive)
npm run test:ui

# Run specific test
npm run test:login

# Debug mode
npm run test:debug
```

## 📋 Test Cases

### Login Tests (`tests/login.spec.ts`)

1. **Successful Login**
   - Navigates to application
   - Fills in valid credentials
   - Submits form
   - Verifies successful login (URL change + UI elements)

2. **Invalid Credentials**
   - Attempts login with invalid credentials
   - Verifies error message is displayed
   - Confirms user remains on login page

3. **Loading State**
   - Verifies loading indicator appears during login
   - Checks for spinner/loading text

## 🔧 Configuration

### Base URL
Tests run against: `https://kanban.drenlia.dev`

To change the target URL, edit `playwright.config.ts`:

```typescript
use: {
  baseURL: 'https://your-kanban-instance.com',
}
```

### Test Credentials

Default credentials (in `tests/helpers.ts`):
- Email: `info@drenlia.com`
- Password: `info@drenlia.com`

### Browser Settings

Tests run in **headed mode** (visible browser) by default.

To switch to headless:
Edit `playwright.config.ts`:

```typescript
projects: [
  {
    name: 'chromium',
    use: { 
      ...devices['Desktop Chrome'],
      headless: true,  // Change to true
    },
  },
]
```

## 📝 Writing New Tests

### Example Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { login, TEST_USER } from './helpers';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    // Arrange - Set up test
    await login(page, TEST_USER.email, TEST_USER.password);
    
    // Act - Perform action
    await page.locator('#some-button').click();
    
    // Assert - Verify result
    await expect(page.locator('.result')).toBeVisible();
  });
});
```

### Using Helpers

```typescript
import { login, logout, waitForNetworkIdle, TEST_USER } from './helpers';

test('test with login', async ({ page }) => {
  await login(page, TEST_USER.email, TEST_USER.password);
  
  // Your test code here
  
  await logout(page);
});
```

## 🐛 Debugging

### Visual Debugging

```bash
npm run test:debug
```

This opens Playwright Inspector where you can:
- Step through tests
- Inspect locators
- View network requests
- Take screenshots

### UI Mode (Recommended)

```bash
npm run test:ui
```

Interactive mode with:
- Watch mode
- Time travel debugging
- Trace viewer
- Screenshots and videos

### Screenshots

Screenshots are automatically taken on test failure and saved to `test-results/`

## 📊 Reports

After running tests:

```bash
npm run report
```

Opens an HTML report showing:
- Test results
- Screenshots
- Videos (of failures)
- Trace files

## 🔍 Selectors Used

Based on the Easy Kanban codebase:

| Element | Selector | Source |
|---------|----------|--------|
| Email input | `input#email` | `Login.tsx` line 329 |
| Password input | `input#password` | `Login.tsx` line 345 |
| Submit button | `button[type="submit"]` | `Login.tsx` line 379 |
| Error message | `.text-red-600` | `Login.tsx` line 359 |
| Loading spinner | `svg.animate-spin` | `Login.tsx` line 389 |

## 🚨 Troubleshooting

### "Browser not found"
```bash
npx playwright install chromium
```

### "Cannot find module @playwright/test"
```bash
cd qa
npm install
```

### Tests timing out
- Check if `https://kanban.drenlia.dev` is accessible
- Increase timeout in `playwright.config.ts`:
  ```typescript
  timeout: 60 * 1000,  // 60 seconds
  ```

### Elements not found
- Use Playwright Inspector: `npm run test:debug`
- Verify selectors match actual DOM structure
- Check if elements are loaded (add wait conditions)

## 📚 Resources

- [Playwright Documentation](https://playwright.dev)
- [Test Generator](https://playwright.dev/docs/codegen) - `npx playwright codegen https://kanban.drenlia.dev`
- [Selectors Guide](https://playwright.dev/docs/selectors)
- [Best Practices](https://playwright.dev/docs/best-practices)

## 🔄 CI/CD Integration

To run in CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Install dependencies
  run: |
    cd qa
    npm ci
    npx playwright install --with-deps chromium

- name: Run tests
  run: |
    cd qa
    npm test

- name: Upload report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: qa/playwright-report/
```

## 📌 Next Steps

### Suggested Additional Tests

1. **Board Management**
   - Create board
   - Edit board
   - Delete board

2. **Task Operations**
   - Create task
   - Edit task
   - Move task between columns
   - Delete task

3. **User Management**
   - Invite user
   - Edit user profile
   - Change password

4. **Settings**
   - Update application settings
   - Configure email
   - Manage members

### Test Data Management

Consider creating:
- `tests/fixtures/` - Test data
- `tests/setup/` - Before/after hooks
- `tests/api/` - API helper functions for setup/teardown
