# Easy Kanban Admin Portal Integration

This document explains how the admin portal can interact with deployed Easy Kanban instances using the `INSTANCE_TOKEN`.

## Overview

When you deploy an instance using `deploy-instance.sh`, the instance gets:
- A unique `INSTANCE_TOKEN` environment variable
- Admin portal API endpoints at `/api/admin-portal/*`
- Authentication middleware that validates the `INSTANCE_TOKEN`

## API Endpoints

All admin portal endpoints are prefixed with `/api/admin-portal/` and require the `INSTANCE_TOKEN` in the Authorization header.

### Authentication

```http
Authorization: Bearer <INSTANCE_TOKEN>
```

### Available Endpoints

#### Instance Information
- `GET /api/admin-portal/info` - Get instance information
- `GET /api/admin-portal/health` - Health check

#### Settings Management
- `GET /api/admin-portal/settings` - Get all settings
- `PUT /api/admin-portal/settings/:key` - Update single setting
- `PUT /api/admin-portal/settings` - Update multiple settings

#### User Management
- `GET /api/admin-portal/users` - Get all users
- `POST /api/admin-portal/users` - Create new user
- `PUT /api/admin-portal/users/:userId` - Update user
- `DELETE /api/admin-portal/users/:userId` - Delete user

## Usage Examples

### 1. Using the Client Library (Recommended)

```javascript
import EasyKanbanAdminClient from './admin-portal-client.js';

// Initialize client
const client = new EasyKanbanAdminClient(
  'https://my-company.ezkan.cloud', 
  'kanban-token-12345'
);

// Get instance info
const info = await client.getInstanceInfo();
console.log('Instance:', info.data);

// Configure SMTP
await client.configureSMTP({
  host: 'smtp.gmail.com',
  port: '587',
  username: 'support@drenlia.com',
  password: 'zgie ysqo zjeu brar',
  fromEmail: 'support@drenlia.com',
  secure: 'tls',
  enabled: true
});

// Update site settings
await client.updateSiteSettings({
  siteUrl: 'https://my-company.ezkan.cloud',
  siteName: 'My Company Kanban'
});

// Create a new user
const newUser = await client.createUser({
  email: 'john@mycompany.com',
  password: 'securepassword123',
  firstName: 'John',
  lastName: 'Doe',
  role: 'user'
});

// Get all users
const users = await client.getUsers();
console.log('Users:', users);

// Setup complete instance
await client.setupInstance({
  site: {
    siteUrl: 'https://my-company.ezkan.cloud',
    siteName: 'My Company Kanban'
  },
  smtp: {
    host: 'smtp.gmail.com',
    port: '587',
    username: 'support@drenlia.com',
    password: 'zgie ysqo zjeu brar',
    fromEmail: 'support@drenlia.com',
    secure: 'tls',
    enabled: true
  },
  adminUser: {
    email: 'admin@mycompany.com',
    password: 'adminpassword123',
    firstName: 'Admin',
    lastName: 'User'
  },
  users: [
    {
      email: 'user1@mycompany.com',
      password: 'password123',
      firstName: 'User',
      lastName: 'One',
      role: 'user'
    }
  ]
});
```

### 2. Direct HTTP API Calls

```javascript
const baseUrl = 'https://my-company.ezkan.cloud';
const instanceToken = 'kanban-token-12345';

// Configure SMTP settings
const smtpResponse = await fetch(`${baseUrl}/api/admin-portal/settings`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${instanceToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USERNAME: 'support@drenlia.com',
    SMTP_PASSWORD: 'zgie ysqo zjeu brar',
    SMTP_FROM_EMAIL: 'support@drenlia.com',
    SMTP_SECURE: 'tls',
    MAIL_ENABLED: 'true'
  })
});

// Create a new user
const userResponse = await fetch(`${baseUrl}/api/admin-portal/users`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${instanceToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'john@mycompany.com',
    password: 'securepassword123',
    firstName: 'John',
    lastName: 'Doe',
    role: 'user'
  })
});

// Update site settings
const siteResponse = await fetch(`${baseUrl}/api/admin-portal/settings`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${instanceToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    SITE_URL: 'https://my-company.ezkan.cloud',
    SITE_NAME: 'My Company Kanban'
  })
});
```

