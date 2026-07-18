# 🔐 Authentication Strategy for Playwright Tests

## Problem

**Question**: "Login might be required for every test. If we launch a new browser every time, we'll need to login, no?"

**Answer**: **Not anymore!** We use **global authentication state reuse**.

## ✅ Solution: Login Once, Reuse Everywhere

Playwright has a powerful feature that lets you:
1. **Login once** before all tests
2. **Save the authenticated session**
3. **Reuse it** across all test files

### Benefits

✅ **Much faster** - Login happens once, not hundreds of times  
✅ **Reliable** - No repeated login flakiness  
✅ **Realistic** - Tests start from authenticated state (like real usage)  
✅ **Easy** - Tests don't need to call `login()`  

## 🏗️ How It Works

### 1. Global Setup (`tests/auth.setup.ts`)

```typescript
// This runs ONCE before all tests
setup('authenticate', async ({ page }) => {
  // Login
  await page.goto('/');
  await page.locator('input#email').fill(email);
  await page.locator('input#password').fill(password);
  await page.locator('button[type="submit"]').click();
  
  // Save authenticated state
  await page.context().storageState({ path: '.auth/user.json' });
});
```

**This creates**: `.auth/user.json` containing:
- Cookies (JWT token)
- Local storage
- Session storage

### 2. Configuration (`playwright.config.ts`)

```typescript
projects: [
  // Setup runs first
  { name: 'setup', testMatch: /.*\.setup\.ts/ },
  
  // Tests use saved auth state
  {
    name: 'chromium',
    use: { storageState: '.auth/user.json' }, // ← Magic!
    dependencies: ['setup'], // ← Run setup first
  }
]
```

### 3. Tests Start Authenticated

```typescript
test('create task', async ({ page }) => {
  await page.goto('/');  // Already logged in! ✅
  
  // No need for:
  // await login(page, email, password);
});
```

## 🔄 Test Execution Flow

```
┌─────────────────────────────────┐
│  1. Run auth.setup.ts           │
│     • Login once                │
│     • Save state to .auth/      │
└──────────┬──────────────────────┘
           │
           ▼
┌─────────────────────────────────┐
│  2. Run all tests in parallel   │
│     • Load .auth/user.json      │
│     • Start with cookies/tokens │
│     • Already authenticated! ✅ │
└─────────────────────────────────┘
```

## 📁 What Was Created

### New Files

1. **`tests/auth.setup.ts`** ✅
   - Global authentication setup
   - Runs once before all tests
   - Saves session to `.auth/user.json`

2. **`.auth/user.json`** (generated) ✅
   - Contains authentication tokens
   - Gitignored (security)
   - Recreated on each test run

### Updated Files

1. **`playwright.config.ts`** ✅
   - Added setup project
   - Configured `storageState`
   - Added `dependencies`

2. **`tests/helpers.ts`** ✅
   - Updated with warnings about login()
   - Added new helper functions
   - Documented authentication pattern

3. **`.gitignore`** ✅
   - Added `.auth/` folder
   - Prevents committing session tokens

4. **`tests/taskcard/taskcard-create.spec.ts`** ✅
   - Removed `login()` calls
   - Tests start authenticated

## 🎯 When to Use Each Pattern

### Pattern 1: Global Auth (Most Tests) ✅

**Use for**: 99% of tests

```typescript
test('my test', async ({ page }) => {
  await page.goto('/');  // Already logged in!
  // Test your feature
});
```

**Tests that use this**:
- Task card tests
- Board tests
- Column tests
- Sprint tests
- Comment tests
- Tag tests
- Filter tests
- Admin tests (same user)

### Pattern 2: Explicit Login (Auth Tests Only)

**Use for**: Testing login/logout functionality

```typescript
import { login, logout } from '../helpers';

test('should login successfully', async ({ page }) => {
  await login(page, email, password);  // Testing login itself
  // Verify login worked
});

test('should logout', async ({ page }) => {
  await logout(page);  // Testing logout
  // Verify logout worked
});
```

**Tests that use this**:
- `tests/auth/login.spec.ts`
- `tests/auth/logout.spec.ts`
- `tests/auth/password-reset.spec.ts`

### Pattern 3: Different User (Special Cases)

**Use for**: Testing multi-user scenarios

```typescript
test('admin-specific feature', async ({ page }) => {
  // Login as different user (not the default one)
  await login(page, 'admin@example.com', 'admin-password');
  // Test admin feature
});
```

**Tests that might use this**:
- Admin-only features
- Permission tests
- Multi-user collaboration tests

## 🚀 Running Tests

### Normal Test Run (Uses Global Auth)

```bash
npm test
```

