# Backend Content Requiring Translation

This document lists all backend content that needs to be translated based on the `APP_LANGUAGE` setting (EN or FR).

## 1. New Board Creation (Column Names)

**Location:** When creating new boards via API (e.g., `server/routes/boards.js` or frontend board creation)

### Default Column Names for New Boards
When users create new boards, the default column names should be set based on `APP_LANGUAGE`:

- **EN:** "To Do", "In Progress", "Testing", "Completed", "Archive"
- **FR:** "À faire", "En cours", "Test", "Terminé", "Archive"

**Note:** 
- The initial default board created during database initialization (`server/config/database.js` lines 653-666) will remain in English and will NOT be translated.
- Only NEW boards created after initialization should use column names based on `APP_LANGUAGE` setting.

---

## 2. Default Role Descriptions

**Location:** `server/config/database.js` (lines 414-415)

- **EN:** "Administrator role", "Regular user role"
- **FR:** "Rôle d'administrateur", "Rôle d'utilisateur régulier"

---

## 3. Default Priority Names

**Location:** `server/config/database.js` (lines 634-638)

- **EN:** "low", "medium", "high", "urgent"

**Note:** 
- Priorities are created during database initialization and will NOT be translated.
- These are lowercase identifiers used as keys in the system.
- If display names are needed in the UI, they should be handled on the frontend using i18n.

---

## 4. Default User Names

**Location:** `server/config/database.js` (lines 427, 594, 613, 621)

- **EN:** "Admin", "User", "Admin User", "System", "System User"

**Note:**
- Default User Names are created during database initialization and will NOT be translated.

---

## 5. Error Messages (API Responses)

**Location:** Various route files in `server/routes/`

### Common Error Messages:
- "A column with this name already exists in this board"
- "Column not found"
- "Failed to create column"
- "Failed to update column"
- "Failed to delete column"
- "Task not found"
- "Failed to create task"
- "Failed to update task"
- "Failed to delete task"
- "User not found or already inactive"
- "Failed to delete account"
- "Tag already exists"
- "Priority already exists"
- "Setting key is required"
- "Failed to update setting"
- "File not found"
- "Attachment not found"
- "Invalid relationship type"
- "Cannot create relationship with self"
- "Relationship already exists"
- "No file uploaded"
- "File upload failed"
- "Registration failed"
- "Failed to fetch [resource]"
- "Failed to [action]"

**Note:** These appear in API error responses (`res.status().json({ error: '...' })`).

---

## 6. Email Templates

**Location:** `server/services/emailTemplates.js` and `server/services/emailService.js`

### User Invitation Email
- Subject: "Welcome to [Site Name] - Activate Your Account"
- Body text with phrases like:
  - "has created an account for you"
  - "To activate your account and set up your password"
  - "This link will expire in 24 hours"
  - "If you have any questions, please contact your administrator"
  - "Best regards, The [Site Name] Team"

### Password Reset Email
- Subject: "Password Reset Request"
- Body text with phrases like:
  - "You requested a password reset"
  - "Reset Password"
  - "This link will expire in 1 hour"
  - "If you didn't request this reset, please ignore this email"

### Task Notification Emails
- Various notification types (task assigned, updated, commented, etc.)
- Email subject lines and body content

---

## 7. Achievement Names and Descriptions

**Location:** `server/migrations/index.js` (lines 295-323+)

### Achievement Names:
- "Getting Started", "Productive", "Achiever", "Champion", "Unstoppable"
- "Task Master", "Task Legend"
- "Team Player", "Collaborator", "Team Builder"
- "Communicator", "Conversationalist", "Commentator"
- "Hard Worker", "Powerhouse", "Juggernaut"
- "Observer", "Watchful"
- And more...

### Achievement Descriptions:
- "Completed your first task"
- "Completed 10 tasks"
- "Created 50 tasks"
- "Added 5 collaborators to tasks"
- "Added 10 comments"
- "Completed 50 effort points"
- "Added 10 watchers to tasks"
- And more...

---

## 8. Instance Status Messages

**Location:** `server/middleware/instanceStatus.js` (lines 71-84)

- "This instance has been temporarily suspended. Please contact support for assistance."
- "This instance has been terminated. Please contact support for assistance."
- "This instance failed to deploy properly. Please contact support for assistance."
- "This instance is currently being deployed. Please try again in a few minutes."
- "This instance is currently unavailable. Please contact support."

---

## 9. System Messages

**Location:** Various files

### Admin System Messages:
- "Achievement check completed"
- "Cleanup completed successfully"
- "Email testing disabled in demo mode"

### Console Log Messages (may not need translation):
- Various console.log messages for debugging

---

## 10. Archive Column Detection

**Location:** `server/routes/columns.js` (line 45)

- Hardcoded check: `title.toLowerCase() === 'archive'`
- **Note:** "Archive" is the same word in both English and French, so the current check should work for both languages

---

## 11. Finished Column Names Detection

**Location:** `server/routes/columns.js` (line 30)

- Default values include both EN and FR: `['Done', 'Terminé', 'Completed', 'Complété', 'Finished', 'Fini']`
- **Note:** This is already partially multilingual, but the detection logic should respect APP_LANGUAGE

---

## 12. Demo Data (Optional)

**Location:** `server/config/demoData.js`

- Demo user names: "John Smith", "Sarah Johnson", "Mike Davis"
- Demo task titles and descriptions
- **Note:** Demo data may not need translation if it's only for testing

---

## Implementation Notes

1. **Create a translation utility function** that:
   - Reads `APP_LANGUAGE` from settings
   - Returns appropriate translation based on language
   - Falls back to English if translation not found

2. **Translation storage options:**
   - Create backend translation files (similar to frontend i18n)
   - Store translations in database (settings table or new translations table)
   - Use a translation service/utility

3. **Priority order for implementation:**
   - **High Priority:** New board column names (when users create new boards)
   - **High Priority:** Error messages (user-facing API responses)
   - **Medium Priority:** Email templates (user communication)
   - **Medium Priority:** Achievement names/descriptions (gamification)
   - **Low Priority:** System messages, console logs

4. **Important Notes:**
   - **DO NOT translate** the initial default board/column names created during database initialization. These remain in English.
   - **DO NOT translate** default priority names created during database initialization. These remain in English as identifiers.
   - **DO translate** column names when creating NEW boards after initialization, based on `APP_LANGUAGE` setting.
   - Priority display names should be handled on the frontend using i18n if needed.
   - Error messages should be consistent across the API
   - Email templates need proper HTML/text formatting in both languages
   - New resources should respect APP_LANGUAGE when being created

