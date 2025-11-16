# File Upload 413 Error Fix

## Problem
Getting `413 (Content Too Large)` error when uploading files. Files show as "New" but never save.

## Root Cause
The 413 error is typically returned by a reverse proxy (nginx) before the request reaches the Express server. This happens when the request body size exceeds the proxy's `client_max_body_size` limit.

## Solution

### 1. Configure Nginx (Required)
If you're using nginx as a reverse proxy, you need to increase the `client_max_body_size` limit:

```nginx
# In your nginx configuration file
http {
    # Increase the maximum allowed body size
    client_max_body_size 100m;  # Adjust based on your needs
    
    # Or set it per location block for upload endpoints
    location /api/upload {
        client_max_body_size 100m;
        proxy_pass http://localhost:3222;
    }
}
```

After updating nginx config, reload nginx:
```bash
sudo nginx -t  # Test configuration
sudo systemctl reload nginx  # Reload nginx
```

### 2. Express Configuration (Already Updated)
- Express body parser limits increased to 100MB (though these don't apply to multipart/form-data)
- Multer limits are configured via admin settings (default 10MB)

### 3. Admin Settings
The file size limit can be configured in the admin panel:
- Go to Admin → File Uploads
- Adjust the "Max File Size" setting
- Default is 10MB (10485760 bytes)

## Current Limits

- **Express JSON/URL-encoded**: 100MB
- **Multer (multipart/form-data)**: Configurable via admin settings (default 10MB)
- **Nginx**: Must be configured separately (likely the source of 413 errors)

## Testing
After configuring nginx, test file uploads:
1. Try uploading a file smaller than the configured limit
2. Check browser console for any errors
3. Verify the file appears in the task attachments list

## Notes
- The 413 error occurs at the reverse proxy level, so it happens before the request reaches Express
- Multer handles multipart/form-data parsing, so Express body parser limits don't apply to file uploads
- The admin can configure file size limits, but nginx must also allow the larger body size