**What happens**:
1. ✅ Runs `auth.setup.ts` (login once)
2. ✅ Saves session to `.auth/user.json`
3. ✅ Runs all tests (already logged in)
4. ✅ Much faster! (~10x speed improvement)

### Before vs After

**Before** (without global auth):
```
test 1: login (2s) + test (1s) = 3s
test 2: login (2s) + test (1s) = 3s
test 3: login (2s) + test (1s) = 3s
test 4: login (2s) + test (1s) = 3s
test 5: login (2s) + test (1s) = 3s
─────────────────────────────────
Total: 15 seconds
```

**After** (with global auth):
```
setup: login once (2s)
test 1: test (1s)
test 2: test (1s)
test 3: test (1s)
test 4: test (1s)
test 5: test (1s)
─────────────────────────────────
Total: 7 seconds (53% faster!)
```

## 🔍 Conditional Login (Advanced)

### Option 1: Check if Already Logged In

```typescript
import { isLoggedIn, login } from '../helpers';

test('my test', async ({ page }) => {
  if (!await isLoggedIn(page)) {
    await login(page, email, password);
  }
  // Test code
});
```

### Option 2: Use beforeEach with Condition

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  
  // If not logged in, login
  if (!await isLoggedIn(page)) {
    await login(page, TEST_USER.email, TEST_USER.password);
  }
});
```

### Option 3: Use Global Auth (Recommended)

```typescript
// No conditional logic needed!
test('my test', async ({ page }) => {
  await page.goto('/');  // Always logged in via global setup
});
```

## 🛡️ Security

### ✅ What's Gitignored

- ❌ `.auth/` folder (contains session tokens)
- ❌ `.env` file (contains credentials)

### ✅ What's Committed

- ✅ `auth.setup.ts` (login logic, no secrets)
- ✅ `playwright.config.ts` (config, no secrets)
- ✅ All test files (no credentials)

### Session Token Lifecycle

1. **Test run starts** → `auth.setup.ts` logs in → Creates `.auth/user.json`
2. **Tests run** → Use `.auth/user.json` → Already authenticated
3. **Test run ends** → `.auth/user.json` persists on disk
4. **Next test run** → Recreates `.auth/user.json` → Fresh login

**Note**: The session token in `.auth/user.json` is valid for 24 hours (JWT_EXPIRES_IN = '24h')

## 🐛 Troubleshooting

### Problem: "Tests start on login page"

**Cause**: Auth state not loaded or expired

**Solution**:
```bash
# Delete old auth state
rm -rf .auth

# Run tests again (will recreate auth state)
npm test
```

### Problem: "Auth setup failed"

**Cause**: Credentials not set in `.env`

**Solution**:
```bash
# Check credentials are set
npm run env:check

# If not, edit .env
nano .env
```

### Problem: "Some tests need login, others don't"

**Solution**: You probably want global auth for all tests.

Keep `login()` function only for:
- Testing login functionality itself
- Special cases (different users)

### Problem: "Want to test with different users"

**Solution**: Create multiple setup files:

```typescript
// auth.setup.admin.ts
setup('authenticate as admin', async ({ page }) => {
  // Login as admin
  await page.context().storageState({ path: '.auth/admin.json' });
});

// auth.setup.user.ts
setup('authenticate as user', async ({ page }) => {
  // Login as regular user
  await page.context().storageState({ path: '.auth/user.json' });
});
```

Then in config:
```typescript
projects: [
  { name: 'setup-admin', testMatch: /auth.setup.admin/ },
  { name: 'setup-user', testMatch: /auth.setup.user/ },
  {
    name: 'admin-tests',
    use: { storageState: '.auth/admin.json' },
    dependencies: ['setup-admin'],
    testMatch: /tests\/admin\/.*/,
  },
  {
    name: 'user-tests',
    use: { storageState: '.auth/user.json' },
    dependencies: ['setup-user'],
    testMatch: /tests\/(taskcard|board|column)\/.*/,
  },
]
```

## 📚 Resources

- [Playwright Authentication Guide](https://playwright.dev/docs/auth)
- [Storage State API](https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state)
- [Test Projects](https://playwright.dev/docs/test-projects)

## 📝 Summary

✅ **Login once** via `auth.setup.ts`  
✅ **Save session** to `.auth/user.json`  
✅ **Reuse everywhere** in all tests  
✅ **Much faster** test execution  
✅ **No manual login** in tests  
✅ **Gitignored** auth state (secure)  

**Your tests now start authenticated automatically!** 🎉

---

**Run your tests**:
```bash
npm test
```

Watch how it logs in once, then all tests run authenticated! 🚀
