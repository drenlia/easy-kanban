import { test, expect } from '@playwright/test';

/**
 * Basic Navigation Test
 * 
 * Simple test that:
 * 1. Login (handled by global auth setup)
 * 2. Navigate through boards, waiting 2 seconds each
 * 3. Go back to first board
 * 4. Click on first task
 * 5. Exit
 */

test('should navigate through boards and view a task', async ({ page }) => {
  // Step 1: Navigate to the app (already logged in via global setup)
  await page.goto('/');
  
  // Wait for the Kanban board to load (networkidle never fires with WebSockets/polling)
  await expect(page.locator('[data-column-header]').first()).toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('domcontentloaded');
  
  console.log('✅ Step 1: Logged in and on kanban board');
  
  // Step 2: Navigate through boards
  // Board tabs are the tabs above the column names (BoardTabs component)
  // They have rounded-t-lg and contain the board title
  const boardTabs = page.locator('div.rounded-t-lg.cursor-pointer, button.rounded-t-lg').filter({
    has: page.locator('span')
  });
  
  const boardCount = await boardTabs.count();
  console.log(`Found ${boardCount} board tabs`);
  
  if (boardCount > 0) {
    // Click through each board, waiting 2 seconds
    for (let i = 0; i < boardCount; i++) {
      await boardTabs.nth(i).click();
      console.log(`✅ Step 2.${i + 1}: Viewing board ${i + 1}`);
      await page.waitForTimeout(2000);
    }
    
    // Step 3: Go back to first board
    await boardTabs.first().click();
    await page.waitForTimeout(1000);
    console.log('✅ Step 3: Back to first board');
  } else {
    console.log('⚠️ No board tabs found, staying on current board');
  }
  
  // Step 4: Click on the first task
  // Task cards have class "task-card"
  const firstTask = page.locator('.task-card').first();
  
  if (await firstTask.isVisible({ timeout: 5000 }).catch(() => false)) {
    await firstTask.click();
    console.log('✅ Step 4: Clicked on first task');
    await page.waitForTimeout(2000);
    
    // Step 5: Edit description - replace with date/time, make bold and italic
    const descriptionText = `IT IS NOW: ${new Date().toLocaleString()}`;
    
    // Find the description editor (TipTap ProseMirror) - it's next to the "Description" label
    const descriptionLabel = page.locator('label').filter({ hasText: /description/i }).first();
    const descriptionEditor = descriptionLabel.locator('..').locator('.ProseMirror, [contenteditable="true"]').first();
    
    if (await descriptionEditor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await descriptionEditor.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.type(descriptionText);
      await page.keyboard.press('ControlOrMeta+a');
      
      // Click Bold then Italic toolbar buttons (title="Bold" / "Gras", title="Italic" / "Italique")
      const boldButton = page.locator('button[title="Bold"], button[title="Gras"]').first();
      const italicButton = page.locator('button[title="Italic"], button[title="Italique"]').first();
      await boldButton.click();
      await italicButton.click();
      
      // Click away to save (description auto-saves on blur)
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      console.log('✅ Step 5: Updated description with bold/italic');
    } else {
      console.log('⚠️ Description editor not found');
    }
  } else {
    console.log('⚠️ No tasks found on board');
  }
  
  // Step 6: Exit (test ends)
  console.log('✅ Step 6: Test complete');
});
