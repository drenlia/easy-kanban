# Quick Start: Testing Remote Server

## TL;DR - Testing https://kanban.drenlia.dev

```bash
# 1. Setup (one time)
cd qa
./setup.sh

# 2. Configure (edit .env file)
cat > .env << EOF
TEST_USER_EMAIL=info@drenlia.com
TEST_USER_PASSWORD=your-password
PLAYWRIGHT_BASE_URL=https://kanban.drenlia.dev
EOF

# 3. Verify configuration
npm run env:check

# 4. Run tests
npm test
```

## How It Works

```
┌─────────────────────┐
│  Your Local Machine │
│                     │
│  ┌───────────────┐ │
│  │  Playwright   │ │
│  │  Test Runner  │ │
│  └───────┬───────┘ │
│          │         │
│          │ Controls│
│          ▼         │
│  ┌───────────────┐ │
│  │   Browser     │ │
│  │  (Chromium)   │ │
│  └───────┬───────┘ │
└──────────┼─────────┘
           │
           │ HTTPS
           │
           ▼
┌──────────────────────┐
│  Remote Server       │
│                      │
│  kanban.drenlia.dev  │
│  (Port 443 - HTTPS)  │
└──────────────────────┘
```

**What happens:**
1. ✅ Playwright runs on your local machine
2. ✅ Opens a browser on your local machine (visible in headed mode)
3. ✅ Browser connects to https://kanban.drenlia.dev
4. ✅ You see the test running in real-time
5. ✅ Results saved locally

## Advantages

✅ **No local server needed** - Just run tests  
✅ **HTTPS works** - Remote server has SSL certificate  
✅ **Real environment** - Test actual deployed code  
✅ **Fast setup** - No app compilation/startup  
✅ **Team consistency** - Everyone tests same server  

## Example Output

```bash
$ npm test

Running 3 tests using 1 worker

✓ tests/login.spec.ts:15:3 › Easy Kanban Login › should successfully login (2.3s)
✓ tests/login.spec.ts:52:3 › Easy Kanban Login › should show error message (1.8s)
✓ tests/login.spec.ts:73:3 › Easy Kanban Login › should display loading state (1.5s)

3 passed (5.6s)
```

## Verify Your Setup

```bash
# Check environment variables
npm run env:check

# Should output:
# ✅ Base URL: https://kanban.drenlia.dev
# ✅ Email: Set
```

## Common Questions

### Q: Do I need to run the app locally?
**A: No!** Playwright can test any accessible URL.

### Q: Will this work with HTTPS?
**A: Yes!** Playwright handles HTTPS automatically.

### Q: Can I see the browser?
**A: Yes!** The browser runs on your machine (set `headless: false`).

### Q: Is this slower than testing localhost?
**A: Slightly**, due to network latency, but usually negligible.

### Q: Can multiple people test the same server?
**A: Yes!** Each tester controls their own browser locally.

## Next Steps

1. ✅ You've configured remote testing
2. Run your first test: `npm test`
3. View report: `npm run report`
4. Add more tests (see TESTING_GUIDE.md)

## Need Local Testing Instead?

If you later want to test localhost:

```bash
# Edit .env
PLAYWRIGHT_BASE_URL=http://localhost:3222

# Start the app (Terminal 1)
cd ..
npm run dev

# Run tests (Terminal 2)
cd qa
npm test
```

See [TESTING_ENVIRONMENTS.md](TESTING_ENVIRONMENTS.md) for full details.
