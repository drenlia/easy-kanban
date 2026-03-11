# 🔒 Secure Setup for Playwright Tests

## Overview

The Playwright tests use **environment variables** to keep credentials secure and out of the git repository.

## 🚀 Quick Setup

### 1. Navigate to qa folder
```bash
cd qa
```

### 2. Run setup script
```bash
./setup.sh
```

This will:
- ✅ Install npm dependencies
- ✅ Install Playwright browsers
- ✅ Create `.env` file from `.env.example`

### 3. Configure credentials
```bash
# Edit the .env file
nano .env  # or use your preferred editor
```

Add your test credentials:
```bash
TEST_USER_EMAIL=your-email@example.com
TEST_USER_PASSWORD=your-secure-password

# Optional: Override base URL (default is http://localhost:3222)
# PLAYWRIGHT_BASE_URL=https://your-instance.com
```

### 4. Run tests
```bash
npm test
```

## 🔐 Security Features

### ✅ What's Protected

1. **`.env` file is gitignored**
   - Both in `qa/.gitignore` 
   - And root `.gitignore`
   - Your credentials will NEVER be committed

2. **Environment variables only**
   - No hardcoded credentials in code
   - Each developer uses their own `.env` file

3. **Example file for reference**
   - `.env.example` is committed (no secrets)
   - Shows what variables are needed
   - Developers copy and fill in their own values

### ❌ What's NOT Committed

- ❌ `.env` - Your actual credentials
- ❌ `.env.local` - Local overrides
- ❌ `.env.test` - Test-specific credentials
- ❌ `test-results/` - Test outputs with potentially sensitive data
- ❌ `playwright-report/` - HTML reports

### ✅ What IS Committed

- ✅ `.env.example` - Template (no real credentials)
- ✅ `playwright.config.ts` - Configuration
- ✅ `tests/*.spec.ts` - Test files
- ✅ `tests/helpers.ts` - Utilities
- ✅ Documentation

## 🌍 Environment Variables

### Available Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TEST_USER_EMAIL` | ✅ Yes | - | Test user email/username |
| `TEST_USER_PASSWORD` | ✅ Yes | - | Test user password |
| `PLAYWRIGHT_BASE_URL` | No | `http://localhost:3222` | Base URL for tests |

### Different Environments

You can create multiple env files:

```bash
# Development (local)
.env

# Staging server
.env.staging

# Load specific env file:
dotenv -e .env.staging -- npx playwright test
```

## 👥 Team Setup

### For New Team Members

1. Clone the repository
2. Navigate to `qa/` folder
3. Run `./setup.sh`
4. Copy `.env.example` to `.env`
5. Get credentials from team lead
6. Add credentials to `.env`
7. Run tests: `npm test`

### For CI/CD

Set environment variables in your CI/CD platform:

**GitHub Actions:**
```yaml
env:
  TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
  TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
  PLAYWRIGHT_BASE_URL: ${{ secrets.PLAYWRIGHT_BASE_URL }}
```

**GitLab CI:**
```yaml
variables:
  TEST_USER_EMAIL: $TEST_USER_EMAIL
  TEST_USER_PASSWORD: $TEST_USER_PASSWORD
```

## 🛡️ Best Practices

### DO ✅

- ✅ Use `.env` for local credentials
- ✅ Use different credentials for test vs production
- ✅ Rotate test credentials regularly
- ✅ Share credentials securely (password manager, not Slack/email)
- ✅ Keep `.env.example` updated with new variables

### DON'T ❌

- ❌ Commit `.env` file
- ❌ Share credentials in chat/email
- ❌ Use production credentials for testing
- ❌ Hardcode credentials in test files
- ❌ Screenshot or share `.env` contents

## 🔍 Verification

### Check if `.env` is gitignored

```bash
# Should return nothing (file is ignored)
git status | grep .env
```

### Check if credentials are loaded

```bash
# In qa/ folder
node -e "require('dotenv').config(); console.log('Email:', process.env.TEST_USER_EMAIL ? '✅ Set' : '❌ Not set')"
```

## ⚠️ Troubleshooting

### Error: "Test credentials not set"

**Cause**: `.env` file doesn't exist or variables are empty

**Solution**:
```bash
cd qa
cp .env.example .env
# Edit .env and add your credentials
nano .env
```

### Error: "Cannot find module 'dotenv'"

**Cause**: Dependencies not installed

**Solution**:
```bash
cd qa
npm install
```

### Credentials work locally but fail in CI

**Cause**: Environment variables not set in CI platform

**Solution**: Add secrets to your CI/CD platform's secret manager

## 📝 Summary

✅ Credentials stored in `.env` (not committed)  
✅ `.env.example` shows what's needed (is committed)  
✅ Environment variables loaded via `dotenv`  
✅ Each developer has their own `.env`  
✅ Safe to commit all test code  

Your credentials stay local and secure! 🔒
