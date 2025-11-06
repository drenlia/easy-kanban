# Quick Wins Extraction - Testing Checklist

## Overview
This checklist covers all functionality that was extracted during the Quick Wins phase to ensure everything still works correctly.

---

## ✅ Phase 1: Zero Risk Extractions

### 1. Cursor Utilities (`src/utils/cursorUtils.ts`)
**Extracted Functions:**
- `setCustomTaskCursor(dragStartedRef)`
- `clearCustomCursor(dragStartedRef)`

**Test Scenarios:**
- [ ] **Drag and Drop Tasks**: 
  - Start dragging a task - verify the custom blue cursor appears
  - Release the task - verify the cursor returns to normal
  - Drag multiple tasks in sequence - cursor should appear/disappear correctly each time
- [ ] **Cursor During Drag Operations**:
  - Drag a task within the same column
  - Drag a task to a different column
  - Drag a task to a different board (if applicable)
  - Verify cursor appears at drag start and clears at drag end

---

### 2. Board Name Generation (`src/utils/boardUtils.ts`)
**Extracted Function:**
- `generateUniqueBoardName(boards)`

**Test Scenarios:**
- [ ] **Create New Board**:
  - Create a new board - should default to "New Board 1"
  - Create another board - should be "New Board 2"
  - Create boards until you have "New Board 1" through "New Board 5"
- [ ] **Duplicate Name Handling**:
  - Manually rename a board to "New Board 1"
  - Create a new board - should be "New Board 2" (skipping the taken name)
  - Verify it finds the next available number correctly
- [ ] **Case Insensitivity**:
  - Create a board named "new board 1" (lowercase)
  - Create a new board - should still skip to "New Board 2"
- [ ] **Multiple Boards**:
  - Create several boards and verify naming sequence is correct

---

### 3. Column Renumbering (`src/utils/columnUtils.ts`)
**Note:** This was already extracted in a previous phase, but verify it still works.

**Test Scenarios:**
- [ ] **Column Operations**:
  - Create a new column - columns should be renumbered with clean integer positions
  - Delete a column - remaining columns should be renumbered
  - Reorder columns by dragging - positions should be renumbered after reorder
- [ ] **Position Integrity**:
  - Verify no gaps in column positions (0, 1, 2, 3... not 0, 1.5, 2, 3.5)
  - Verify positions are sequential integers

---

## ✅ Phase 2: Low Risk Extractions

### 4. Task Reordering (`src/utils/taskReorderingUtils.ts`)
**Extracted Function:**
- `handleSameColumnReorder(...)`

**Test Scenarios:**
- [ ] **Same Column Reordering**:
  - Drag a task within the same column to a different position
  - Verify the task moves to the new position
  - Verify other tasks in the column adjust their positions correctly
  - Try reordering multiple times in the same column
- [ ] **Position Updates**:
  - Verify task positions are updated sequentially (0, 1, 2, 3...)
  - Verify no position conflicts after reordering
- [ ] **Real-time Updates**:
  - Have two users viewing the same board
  - User1 reorders a task - User2 should see the update in real-time
- [ ] **Edge Cases**:
  - Reorder the first task to the last position
  - Reorder the last task to the first position
  - Reorder a task to its current position (should handle gracefully)

---

### 5. Cross-Column Move (`src/utils/taskReorderingUtils.ts`)
**Extracted Function:**
- `handleCrossColumnMove(...)`

**Test Scenarios:**
- [ ] **Move Task Between Columns**:
  - Drag a task from one column to another
  - Verify the task appears in the target column at the correct position
  - Verify the task is removed from the source column
  - Verify positions are updated in both columns
- [ ] **Position Updates**:
  - Move a task to the beginning of a column (position 0)
  - Move a task to the middle of a column
  - Move a task to the end of a column
  - Verify all tasks in both columns have sequential positions
- [ ] **Multiple Moves**:
  - Move several tasks between columns
  - Verify positions remain consistent
