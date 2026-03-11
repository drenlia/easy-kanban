# Easy Kanban QA Tests

This directory contains end-to-end tests for the Easy Kanban application using Playwright.

## Setup

1. Install Playwright and dependencies:

```bash
cd qa
npm install --save-dev @playwright/test dotenv
npx playwright install
```

2. Install browsers (if not already installed):

```bash
npx playwright install chromium
```

3. **Configure credentials** (IMPORTANT):

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env and add your credentials
# TEST_USER_EMAIL=your-email@example.com
# TEST_USER_PASSWORD=your-password
```

**⚠️ IMPORTANT**: The `.env` file is in `.gitignore` and will NOT be committed to git. Your credentials stay local and secure.

## Running Tests

### Run all tests (headed mode - visible browser):

```bash
npx playwright test
```

### Run a specific test file:

```bash
npx playwright test tests/login.spec.ts
```

### Run tests in headless mode (no visible browser):

Edit `playwright.config.ts` and set `headless: true` in the project configuration, then:

```bash
npx playwright test
```

### Run tests with UI mode (interactive):

```bash
npx playwright test --ui
```

### Debug a test:

```bash
npx playwright test --debug
```

## Test Structure

- `playwright.config.ts` - Playwright configuration
- `tests/` - Test files
  - `login.spec.ts` - Login functionality tests

## Test Credentials

**Credentials are loaded from environment variables** for security.

1. Copy `.env.example` to `.env`
2. Edit `.env` and set:
   - `TEST_USER_EMAIL` - Your test user email
   - `TEST_USER_PASSWORD` - Your test user password

The `.env` file is gitignored and will NOT be committed to the repository.

**Example `.env` file:**
```bash
TEST_USER_EMAIL=admin@kanban.local
TEST_USER_PASSWORD=your-secure-password
```

## Configuration

### Base URL

**You can test any accessible URL** - local or remote!

**Default**: `http://localhost:3222` (local development)

**To test a remote server** (recommended for your case):

Edit `.env`:
```bash
PLAYWRIGHT_BASE_URL=https://kanban.drenlia.dev
```

**Common scenarios**:

```bash
# Test remote server (no local setup needed!)
PLAYWRIGHT_BASE_URL=https://kanban.drenlia.dev

# Test local development
PLAYWRIGHT_BASE_URL=http://localhost:3222

# Test staging
PLAYWRIGHT_BASE_URL=https://staging.yourdomain.com
```

See [TESTING_ENVIRONMENTS.md](TESTING_ENVIRONMENTS.md) for detailed multi-environment setup.

## Reports

After running tests, view the HTML report:

```bash
npx playwright show-report
```

Test results, screenshots, and videos are saved in:
- `playwright-report/` - HTML report
- `test-results/` - Screenshots and videos from failed tests

## CI/CD

The configuration includes settings optimized for CI/CD:
- Automatic retries on failure (2 retries)
- Sequential test execution
- Video recording on failure
- Screenshots on failure

## Writing New Tests

Follow the pattern in `tests/login.spec.ts`:

1. Import test and expect from `@playwright/test`
2. Use descriptive test names
3. Add comments explaining what you're testing
4. Use proper selectors (prefer IDs, data-testid, or semantic selectors)
5. Add appropriate timeouts and waiting conditions
6. Include assertions to verify expected behavior

## Troubleshooting

### Tests failing to find elements

- Check if the element selectors match the actual DOM structure
- Use Playwright Inspector to debug: `npx playwright test --debug`
- Increase timeout if elements load slowly: `{ timeout: 10000 }`

### Tests hanging

- Ensure proper wait conditions are used
- Check network requests aren't blocked
- Verify the base URL is correct and accessible

### Browser not launching

- Run: `npx playwright install chromium`
- Check browser dependencies: `npx playwright install-deps`

## Additional Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Selectors Guide](https://playwright.dev/docs/selectors)
