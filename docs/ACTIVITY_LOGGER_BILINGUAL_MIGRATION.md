# Activity Logger Bilingual Migration & SQL Manager Integration

## Summary

This document describes the changes made to:
1. **Migrate activityLogger.js to use SQL Manager** - All database queries now use centralized SQL Manager functions
2. **Implement bilingual activity messages** - Activity details are now stored as JSON with both English and French translations
3. **Maintain SQLite compatibility** - All changes work with both SQLite and PostgreSQL

## Changes Made

### 1. SQL Manager Integration

**File**: `server/utils/sqlManager/activity.js`

Added new SQL Manager functions:
- `getTaskInfoForActivity(db, taskId)` - Get task and board info
- `getTaskDetailsForActivity(db, taskId)` - Get task ticket and project
- `getUserRoleForActivity(db, userId)` - Get user role
- `getFallbackRole(db)` - Get fallback role
- `checkUserExists(db, userId)` - Check if user exists
- `getMemberName(db, memberId)` - Get member name
- `getTaskTicket(db, taskId)` - Get task ticket
- `insertActivity(db, activityData)` - Insert activity record

**Updated**:
- `getActivityFeed(db, limit, userLanguage)` - Now accepts language parameter and parses bilingual JSON

### 2. Bilingual Message Storage

**File**: `server/services/activityLogger.js`

**Changes**:
- All activity details are now stored as JSON: `{"en": "English message", "fr": "French message"}`
- `logTaskActivity()` - Generates bilingual messages for task activities
- `logActivity()` - Generates bilingual messages for general activities
- `logCommentActivity()` - Generates bilingual messages for comment activities
- `generateTaskUpdateDetails()` - Returns bilingual JSON for task field updates
- `generateDescriptionChangeDetails()` - Returns bilingual JSON for description changes

**Helper Functions Added**:
- Uses `getBilingualTranslation()` from `server/utils/i18n.js` to generate both languages
- Uses `t()` function with explicit language parameter for each language

### 3. Activity Retrieval

**File**: `server/routes/activity.js`

**Changes**:
- Activity feed endpoint now accepts `lang` query parameter
- Falls back to user preferences if no language specified
- Parses bilingual JSON and returns message in user's language

**File**: `server/utils/sqlManager/activity.js`

**Changes**:
- `getActivityFeed()` now parses JSON details and returns user's language
- Backward compatible with old format (non-JSON details)

### 4. i18n Utilities

**File**: `server/utils/i18n.js`

**Added**:
- `getTranslatorForLanguage(lang)` - Get translator for specific language
- `getBilingualTranslation(key, params)` - Get both English and French translations

## Database Schema

**No schema changes required** - The `details` column is already `TEXT`, which can store JSON in both SQLite and PostgreSQL.

**Format**:
```json
{
  "en": "created task \"Task Title\" (TICKET-123) in board \"Board Name\"",
  "fr": "a créé la tâche \"Task Title\" (TICKET-123) dans le tableau \"Board Name\""
}
```

## Backward Compatibility

### Old Format Support
- Activities with old format (plain text) are still supported
- When retrieving activities, if details is not valid JSON, it's returned as-is
- This ensures existing activities continue to work

### Migration Strategy
1. New activities are stored in bilingual format
- Old activities can be migrated gradually (optional)
- No breaking changes - both formats work

## API Changes

### Activity Feed Endpoint

**Before**:
```
GET /api/activity/feed?limit=20
```

**After**:
```
GET /api/activity/feed?limit=20&lang=en
GET /api/activity/feed?limit=20&lang=fr
```

**Response**:
- If `lang` is specified, returns details in that language
- If not specified, uses user preferences or defaults to 'en'
- Details field contains single language string (not JSON)

## Usage Examples

### Creating Activity with Bilingual Messages

```javascript
// Automatically generates bilingual JSON
await logTaskActivity(userId, 'create_task', taskId, 'Task created', {
  db: database,
  tenantId: tenantId
});

// Stored in database as:
// {"en": "created task \"Task Title\" in board \"Board Name\"", "fr": "a créé la tâche \"Task Title\" dans le tableau \"Board Name\""}
```

### Retrieving Activities

```javascript
// Get activities in English
const activities = await activityQueries.getActivityFeed(db, 20, 'en');

// Get activities in French
const activities = await activityQueries.getActivityFeed(db, 20, 'fr');

// Each activity.details contains single language string
```

## SQLite Compatibility

✅ **All changes are SQLite compatible**:
- Uses SQL Manager which handles both SQLite and PostgreSQL
- JSON stored as TEXT (works in both databases)
- Placeholder conversion handled automatically (`?` → `$1, $2, $3`)

## Testing Checklist

- [ ] Test activity logging with SQLite
- [ ] Test activity logging with PostgreSQL
- [ ] Test activity retrieval in English
- [ ] Test activity retrieval in French
- [ ] Test backward compatibility with old format activities
- [ ] Test all activity types (task, comment, general)
- [ ] Test task field updates (description, assignee, etc.)

## Future Enhancements

1. **Migration Script** - Optional script to convert old activities to bilingual format
2. **Language Detection** - Automatically detect user language from request headers
3. **More Languages** - Support additional languages beyond English and French

## Notes

- Task titles and board titles are **not translated** - they remain as stored in database
- Only the activity message template is translated
- Project identifiers and task tickets are appended to both languages (same format)
- Member names are not translated (they remain as stored)
