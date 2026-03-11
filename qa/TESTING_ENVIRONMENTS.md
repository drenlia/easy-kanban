# Testing Different Environments

This guide explains how to run Playwright tests against different environments (local, remote, staging, production).

## 🌍 Testing Remote Servers (Recommended)

**Yes, you can test remote servers from your local machine!** This is actually the most common setup.

### Why Test Remote Servers?

✅ **No local setup required** - Just run tests, no need to start servers  
✅ **Test real environment** - Same as production/staging  
✅ **HTTPS works** - Remote servers typically have SSL certificates  
✅ **Faster iteration** - No need to rebuild/restart local server  
✅ **Team consistency** - Everyone tests the same environment  

## 🚀 Quick Setup: Test Remote Server

### 1. Create your `.env` file:

```bash
cd qa
cp .env.example .env
```

### 2. Edit `.env` to point to remote server:

```bash
# For testing kanban.drenlia.dev
TEST_USER_EMAIL=info@drenlia.com
TEST_USER_PASSWORD=your-password
PLAYWRIGHT_BASE_URL=https://kanban.drenlia.dev
```

### 3. Run tests:

```bash
npm test
```

That's it! Playwright will:
- ✅ Run on your local machine
- ✅ Control a local browser (visible if headed mode)
- ✅ Test the remote server at https://kanban.drenlia.dev
- ✅ Handle HTTPS automatically

## 📋 Multiple Environment Setup

### Option 1: Different `.env` Files (Recommended)

Create separate env files for each environment:

```bash
qa/
├── .env                    # Default (gitignored)
├── .env.local             # Local development (gitignored)
├── .env.staging           # Staging server (gitignored)
├── .env.production        # Production server (gitignored)
└── .env.example           # Template (committed)
```

**Example files:**

`.env.local`:
```bash
TEST_USER_EMAIL=admin@kanban.local
TEST_USER_PASSWORD=local-password
PLAYWRIGHT_BASE_URL=http://localhost:3222
```

`.env.staging`:
```bash
TEST_USER_EMAIL=test@drenlia.com
TEST_USER_PASSWORD=staging-password
PLAYWRIGHT_BASE_URL=https://staging.kanban.drenlia.dev
```

`.env.production`:
```bash
TEST_USER_EMAIL=qa@drenlia.com
TEST_USER_PASSWORD=prod-password
PLAYWRIGHT_BASE_URL=https://kanban.drenlia.dev
```

**Run tests with specific env file:**

```bash
# Test local
cp .env.local .env
npm test

# OR use dotenv-cli (install: npm install -g dotenv-cli)
dotenv -e .env.local -- npx playwright test

# Test staging
dotenv -e .env.staging -- npx playwright test

# Test production
dotenv -e .env.production -- npx playwright test
```

### Option 2: NPM Scripts

Add scripts to `package.json` for different environments:

```json
{
  "scripts": {
    "test": "playwright test",
    "test:local": "dotenv -e .env.local -- playwright test",
    "test:staging": "dotenv -e .env.staging -- playwright test",
    "test:prod": "dotenv -e .env.production -- playwright test"
  }
}
```

Then run:
```bash
npm run test:staging
npm run test:prod
```

### Option 3: Command Line Override

Override base URL directly:

```bash
# Test remote server without changing .env
PLAYWRIGHT_BASE_URL=https://kanban.drenlia.dev npm test

# Test local with custom port
PLAYWRIGHT_BASE_URL=http://localhost:5000 npm test
```

## 🔧 Configuration Details

### How It Works

1. Playwright config loads environment variables:
   ```typescript
   // playwright.config.ts
   use: {
     baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3222',
   }
   ```

2. Tests use relative URLs:
   ```typescript
   // Tests automatically use baseURL
   await page.goto('/');  // Goes to https://kanban.drenlia.dev/
   ```

3. Playwright handles:
   - ✅ HTTPS/SSL certificates
   - ✅ Redirects
   - ✅ CORS
   - ✅ WebSocket connections
   - ✅ Cookies and sessions

## 🌐 Common Scenarios

### Scenario 1: Local Development

**When**: Developing new features, debugging tests

**Setup**:
```bash
# .env
PLAYWRIGHT_BASE_URL=http://localhost:3222
TEST_USER_EMAIL=admin@kanban.local
TEST_USER_PASSWORD=admin
```

