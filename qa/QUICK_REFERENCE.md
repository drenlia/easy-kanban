# 🚀 Quick Reference - Test by Feature

## Run Tests After Working On:

### Task Cards
```bash
npm run test:taskcard          # All task tests
npm run test:taskcard:create   # Just creation
```
**Tests**: Create, Edit, Delete, Move, Details

---

### Boards
```bash
npm run test:board
```
**Tests**: Create, Edit, Delete, Navigate

---

### Columns
```bash
npm run test:column
```
**Tests**: Create, Edit, Delete, Reorder

---

### Sprints
```bash
npm run test:sprint
```
**Tests**: Create, Assign tasks, Reports

---

### Comments
```bash
npm run test:comments
```
**Tests**: Create, Edit, Delete comments

---

### Tags
```bash
npm run test:tags
```
**Tests**: Create tags, Assign to tasks

---

### Filters
```bash
npm run test:filters
```
**Tests**: Filter by member, date, priority, tag

---

### Admin Features
```bash
npm run test:admin
```
**Tests**: User management, Settings, Reports

---

### Authentication
```bash
npm run test:auth
```
**Tests**: Login, Logout, Password reset

---

## Quick Commands

```bash
# Smoke test (2 min) - Run before commit
npm run test:smoke

# Full suite (30 min) - Run before release
npm test

# Debug a failing test
npm run test:debug

# Interactive UI mode
npm run test:ui

# Run in visible browser
npm run test:headed

# Check environment
npm run env:check
```

---

## Test Structure

```
tests/
├── auth/           # ✅ Login tests (DONE)
├── taskcard/       # ✅ Task creation (DONE)
├── board/          # 📁 Ready for tests
├── column/         # 📁 Ready for tests
├── sprint/         # 📁 Ready for tests
├── comments/       # 📁 Ready for tests
├── tags/           # 📁 Ready for tests
├── filters/        # 📁 Ready for tests
└── admin/          # 📁 Ready for tests
```

---

## Adding New Tests

1. Create file in appropriate folder:
   ```
   tests/[feature]/[feature]-[action].spec.ts
   ```

2. Use this template:
   ```typescript
   import { test, expect } from '@playwright/test';
   import { login, TEST_USER } from '../helpers';
   
   test.describe('Feature Name', () => {
     test.beforeEach(async ({ page }) => {
       await login(page, TEST_USER.email, TEST_USER.password);
     });
     
     test('should do something', async ({ page }) => {
       // Your test here
     });
   });
   ```

3. Run it:
   ```bash
   npm run test:[feature]
   ```

---

## Common Patterns

### Find and click
```typescript
await page.locator('button', { hasText: /add task/i }).click();
```

### Fill form
```typescript
await page.locator('input[name="title"]').fill('My Task');
```

### Wait for element
```typescript
await expect(page.locator('.task-card')).toBeVisible();
```

### Verify text
```typescript
await expect(page.locator('h1')).toContainText('Dashboard');
```

---

## Troubleshooting

### Test failing?
```bash
npm run test:debug
```

### Need to see browser?
```bash
npm run test:headed
```

### Element not found?
```bash
npm run test:ui  # Interactive mode
```

### Check configuration?
```bash
npm run env:check
```

---

## Documentation

- `TEST_PLAN.md` - Full test specifications
- `IMPLEMENTATION_SUMMARY.md` - What's implemented
- `TESTING_GUIDE.md` - How to write tests
- `TESTING_ENVIRONMENTS.md` - Environment setup

---

## 🎯 Current Status

| Feature | Status | Tests |
|---------|--------|-------|
| Auth | ✅ Done | 3 tests |
| Task Cards | ✅ Done | 7 tests (create) |
| Boards | 📝 Planned | 0 tests |
| Columns | 📝 Planned | 0 tests |
| Sprints | 📝 Planned | 0 tests |
| Comments | 📝 Planned | 0 tests |
| Tags | 📝 Planned | 0 tests |
| Filters | 📝 Planned | 0 tests |
| Admin | 📝 Planned | 0 tests |

**Total**: 10 tests created, 83 planned

---

**Start testing**: `npm run test:taskcard --headed` 🚀
