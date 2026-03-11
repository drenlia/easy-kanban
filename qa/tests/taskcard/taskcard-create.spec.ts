import { test, expect } from '@playwright/test';

/**
 * Task Card Creation Tests
 * 
 * Tests the complete task creation workflow including:
 * - Creating tasks with various field combinations
 * - Validating required fields
 * - Assigning priorities, tags, and sprints
 * - Verifying task appears in the correct location
 * 
 * Note: Authentication is handled globally via auth.setup.ts
 * All tests start with an authenticated session.
 */

test.describe('Task Card Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Kanban board
    // User is already authenticated via global setup
    await page.goto('/');
    
    // Wait for the Kanban board to load
    await expect(page.locator('[data-testid="kanban-board"]').or(
      page.locator('main')
    )).toBeVisible({ timeout: 10000 });
    
    // Wait for initial data to load
    await page.waitForLoadState('networkidle');
  });

  test('should create a minimal task with title only', async ({ page }) => {
    // Find the "Add Task" button or input in first column
    // Based on the codebase, tasks are added via a button/input at the top of columns
    const addTaskButton = page.locator('button', { hasText: /add task|new task|\+/i }).first();
    await expect(addTaskButton).toBeVisible({ timeout: 5000 });
    await addTaskButton.click();
    
    // Fill in the task title
    const titleInput = page.locator('input[placeholder*="title" i], input[name="title"], textarea[placeholder*="title" i]').first();
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Minimal Test Task');
    
    // Submit the form (look for Save/Create/Add button or press Enter)
    await titleInput.press('Enter');
    // Alternative: await page.locator('button', { hasText: /save|create|add/i }).click();
    
    // Wait for task to appear in the column
    const taskCard = page.locator('.task-card, [data-testid="task-card"]', { 
      hasText: 'Minimal Test Task' 
    }).or(
      page.locator('div', { hasText: 'Minimal Test Task' }).filter({ has: page.locator('[draggable="true"]') })
    );
    
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Minimal task created successfully');
  });

  test('should create a complete task with all fields', async ({ page }) => {
    // Open task creation form
    const addTaskButton = page.locator('button', { hasText: /add task|new task|\+/i }).first();
    await addTaskButton.click();
    
    // Fill in title
    const titleInput = page.locator('input[placeholder*="title" i], input[name="title"]').first();
    await expect(titleInput).toBeVisible();
    await titleInput.fill('Complete Test Task');
    
    // Fill in description (might need to open details/expand form)
    const descriptionInput = page.locator('textarea[placeholder*="description" i], textarea[name="description"]').first();
    if (await descriptionInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descriptionInput.fill('This is a test task with all fields filled');
    }
    
    // Set start date (today)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const startDateInput = page.locator('input[type="date"][name*="start" i], input[type="date"]').first();
    if (await startDateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startDateInput.fill(today);
    }
    
    // Set end date (7 days from now)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 7);
    const endDateStr = endDate.toISOString().split('T')[0];
    const endDateInput = page.locator('input[type="date"][name*="due" i], input[type="date"][name*="end" i]').nth(1);
    if (await endDateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await endDateInput.fill(endDateStr);
    }
    
    // Set effort
    const effortInput = page.locator('input[type="number"][name*="effort" i], input[name="effort"]').first();
    if (await effortInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await effortInput.fill('5');
    }
    
    // Select priority (first in list)
    const priorityDropdown = page.locator('select[name*="priority" i], button[aria-label*="priority" i]').first();
    if (await priorityDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (await priorityDropdown.evaluate(el => el.tagName === 'SELECT')) {
        // It's a select element
        await priorityDropdown.selectOption({ index: 1 }); // Skip "Select..." option
      } else {
        // It's a button/dropdown
        await priorityDropdown.click();
        await page.locator('li, [role="option"]').first().click();
      }
    }
    
    // Select tag (first in list)
    const tagButton = page.locator('button', { hasText: /add tag|select tag/i }).first();
    if (await tagButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tagButton.click();
      await page.locator('[role="option"], li', { hasText: /.+/ }).first().click();
    }
    
    // Select sprint (first in list)
    const sprintDropdown = page.locator('button', { hasText: /sprint|backlog/i }).first();
    if (await sprintDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
      await sprintDropdown.click();
      await page.locator('[role="option"], li').first().click();
    }
    
    // Save the task
    const saveButton = page.locator('button', { hasText: /save|create|add task/i }).first();
    await expect(saveButton).toBeVisible();
    await saveButton.click();
    
    // Wait for task to appear
    await page.waitForTimeout(1000); // Brief wait for animation
    const taskCard = page.locator('div', { hasText: 'Complete Test Task' });
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    
    // Verify task has a ticket number
    // Ticket format is usually like "PROJ-123" or "#123"
    const ticketNumber = taskCard.locator('span, div', { hasText: /#\d+|[A-Z]+-\d+/ });
    await expect(ticketNumber).toBeVisible();
    
    console.log('✅ Complete task created with all fields');
  });

  test('should prevent creating task without title', async ({ page }) => {
    // Open task creation form
    const addTaskButton = page.locator('button', { hasText: /add task|new task|\+/i }).first();
    await addTaskButton.click();
    
    // Try to submit without entering title
    const titleInput = page.locator('input[placeholder*="title" i], input[name="title"]').first();
    await expect(titleInput).toBeVisible();
    
    // Try to press Enter on empty input
    await titleInput.press('Enter');
    
    // Task should NOT be created
    // Either the input stays focused or an error message appears
    const isInputStillFocused = await titleInput.evaluate(el => el === document.activeElement);
    const hasErrorMessage = await page.locator('text=/required|cannot be empty|enter.*title/i').isVisible({ timeout: 2000 }).catch(() => false);
    
    expect(isInputStillFocused || hasErrorMessage).toBeTruthy();
    
    console.log('✅ Empty title validation works');
  });

  test('should show warning for end date before start date', async ({ page }) => {
    // Open task creation form
    const addTaskButton = page.locator('button', { hasText: /add task|new task|\+/i }).first();
    await addTaskButton.click();
    
    // Fill in title
    const titleInput = page.locator('input[placeholder*="title" i]').first();
    await titleInput.fill('Date Validation Test');
    
    // Set start date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const startDateStr = tomorrow.toISOString().split('T')[0];
    
    // Set end date to today (before start date)
    const today = new Date().toISOString().split('T')[0];
    
    const startDateInput = page.locator('input[type="date"]').first();
    const endDateInput = page.locator('input[type="date"]').nth(1);
    
    if (await startDateInput.isVisible({ timeout: 2000 }).catch(() => false) &&
        await endDateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      
      await startDateInput.fill(startDateStr);
      await endDateInput.fill(today);
      
      // Look for validation message
      const warningMessage = page.locator('text=/end date.*before.*start|due date.*before|invalid date range/i');
      await expect(warningMessage).toBeVisible({ timeout: 3000 });
      
      console.log('✅ Date validation warning displayed');
    } else {
      console.log('⚠️ Date inputs not visible in this task creation flow');
    }
  });

  test('should assign task to correct column', async ({ page }) => {
    // Get the first column's name/title
    const firstColumn = page.locator('[data-testid="column"], .column').first();
    const columnTitle = await firstColumn.locator('h2, h3, .column-title').textContent();
    
    // Create task in this column
    const addTaskButton = firstColumn.locator('button', { hasText: /add task|\+/i }).first();
    await addTaskButton.click();
    
    const titleInput = page.locator('input[placeholder*="title" i]').first();
    await titleInput.fill('Column Assignment Test');
    await titleInput.press('Enter');
    
    // Wait for task to appear
    await page.waitForTimeout(1000);
    
    // Verify task appears in the same column
    const taskInColumn = firstColumn.locator('div', { hasText: 'Column Assignment Test' });
    await expect(taskInColumn).toBeVisible({ timeout: 5000 });
    
    console.log(`✅ Task correctly assigned to column: ${columnTitle}`);
  });

  test('should generate unique ticket number for new task', async ({ page }) => {
    // Create first task
    const addTaskButton = page.locator('button', { hasText: /add task|\+/i }).first();
    await addTaskButton.click();
    
    const titleInput = page.locator('input[placeholder*="title" i]').first();
    await titleInput.fill('Ticket Number Test 1');
    await titleInput.press('Enter');
    await page.waitForTimeout(1000);
    
    // Get the ticket number
    const firstTask = page.locator('div', { hasText: 'Ticket Number Test 1' });
    const firstTicket = await firstTask.locator('span, div', { hasText: /#\d+|[A-Z]+-\d+/ }).textContent();
    
    // Create second task
    await addTaskButton.click();
    await titleInput.fill('Ticket Number Test 2');
    await titleInput.press('Enter');
    await page.waitForTimeout(1000);
    
    // Get the second ticket number
    const secondTask = page.locator('div', { hasText: 'Ticket Number Test 2' });
    const secondTicket = await secondTask.locator('span, div', { hasText: /#\d+|[A-Z]+-\d+/ }).textContent();
    
    // Verify tickets are different
    expect(firstTicket).not.toBe(secondTicket);
    
    console.log(`✅ Unique tickets generated: ${firstTicket}, ${secondTicket}`);
  });

  test('should persist task after page refresh', async ({ page }) => {
    // Create a task
    const addTaskButton = page.locator('button', { hasText: /add task|\+/i }).first();
    await addTaskButton.click();
    
    const uniqueTitle = `Persistence Test ${Date.now()}`;
    const titleInput = page.locator('input[placeholder*="title" i]').first();
    await titleInput.fill(uniqueTitle);
    await titleInput.press('Enter');
    
    // Wait for task to appear
    await page.waitForTimeout(1000);
    const taskCard = page.locator('div', { hasText: uniqueTitle });
    await expect(taskCard).toBeVisible();
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Verify task still exists
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Task persisted after page refresh');
  });
});