- [ ] **Real-time Updates**:
  - Have two users viewing the same board
  - User1 moves a task to another column - User2 should see the update in real-time
- [ ] **Error Handling**:
  - If a move fails (simulate network error), verify the UI reverts correctly
  - Verify error messages are displayed appropriately

---

### 6. User Invitation (`src/utils/userInvitationUtils.ts`)
**Extracted Functions:**
- `handleInviteUser(email, handleRefreshData)`
- `generateNameFromEmail(email)`

**Test Scenarios:**
- [ ] **Basic User Invitation**:
  - Invite a user with a standard email (e.g., `john.doe@example.com`)
  - Verify the invitation is sent successfully
  - Verify the user appears in the members list after invitation
  - Verify the user receives the activation email
- [ ] **Name Generation from Email**:
  - `john.doe@example.com` → Should generate "John" and "Doe"
  - `jane_smith@example.com` → Should generate "Jane" and "Smith"
  - `bob@example.com` → Should generate "Bob" and "User"
  - `info@example.com` → Should generate "Info" and "User"
  - `admin@example.com` → Should generate "Admin" and "User"
  - `support@example.com` → Should generate "Support" and "User"
  - `noreply@example.com` → Should generate "System" and "User"
- [ ] **Email Server Status Check**:
  - If email server is unavailable, verify appropriate error message
  - Verify user is still created even if email check fails (with warning)
- [ ] **Error Handling**:
  - Try to invite a user with an existing email - should show "already exists" error
  - Try to invite with invalid email format - should show validation error
  - Try to invite with missing email - should show required field error
- [ ] **Email Sending**:
  - Verify invitation email is sent with activation link
  - If email sending fails, verify appropriate error message is shown
  - Verify user account is still created even if email fails (with notification)

---

## 🔄 Integration Tests

### Real-time Updates (WebSocket)
- [ ] **Board Creation**: User1 creates a board → User2 sees it appear in real-time
- [ ] **Column Creation**: User1 creates a column → User2 sees it appear in real-time
- [ ] **Task Creation**: User1 creates a task → User2 sees it appear in real-time
- [ ] **Task Reordering**: User1 reorders a task → User2 sees the update in real-time
- [ ] **Task Moving**: User1 moves a task to another column → User2 sees the update in real-time
- [ ] **Board/Column/Task Deletion**: User1 deletes → User2 sees removal in real-time
- [ ] **Board/Column Name Updates**: User1 updates name → User2 sees the change in real-time
- [ ] **Board/Column Reordering**: User1 reorders → User2 sees the change in real-time

### Drag and Drop
- [ ] **Task Drag and Drop**: All drag operations work smoothly with custom cursor
- [ ] **Column Drag and Drop**: Column reordering works correctly
- [ ] **Board Drag and Drop**: Board reordering works correctly (if applicable)

---

## 🐛 Regression Tests

### General Functionality
- [ ] **Page Load**: Application loads without errors
- [ ] **Navigation**: All page navigation works (Kanban, Admin, Reports, etc.)
- [ ] **Authentication**: Login/logout works correctly
- [ ] **Data Persistence**: All changes are saved to the database
- [ ] **No Console Errors**: Check browser console for any JavaScript errors
- [ ] **No Build Errors**: Application builds successfully

### Performance
- [ ] **Initial Load**: Application loads in reasonable time
- [ ] **Drag Performance**: Dragging tasks feels smooth and responsive
- [ ] **Real-time Updates**: Updates appear quickly without lag

---

## 📝 Notes

- **Focus Areas**: Pay special attention to drag and drop operations and real-time updates, as these were the most complex extractions
- **Multi-user Testing**: Test with at least 2 browser sessions to verify real-time updates work correctly
- **Error Scenarios**: Don't forget to test error cases (network failures, validation errors, etc.)

---

## ✅ Sign-off

Once all items are tested and verified:
- [ ] All Phase 1 tests pass
- [ ] All Phase 2 tests pass
- [ ] All integration tests pass
- [ ] No regressions found
- [ ] Ready to proceed with next refactoring phase

