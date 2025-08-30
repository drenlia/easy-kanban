# Easy Kanban

A modern team collaboration Kanban board application with user management, authentication, and role-based permissions. Built with React/TypeScript frontend and Node.js/Express backend.

<img src="/screenshots/overview.png" alt="Screenshot of easy-kanban" width="100%">

*[View all screenshots and features →](/screenshots/SCREENSHOTS.md)*

## Key Features

- **Multi-board Kanban system** with drag-and-drop functionality
- **User authentication** with local accounts and Google OAuth support
- **Role-based access control** (Admin/User permissions)
- **Team management** with color-coded member assignments
- **Task management** with priorities, comments, and file attachments
- **Admin panel** for user management and system configuration
- **Real-time updates** with optimistic UI responses
- **File uploads** for task attachments and user avatars

## Getting Started

**Default Admin Account:**
- Email: `admin@example.com`
- Password: `admin`

1. Log in with the default admin account
2. Create team members in the Admin panel
3. Set up your boards and columns
4. Start creating and managing tasks
5. Configure Google OAuth (optional) in Admin > SSO settings

## Permissions

| Action | Admin | User |
|--------|-------|------|
| View kanban boards | ✓ | ✓ |
| Create/edit/delete tasks | ✓ | ✓ |
| Add comments and attachments | ✓ | ✓ |
| Move tasks between columns | ✓ | ✓ |
| Create/edit/delete boards | ✓ | ✗ |
| Reorder boards and columns | ✓ | ✗ |
| Access Admin panel | ✓ | ✗ |
| Manage users | ✓ | ✗ |
| Configure site settings | ✓ | ✗ |
| Configure Google OAuth | ✓ | ✗ |
| Configure mail server | ✓ | ✗ |
| Update own profile | ✓ | ✓ |

## Requirements

- nodejs v 20.18

## Installation

### Local Development
```bash
git clone https://github.com/drenlia/easy-kanban.git
cd easy-kanban
npm install
npm run dev
```

### Docker
```bash
# Clone the repo
git clone https://github.com/drenlia/easy-kanban.git
cd easy-kanban

# Run with docker-compose
npm run docker:dev
```

**Access the application:**
- Frontend: http://localhost:3010
- Backend API: http://localhost:3222

*For more Docker information, see [DOCKER.md](/DOCKER.md)*

## Database Backup & Restore

### Automated Backup Script

Use the included backup script for easy database management:

```bash
# Create a timestamped backup with automatic cleanup
./backup-db.sh

# List all existing backups
./backup-db.sh --list

# Manual cleanup (keeps last 10 backups)
./backup-db.sh --cleanup

# Create backup without auto-cleanup
./backup-db.sh --no-cleanup

# Show help and options
./backup-db.sh --help
```

**Features:**
- Timestamped backups (`kanban-backup-YYYYMMDD_HHMMSS.db`)
- Automatic cleanup (keeps last 10 backups)
- Latest backup symlink (`kanban-latest.db`)
- Colored output and error handling
- Backup size reporting

### Manual Backup Methods

**From Docker Container:**
```bash
# Quick backup
docker cp easy-kanban:/app/server/data/kanban.db ./kanban-backup.db

# Backup with timestamp
docker cp easy-kanban:/app/server/data/kanban.db ./kanban-backup-$(date +%Y%m%d_%H%M%S).db
```

**From Docker Volume:**
```bash
# Using volume mount
docker run --rm -v easy-kanban_kanban-data:/source -v $(pwd):/backup alpine cp /source/kanban.db /backup/kanban-backup.db
```

### Restore Database

**To Running Container:**
```bash
# Stop the application
docker-compose down

# Replace database
docker cp ./kanban-backup.db easy-kanban:/app/server/data/kanban.db

# Restart application
docker-compose up -d
```

**Important:** Always stop the application before restoring to prevent data corruption.

## Security

The application includes JWT-based authentication and role-based access control. However, for production deployments:

- Change the default admin password immediately
- Set a strong JWT secret in production
- Configure HTTPS/SSL
- Consider additional network security measures

## Authors and acknowledgment
Developped with AI assistance (bolt.new and cursor.sh)

## License
No restrictions.  Use and modify as you please, but please keep this free and leave comments.

## Project status
This project was created for to answer a specific need and may be useful for someone else.

Improvements are always welcome.