**Start app**:
```bash
# Terminal 1: Start the app
npm run dev

# Terminal 2: Run tests
cd qa
npm test
```

### Scenario 2: Remote Development Server (Your Use Case)

**When**: App is deployed on a server, you want to test without local setup

**Setup**:
```bash
# .env
PLAYWRIGHT_BASE_URL=https://kanban.drenlia.dev
TEST_USER_EMAIL=info@drenlia.com
TEST_USER_PASSWORD=your-password
```

**Run tests**:
```bash
cd qa
npm test
```

**Advantages**:
- ✅ No need to run app locally
- ✅ Test real HTTPS environment
- ✅ Test actual deployed code
- ✅ Faster (no local build needed)

### Scenario 3: CI/CD Pipeline

**When**: Automated tests on every commit

**Setup**: Environment variables in CI platform

```yaml
# GitHub Actions example
- name: Run Playwright tests
  env:
    PLAYWRIGHT_BASE_URL: https://staging.kanban.drenlia.dev
    TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
  run: |
    cd qa
    npm test
```

### Scenario 4: Staging Server

**When**: Testing before production deployment

**Setup**:
```bash
# .env
PLAYWRIGHT_BASE_URL=https://staging.kanban.drenlia.dev
TEST_USER_EMAIL=staging-user@example.com
TEST_USER_PASSWORD=staging-password
```

## 🔒 HTTPS Considerations

### Self-Signed Certificates

If testing against a server with self-signed SSL certificates, update config:

```typescript
// playwright.config.ts
use: {
  baseURL: process.env.PLAYWRIGHT_BASE_URL,
  ignoreHTTPSErrors: true, // Add this for self-signed certs
}
```

### Certificate Errors

If you get SSL/TLS errors:

```typescript
// playwright.config.ts
use: {
  baseURL: process.env.PLAYWRIGHT_BASE_URL,
  ignoreHTTPSErrors: true,
}
```

Or use a valid certificate (Let's Encrypt, etc.)

## 🎯 Best Practices

### DO ✅

- ✅ Test remote servers from local machine (totally normal!)
- ✅ Use different credentials for each environment
- ✅ Test staging before production
- ✅ Use `.env` files for different environments
- ✅ Version control `.env.example` (without real credentials)

### DON'T ❌

- ❌ Test production with destructive operations
- ❌ Use production credentials locally
- ❌ Commit `.env` files with real credentials
- ❌ Run tests that modify data on production

## 📊 Environment Comparison

| Aspect | Local (localhost) | Remote (kanban.drenlia.dev) |
|--------|------------------|----------------------------|
| **Setup** | Need to start app | Just run tests |
| **Speed** | Faster (network) | Slightly slower |
| **HTTPS** | Requires setup | Works out of box |
| **Realism** | Dev environment | Real environment |
| **Data** | Test data | Real/staging data |
| **Best For** | Development | Testing, CI/CD |

## 🚨 Troubleshooting

### "Failed to connect to server"

**Cause**: Server is not accessible

**Check**:
```bash
# Can you reach the server?
curl https://kanban.drenlia.dev

# Is the URL correct in .env?
cat qa/.env | grep PLAYWRIGHT_BASE_URL
```

### "SSL certificate problem"

**Cause**: Self-signed or expired certificate

**Solution**: Add to config:
```typescript
ignoreHTTPSErrors: true
```

### "Tests pass locally but fail on remote"

**Possible causes**:
- Different data/state on remote
- Network latency (increase timeouts)
- Different configuration
- CORS issues

**Solution**: Add more wait time for remote tests:
```typescript
// For remote servers, increase timeout
timeout: process.env.PLAYWRIGHT_BASE_URL?.includes('localhost') 
  ? 30 * 1000 
  : 60 * 1000,
```

## 📝 Summary

**You asked**: "Can I test remote server from local machine?"

**Answer**: **YES!** This is completely normal and recommended.

**Your setup**:
```bash
# qa/.env
PLAYWRIGHT_BASE_URL=https://kanban.drenlia.dev
TEST_USER_EMAIL=info@drenlia.com
TEST_USER_PASSWORD=your-password
```

Then just run:
```bash
cd qa
npm test
```

Playwright will:
- 🖥️ Run on your local machine
- 🌐 Test https://kanban.drenlia.dev
- ✅ Handle HTTPS automatically
- 📊 Show results locally

**No localhost required!** 🎉
