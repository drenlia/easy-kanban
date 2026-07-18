# Playwright Test Suite Organization

## Overview

This document outlines the complete test structure for Easy Kanban, organized by features and delivery phases.

## 🗂️ Test File Structure

```
qa/tests/
├── auth/
│   ├── login.spec.ts                    # ✅ Created
│   ├── logout.spec.ts
│   ├── password-reset.spec.ts
│   └── google-oauth.spec.ts
├── taskcard/
│   ├── taskcard-create.spec.ts          # 🎯 Priority 1
│   ├── taskcard-edit.spec.ts
│   ├── taskcard-delete.spec.ts
│   ├── taskcard-move.spec.ts
│   └── taskcard-details.spec.ts
├── board/
│   ├── board-create.spec.ts
│   ├── board-edit.spec.ts
│   ├── board-delete.spec.ts
│   └── board-navigation.spec.ts
├── column/
│   ├── column-create.spec.ts
│   ├── column-edit.spec.ts
│   ├── column-delete.spec.ts
│   └── column-reorder.spec.ts
├── sprint/
│   ├── sprint-create.spec.ts
│   ├── sprint-assign-tasks.spec.ts
│   └── sprint-reports.spec.ts
├── comments/
│   ├── comment-create.spec.ts
│   ├── comment-edit.spec.ts
│   └── comment-delete.spec.ts
├── tags/
│   ├── tag-create.spec.ts
│   ├── tag-assign.spec.ts
│   └── tag-remove.spec.ts
├── filters/
│   ├── filter-by-member.spec.ts
│   ├── filter-by-date.spec.ts
│   ├── filter-by-priority.spec.ts
│   └── filter-by-tag.spec.ts
├── admin/
│   ├── user-management.spec.ts
│   ├── settings.spec.ts
│   └── reports.spec.ts
└── helpers.ts                           # Shared utilities
```

---

## 📋 Detailed Test Specifications

### 1. 🎯 **PRIORITY 1: Task Card Tests** (Start Here)

#### File: `tests/taskcard/taskcard-create.spec.ts`

**Purpose**: Test creating a new task with all properties

**Test Cases**:

1. **Create minimal task** (title only)
2. **Create complete task** (all fields filled)
   - Title: "Test Task Title"
   - Description: "Test task description"
   - Start date: Today
   - End date: 7 days from today
   - Effort: 5
   - Priority: First in list
   - Tag: First in list
   - Sprint: First in list
3. **Validation: Empty title should fail**
4. **Validation: End date before start date should show warning**
5. **Verify task appears in correct column**
6. **Verify task ticket number is generated**

#### File: `tests/taskcard/taskcard-edit.spec.ts`

**Purpose**: Test editing existing tasks

**Test Cases**:

1. **Edit task title**
2. **Edit task description**
3. **Change task dates**
4. **Change task priority**
5. **Change task effort**
6. **Add tag to task**
7. **Remove tag from task**
8. **Change sprint assignment**
9. **Verify changes persist after refresh**

#### File: `tests/taskcard/taskcard-delete.spec.ts`

**Purpose**: Test deleting tasks

**Test Cases**:

1. **Delete task via context menu**
2. **Delete task via keyboard shortcut**
3. **Confirm deletion dialog appears**
4. **Cancel deletion**
5. **Verify task is removed from board**
6. **Verify task count updates**

#### File: `tests/taskcard/taskcard-move.spec.ts`

**Purpose**: Test moving tasks

**Test Cases**:

1. **Move task down in same column**
2. **Move task up in same column**
3. **Move task to different column (drag & drop)**
4. **Move task to different board**
5. **Verify task position persists**
6. **Verify task maintains all properties after move**

#### File: `tests/taskcard/taskcard-details.spec.ts`

**Purpose**: Test task details modal/page

**Test Cases**:

1. **Open task details**
2. **View task properties**
3. **View task comments**
4. **View task attachments**
5. **View task relationships (parent/child)**
6. **View task activity history**
7. **Close task details**

---

### 2. 🏢 **Board Management Tests**

#### File: `tests/board/board-create.spec.ts`

**Test Cases**:
- Create board with name
- Create board with project identifier
- Verify board appears in board selector
- Verify default columns are created

#### File: `tests/board/board-edit.spec.ts`

**Test Cases**:
- Rename board
- Change project identifier
- Verify changes persist

#### File: `tests/board/board-delete.spec.ts`

**Test Cases**:
- Delete board
- Confirm deletion (with tasks)
- Confirm deletion (empty board)
- Verify board removed from selector

#### File: `tests/board/board-navigation.spec.ts`

**Test Cases**:
- Switch between boards
- Verify correct tasks load
- Verify URL updates
- Back/forward navigation

---

### 3. 📊 **Column Management Tests**

#### File: `tests/column/column-create.spec.ts`

**Test Cases**:
- Add new column
- Verify column appears
- Verify position is correct

#### File: `tests/column/column-edit.spec.ts`

**Test Cases**:
- Rename column
- Mark column as "finished"
- Mark column as "archived"

#### File: `tests/column/column-delete.spec.ts`

**Test Cases**:
- Delete empty column
- Attempt delete column with tasks (should prevent or move tasks)

#### File: `tests/column/column-reorder.spec.ts`

**Test Cases**:
- Drag column to new position
- Verify position persists

---

### 4. 🏃 **Sprint Management Tests**

#### File: `tests/sprint/sprint-create.spec.ts`

**Test Cases**:
- Create sprint with name
- Create sprint with dates
- Verify sprint appears in selector

#### File: `tests/sprint/sprint-assign-tasks.spec.ts`

**Test Cases**:
- Assign task to sprint
- Unassign task from sprint
- Move task between sprints
- Filter tasks by sprint