### 3. cURL Examples

```bash
# Get instance info
curl -H "Authorization: Bearer kanban-token-12345" \
     https://my-company.ezkan.cloud/api/admin-portal/info

# Configure SMTP
curl -X PUT \
     -H "Authorization: Bearer kanban-token-12345" \
     -H "Content-Type: application/json" \
     -d '{
       "SMTP_HOST": "smtp.gmail.com",
       "SMTP_PORT": "587",
       "SMTP_USERNAME": "support@drenlia.com",
       "SMTP_PASSWORD": "zgie ysqo zjeu brar",
       "SMTP_FROM_EMAIL": "support@drenlia.com",
       "SMTP_SECURE": "tls",
       "MAIL_ENABLED": "true"
     }' \
     https://my-company.ezkan.cloud/api/admin-portal/settings

# Create user
curl -X POST \
     -H "Authorization: Bearer kanban-token-12345" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "john@mycompany.com",
       "password": "securepassword123",
       "firstName": "John",
       "lastName": "Doe",
       "role": "user"
     }' \
     https://my-company.ezkan.cloud/api/admin-portal/users

# Update site settings
curl -X PUT \
     -H "Authorization: Bearer kanban-token-12345" \
     -H "Content-Type: application/json" \
     -d '{
       "SITE_URL": "https://my-company.ezkan.cloud",
       "SITE_NAME": "My Company Kanban"
     }' \
     https://my-company.ezkan.cloud/api/admin-portal/settings
```

## Settings Reference

### SMTP Settings
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port (usually 587 for TLS)
- `SMTP_USERNAME` - SMTP username
- `SMTP_PASSWORD` - SMTP password/app password
- `SMTP_FROM_EMAIL` - From email address
- `SMTP_SECURE` - Security type ('tls' or 'ssl')
- `MAIL_ENABLED` - Enable/disable email ('true' or 'false')

### Site Settings
- `SITE_URL` - The instance URL
- `SITE_NAME` - Display name for the site

### Other Settings
- `DEMO_ENABLED` - Enable demo mode ('true' or 'false')
- `JWT_SECRET` - JWT signing secret
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret

## User Roles

Available user roles:
- `admin` - Full administrative access
- `user` - Standard user access

## Error Handling

All API responses follow this format:

```json
{
  "success": true|false,
  "data": {...}, // On success
  "error": "Error message", // On error
  "message": "Success message" // On success
}
```

Common error responses:
- `401 Unauthorized` - Invalid or missing INSTANCE_TOKEN
- `400 Bad Request` - Invalid request data
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## Security Considerations

1. **Token Security**: The `INSTANCE_TOKEN` provides full admin access. Keep it secure.
2. **HTTPS**: Always use HTTPS in production for secure communication.
3. **Rate Limiting**: Admin portal endpoints include basic rate limiting.
4. **Logging**: All admin portal actions are logged for audit purposes.

## Integration Workflow

1. **Deploy Instance**: Use `deploy-instance.sh` to create a new instance
2. **Get Credentials**: Extract the `INSTANCE_TOKEN` from deployment output
3. **Configure Instance**: Use admin portal API to set up SMTP, site settings, etc.
4. **Create Users**: Add initial users via the admin portal API
5. **Monitor**: Use health check endpoint to monitor instance status

## Testing

You can test the admin portal integration using the provided client library:

```javascript
// Test connection
const client = new EasyKanbanAdminClient('https://my-company.ezkan.cloud', 'kanban-token-12345');

try {
  const health = await client.healthCheck();
  console.log('✅ Instance is healthy:', health);
  
  const summary = await client.getInstanceSummary();
  console.log('📊 Instance summary:', summary);
} catch (error) {
  console.error('❌ Connection failed:', error);
}
```

This integration allows your admin portal to fully manage deployed Easy Kanban instances programmatically, including user management, settings configuration, and instance monitoring.
