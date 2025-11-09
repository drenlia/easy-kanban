# Storage Tracking System

## Overview

The Easy Kanban application now includes a comprehensive storage tracking system that monitors disk usage for attachments and enforces storage limits based on licensing plans.

## Features

### 1. Storage Limit Configuration
- **Default Limit**: 5GB (5,368,709,120 bytes)
- **Configurable**: Can be updated via admin settings
- **Plan-based**: Will be set based on user's licensing plan in the future

### 2. Real-time Usage Tracking
- **Automatic Updates**: Storage usage is recalculated whenever attachments are added/removed
- **Database Storage**: Usage is stored in the `settings` table as `STORAGE_USED`
- **Startup Validation**: Storage usage is validated and corrected on app startup

### 3. API Endpoints

#### Get Storage Information
```
GET /api/storage/info
```
Returns:
```json
{
  "usage": 1048576,
  "limit": 5368709120,
  "remaining": 5367659520,
  "usagePercent": 0,
  "usageFormatted": "1.0 MB",
  "limitFormatted": "5.0 GB",
  "remainingFormatted": "5.0 GB"
}
```

### 4. Database Schema

#### Settings Table
- `STORAGE_LIMIT`: Maximum allowed storage in bytes
- `STORAGE_USED`: Current storage usage in bytes

#### Attachments Table
- `size`: File size in bytes (used for calculations)

## Implementation Details

### Backend Components

#### `server/utils/storageUtils.js`
Utility functions for storage management:
- `calculateStorageUsage(db)`: Calculates total storage from attachments table
- `updateStorageUsage(db, usage)`: Updates STORAGE_USED setting
- `getStorageLimit(db)`: Retrieves current storage limit
- `getStorageUsage(db)`: Retrieves current storage usage
- `checkStorageLimit(db, fileSize)`: Validates if adding a file would exceed limit
- `formatBytes(bytes)`: Formats bytes to human-readable format
- `initializeStorageUsage(db)`: Initializes storage tracking on startup

#### Integration Points
- **Attachment Upload**: Updates storage usage after successful upload
- **Attachment Deletion**: Updates storage usage after successful deletion
- **Comment Attachments**: Updates storage usage when comment attachments are added
- **App Startup**: Validates and corrects storage usage

### Frontend Components

#### `src/api.ts`
- `getStorageInfo()`: Fetches current storage information from API

## Usage Examples

### Checking Storage Before Upload
```javascript
import { getStorageInfo } from './api';

const storageInfo = await getStorageInfo();
if (storageInfo.usagePercent > 90) {
  alert('Storage is nearly full!');
}
```

### Displaying Storage Usage
```javascript
const { usageFormatted, limitFormatted, usagePercent } = await getStorageInfo();
console.log(`Using ${usageFormatted} of ${limitFormatted} (${usagePercent}%)`);
```

## Future Enhancements

### 1. License Integration
- Storage limits will be set based on user's subscription plan
- Different limits for different tiers (Basic: 1GB, Pro: 10GB, Enterprise: Unlimited)

### 2. Storage Warnings
- Frontend notifications when approaching storage limit
- Email alerts for administrators

### 3. Storage Cleanup
- Automatic cleanup of orphaned files
- Bulk deletion tools for administrators

### 4. Advanced Analytics
- Storage usage trends over time
- File type breakdown
- User-specific storage usage

## Configuration

### Setting Storage Limit
```javascript
// Via admin settings API
await updateSetting('STORAGE_LIMIT', '10737418240'); // 10GB
```

### Default Values
- **Development**: 5GB limit
- **Production**: Will be set based on licensing system

## Monitoring

### Console Logs
The system provides detailed logging:
- `📊 Storage usage updated: 1.5 MB`
- `📊 Storage usage is accurate: 1.5 MB`
- `📊 Storage usage mismatch detected. Calculated: 1.5 MB, Stored: 1.0 MB`

### Health Checks
Storage information is available via the `/api/storage/info` endpoint for monitoring and health checks.

## Error Handling

The system gracefully handles errors:
- Database connection issues
- File system errors
- Invalid storage calculations
- Missing settings

All errors are logged but don't prevent the application from functioning.