#### File: `tests/sprint/sprint-reports.spec.ts`

**Test Cases**:
- View sprint progress
- View sprint burndown
- View sprint velocity

---

### 5. 💬 **Comments Tests**

#### File: `tests/comments/comment-create.spec.ts`

**Test Cases**:
- Add comment to task
- Add comment with @mention
- Add comment with attachment
- Verify comment appears
- Verify comment count updates

#### File: `tests/comments/comment-edit.spec.ts`

**Test Cases**:
- Edit own comment
- Verify edit timestamp

#### File: `tests/comments/comment-delete.spec.ts`

**Test Cases**:
- Delete own comment
- Admin deletes any comment

---

### 6. 🏷️ **Tags Tests**

#### File: `tests/tags/tag-create.spec.ts`

**Test Cases**:
- Create tag (admin)
- Set tag color
- Set tag description

#### File: `tests/tags/tag-assign.spec.ts`

**Test Cases**:
- Add tag to task
- Add multiple tags to task
- Verify tags display on task card

#### File: `tests/tags/tag-remove.spec.ts`

**Test Cases**:
- Remove tag from task
- Verify tag removed from display

---

### 7. 🔍 **Filter Tests**

#### File: `tests/filters/filter-by-member.spec.ts`

**Test Cases**:
- Filter tasks by assignee
- Filter multiple members
- Clear filter

#### File: `tests/filters/filter-by-date.spec.ts`

**Test Cases**:
- Filter by start date range
- Filter by due date range
- Filter overdue tasks

#### File: `tests/filters/filter-by-priority.spec.ts`

**Test Cases**:
- Filter by single priority
- Filter multiple priorities
- Clear filter

#### File: `tests/filters/filter-by-tag.spec.ts`

**Test Cases**:
- Filter by single tag
- Filter multiple tags
- Clear filter

---

### 8. 👤 **Admin Tests**

#### File: `tests/admin/user-management.spec.ts`

**Test Cases**:
- Invite user
- Activate user
- Deactivate user
- Delete user
- Change user role

#### File: `tests/admin/settings.spec.ts`

**Test Cases**:
- Update site name
- Update email settings
- Update OAuth settings
- Update storage settings

#### File: `tests/admin/reports.spec.ts`

**Test Cases**:
- Generate task list report
- Filter report by date
- Export report to CSV
- Export report to Excel

---

## 🎯 Execution Strategy

### Phase 1: Core Functionality (Week 1-2)
- ✅ Authentication (already created)
- 🎯 Task Card Create (priority 1)
- Task Card Edit
- Task Card Delete
- Task Card Move

### Phase 2: Board & Column Management (Week 3-4)
- Board CRUD operations
- Column CRUD operations
- Navigation tests

### Phase 3: Advanced Features (Week 5-6)
- Sprint management
- Comments
- Tags
- Filters

### Phase 4: Admin & Reports (Week 7-8)
- User management
- Settings
- Reports

---

## 🚀 Running Tests by Feature

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test": "playwright test",
    "test:auth": "playwright test tests/auth",
    "test:taskcard": "playwright test tests/taskcard",
    "test:board": "playwright test tests/board",
    "test:column": "playwright test tests/column",
    "test:sprint": "playwright test tests/sprint",
    "test:comments": "playwright test tests/comments",
    "test:tags": "playwright test tests/tags",
    "test:filters": "playwright test tests/filters",
    "test:admin": "playwright test tests/admin",
    "test:smoke": "playwright test tests/auth/login.spec.ts tests/taskcard/taskcard-create.spec.ts"
  }
}
```

---

## 📊 Test Coverage Goals

| Feature | Test Files | Critical Tests | Nice-to-Have Tests |
|---------|------------|----------------|-------------------|
| Auth | 4 | Login, Logout | Password reset, OAuth |
| Task Cards | 5 | Create, Edit, Delete | Move, Details |
| Boards | 4 | Create, Switch | Edit, Delete |
| Columns | 4 | Create, Reorder | Edit, Delete |
| Sprints | 3 | Create, Assign | Reports |
| Comments | 3 | Create | Edit, Delete |
| Tags | 3 | Create, Assign | Remove |
| Filters | 4 | All | - |
| Admin | 3 | User mgmt | Settings, Reports |

**Total Test Files**: ~30  
**Estimated Total Tests**: 150-200

---

## 🔄 CI/CD Integration

### Smoke Tests (Fast - ~2 min)
Run on every commit:
```bash
npm run test:smoke
```

### Feature Tests (Medium - ~10 min)
Run on PR:
```bash
npm run test:taskcard
npm run test:board
```

### Full Suite (Slow - ~30 min)
Run nightly or before release:
```bash
npm test
```

---

## 📝 Test Data Management

### Setup
- Create dedicated test users
- Create test boards
- Create test sprints
- Create test tags

### Cleanup
- Delete test data after tests
- Reset database state
- Use test fixtures

---

## 🛠️ Utilities to Create

In `tests/helpers.ts`:

```typescript
// Already have:
- login()
- logout()
- TEST_USER

// Need to add:
- createTask()
- editTask()
- deleteTask()
- createBoard()
- createColumn()
- createSprint()
- addTag()
- addComment()
- waitForTaskToAppear()
- waitForTaskToDisappear()
- getTaskCount()
- selectFirstPriority()
- selectFirstTag()
- selectFirstSprint()
```

---

## 🎯 Next Steps

1. ✅ Review this plan
2. 🎯 Start with `taskcard-create.spec.ts`
3. Create helper functions as needed
4. Add more tests incrementally
5. Set up CI/CD pipeline

Would you like me to create the first test file (`taskcard-create.spec.ts`) now?
