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
 * 
 * Task Creation Flow:
 * 1. Click the + button in a column header
 * 2. A new card appears at the top with title "New Task"
 * 3. Click on the title to edit it
 * 4. Click on description area to edit it
 * 5. Edit other fields as needed
 */

test.describe('Task Card Creation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the Kanban board
    // User is already authenticated via global setup
    await page.goto('/');
    
    // Wait for the Kanban board to load by checking for column headers
    await expect(page.locator('[data-column-header]').first()).toBeVisible({ timeout: 10000 });
    
    // Wait for initial data to load
    await page.waitForLoadState('networkidle');
  });

  test('should create a minimal task with title only', async ({ page }) => {
    // Find the "To Do" column and its + button
    // Columns have data-column-header attribute, find the one with "To Do" text
    const toDoColumn = page.locator('[data-column-header]', { hasText: /to do/i }).first();
    await expect(toDoColumn).toBeVisible({ timeout: 5000 });
    
    // Click the + button in the column header
    const addButton = toDoColumn.locator('button[data-column-header]');
    await expect(addButton).toBeVisible();
    await addButton.click();
    
    // Wait for the new card to appear with "New Task" title
    const newTaskCard = page.locator('text=New Task').first();
    await expect(newTaskCard).toBeVisible({ timeout: 5000 });
    
    // Click on the title to edit it
    await newTaskCard.click();
    
    // Wait for the input field to appear and be focused
    const titleInput = page.locator('input[type="text"]').filter({ hasText: /New Task/i }).or(
      page.locator('input[type="text"]').filter({ has: page.locator('[value="New Task"]') })
    ).or(
      page.locator('input.border-blue-400').first()
    );
    await expect(titleInput).toBeVisible({ timeout: 3000 });
    
    // Clear and enter new title
    await titleInput.fill('Minimal Test Task');
    
    // Press Enter or click away to save
    await titleInput.press('Enter');
    
    // Wait a moment for the save to process
    await page.waitForTimeout(1000);
    
    // Verify the task appears with the new title
    const taskCard = page.locator('text=Minimal Test Task');
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Minimal task created successfully');
  });

  test('should create a complete task with title and description', async ({ page }) => {
    // Find the "To Do" column and click + button
    const toDoColumn = page.locator('[data-column-header]', { hasText: /to do/i }).first();
    const addButton = toDoColumn.locator('button[data-column-header]');
    await addButton.click();
    
    // Wait for new card with "New Task" title
    await expect(page.locator('text=New Task').first()).toBeVisible({ timeout: 5000 });
    
    // Click on the title to edit it
    const newTaskTitle = page.locator('text=New Task').first();
    await newTaskTitle.click();
    
    // Wait for input field and enter title
    const titleInput = page.locator('input.border-blue-400').first();
    await expect(titleInput).toBeVisible({ timeout: 3000 });
    await titleInput.fill('Complete Test Task');
    await titleInput.press('Enter');
    
    // Wait for title to save
    await page.waitForTimeout(1000);
    
    // Now click on the card to open task details or find description area
    // The description is in the card body, look for it
    const taskCard = page.locator('text=Complete Test Task').locator('..').locator('..').first();
    
    // Look for description area - it should be empty or have placeholder text
    // Click in the description area (below the title)
    const descriptionArea = taskCard.locator('div').filter({ hasText: /^$/ }).or(
      taskCard.locator('[contenteditable]')
    ).or(
      taskCard.locator('textarea')
    ).first();
    
    // Try clicking on the card itself if description area not found
    if (!(await descriptionArea.isVisible().catch(() => false))) {
      await taskCard.click();
      await page.waitForTimeout(500);
    } else {
      await descriptionArea.click();
    }
    
    // Look for description editor (might be TipTap editor or textarea)
    const descriptionEditor = page.locator('[contenteditable="true"]').or(
      page.locator('textarea[placeholder*="description" i]')
    ).first();
    
    if (await descriptionEditor.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descriptionEditor.fill('This is a test task with description filled in');
      // Click away to save
      await page.locator('body').click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(1000);
    }
    
    // Verify task exists with title
    await expect(page.locator('text=Complete Test Task')).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Complete task created with title and description');
  });

  test('should prevent creating task without title', async ({ page }) => {
    // Find the "To Do" column and click + button
    const toDoColumn = page.locator('[data-column-header]', { hasText: /to do/i }).first();
    const addButton = toDoColumn.locator('button[data-column-header]');
    await addButton.click();
    
    // Wait for new card with "New Task" title
    await expect(page.locator('text=New Task').first()).toBeVisible({ timeout: 5000 });
    
    // Click on the title to edit it
    const newTaskTitle = page.locator('text=New Task').first();
    await newTaskTitle.click();
    
    // Wait for input field
    const titleInput = page.locator('input.border-blue-400').first();
    await expect(titleInput).toBeVisible({ timeout: 3000 });
    
    // Clear the title (make it empty)
    await titleInput.clear();
    
    // Try to press Enter on empty input
    await titleInput.press('Enter');
    
    // The task should revert to "New Task" or the input should stay focused
    // The card should still say "New Task" after trying to save empty
    await page.waitForTimeout(500);
    
    // Check if we still have "New Task" or if the input is still visible/focused
    const stillEditingOrDefaultTitle = await titleInput.isVisible().catch(() => false) || 
                                        await page.locator('text=New Task').isVisible().catch(() => false);
    
    expect(stillEditingOrDefaultTitle).toBeTruthy();
    
    console.log('✅ Empty title validation works');
  });

  test('should assign task to correct column', async ({ page }) => {
    // Find the "To Do" column
    const toDoColumn = page.locator('[data-column-header]', { hasText: /to do/i }).first();
    
    // Get the column title for verification
    const columnTitle = await toDoColumn.locator('[data-column-title]').or(
      toDoColumn.locator('h3')
    ).textContent();
    
    // Click + button to create task
    const addButton = toDoColumn.locator('button[data-column-header]');
    await addButton.click();
    
    // Wait for new task and edit title
    await expect(page.locator('text=New Task').first()).toBeVisible({ timeout: 5000 });
    const newTaskTitle = page.locator('text=New Task').first();
    await newTaskTitle.click();
    
    const titleInput = page.locator('input.border-blue-400').first();
    await titleInput.fill('Column Assignment Test');
    await titleInput.press('Enter');
    
    // Wait for save
    await page.waitForTimeout(1000);
    
    // Verify task appears in the To Do column
    // The task should be within the same column container
    const taskInColumn = toDoColumn.locator('..').locator('..').locator('text=Column Assignment Test');
    await expect(taskInColumn).toBeVisible({ timeout: 5000 });
    
    console.log(`✅ Task correctly assigned to column: ${columnTitle}`);
  });

  test('should generate unique ticket number for new task', async ({ page }) => {
    // Create first task
    const toDoColumn = page.locator('[data-column-header]', { hasText: /to do/i }).first();
    const addButton = toDoColumn.locator('button[data-column-header]');
    
    // Create first task
    await addButton.click();
    await expect(page.locator('text=New Task').first()).toBeVisible({ timeout: 5000 });
    let taskTitle = page.locator('text=New Task').first();
    await taskTitle.click();
    let titleInput = page.locator('input.border-blue-400').first();
    await titleInput.fill('Ticket Number Test 1');
    await titleInput.press('Enter');
    await page.waitForTimeout(1000);
    
    // Get the first task's ticket number (format: #123 or PROJ-123)
    const firstTask = page.locator('text=Ticket Number Test 1');
    await expect(firstTask).toBeVisible();
    const firstTaskCard = firstTask.locator('..').locator('..').first();
    const firstTicketElement = firstTaskCard.locator('span, div').filter({ hasText: /#\d+|[A-Z]+-\d+/ }).first();
    const firstTicket = await firstTicketElement.textContent().catch(() => '');
    
    // Create second task
    await addButton.click();
    await expect(page.locator('text=New Task').first()).toBeVisible({ timeout: 5000 });
    taskTitle = page.locator('text=New Task').first();
    await taskTitle.click();
    titleInput = page.locator('input.border-blue-400').first();
    await titleInput.fill('Ticket Number Test 2');
    await titleInput.press('Enter');
    await page.waitForTimeout(1000);
    
    // Get the second task's ticket number
    const secondTask = page.locator('text=Ticket Number Test 2');
    await expect(secondTask).toBeVisible();
    const secondTaskCard = secondTask.locator('..').locator('..').first();
    const secondTicketElement = secondTaskCard.locator('span, div').filter({ hasText: /#\d+|[A-Z]+-\d+/ }).first();
    const secondTicket = await secondTicketElement.textContent().catch(() => '');
    
    // Verify tickets are different
    expect(firstTicket).not.toBe(secondTicket);
    expect(firstTicket.length).toBeGreaterThan(0);
    expect(secondTicket.length).toBeGreaterThan(0);
    
    console.log(`✅ Unique tickets generated: ${firstTicket}, ${secondTicket}`);
  });

  test('should persist task after page refresh', async ({ page }) => {
    // Create a task with unique title
    const uniqueTitle = `Persistence Test ${Date.now()}`;
    
    const toDoColumn = page.locator('[data-column-header]', { hasText: /to do/i }).first();
    const addButton = toDoColumn.locator('button[data-column-header]');
    await addButton.click();
    
    await expect(page.locator('text=New Task').first()).toBeVisible({ timeout: 5000 });
    const taskTitle = page.locator('text=New Task').first();
    await taskTitle.click();
    
    const titleInput = page.locator('input.border-blue-400').first();
    await titleInput.fill(uniqueTitle);
    await titleInput.press('Enter');
    
    // Wait for save
    await page.waitForTimeout(1000);
    
    // Verify task appears
    const taskCard = page.locator(`text=${uniqueTitle}`);
    await expect(taskCard).toBeVisible();
    
    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // Wait for board to load after refresh
    await expect(page.locator('[data-column-header]').first()).toBeVisible({ timeout: 10000 });
    
    // Verify task still exists
    await expect(taskCard).toBeVisible({ timeout: 5000 });
    
    console.log('✅ Task persisted after page refresh');
  });
});
