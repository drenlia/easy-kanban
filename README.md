# Easy Kanban

A modern team collaboration Kanban board application with user management, authentication, and role-based permissions. Built with React/TypeScript frontend and Node.js/Express backend.

<img src="/screenshots/overview.png" alt="Screenshot of easy-kanban" width="100%">

*[View all screenshots and features →](/screenshots/SCREENSHOTS.md)*

## Key Features

### Core Functionality
- **Multi-board Kanban system** with drag-and-drop functionality
- **Multiple view modes**: Kanban (visual board), List (table format), and Gantt (timeline) views
- **Real-time collaboration** - see changes instantly as team members work
- **User authentication** with local accounts and Google OAuth support
- **Role-based access control** (Admin/User permissions)
- **Theme support** - Light and dark mode

### Task Management
- **Task management** with priorities, comments, and file attachments
- **Rich text editing** for task descriptions and comments with formatting, links, and embedded content
- **Task relationships** - Link tasks as parent-child or related relationships
- **Task view modes** - Compact, shrink, and expand views for optimal screen space
- **Task toolbar** - Quick actions on hover (assign members, change priority, add tags, copy tasks)
- **Quick edit** - Inline editing without opening full task details
- **Task watchers & collaborators** - Add team members to watch or collaborate on tasks
- **Requesters** - Track who requested each task
- **Sprint association** - Organize tasks by time-based planning periods

### Team & Collaboration
- **Team management** with color-coded member assignments
- **Activity feed** - Draggable panel showing real-time changes, comments, and team activity
- **Member filtering** - Filter tasks by assignees, watchers, collaborators, requesters, and system tasks

### Views & Navigation
- **Kanban View** - Visual board with drag-and-drop between columns
- **List View** - Table format with sorting, filtering, column configuration, and horizontal scrolling
- **Gantt View** - Timeline view with task dependencies, visual arrows, and virtual scrolling
- **Advanced search & filtering** - Filter by text, dates, members, priorities, tags, project IDs, and sprints
- **Saved filters** - Save and share frequently used filter combinations
- **Sprint filtering** - Filter tasks by sprint or view backlog (unassigned tasks)

### Reporting & Analytics
- **Reports module** - Comprehensive analytics and insights (when enabled)
- **My Stats** - Personal performance dashboard with points, tasks completed, effort, and achievements
- **Leaderboard** - Team rankings based on performance metrics (when gamification enabled)
- **Burndown charts** - Track planned vs actual task completion over time
- **Team Performance** - Team-wide activity metrics and productivity analysis
- **Task List Report** - Detailed task listings with filtering and export capabilities

### Admin Features
- **User management** - Create, edit, invite, activate/deactivate users, assign roles
- **Board & column management** - Create, rename, reorder, and delete boards and columns
- **Site settings** - Configure site name, URL, and global preferences
- **SSO configuration** - Google OAuth Single Sign-On setup
- **Mail server** - SMTP configuration for email notifications and invitations
- **Tags management** - Create and manage custom tags with colors
- **Priorities management** - Customize priority levels with names and colors
- **App settings** - Configure default language, view modes, and application behavior
- **Project settings** - Manage project identifiers and board configurations
- **Sprint settings** - Create and manage sprints for time-based task organization
- **Reporting configuration** - Enable/disable reports, gamification, leaderboard, and achievements
- **Licensing** - View and manage license information, usage limits, and subscriptions
- **System monitoring** - Real-time resource monitoring (RAM, CPU, disk usage)

### Data & Export
- **Export functionality** - Export tasks to CSV or Excel format (admin only)
- **Excel export** - Multi-sheet Excel files with proper formatting when exporting all boards
- **File uploads** - Task attachments and user avatars with size and type restrictions

### Additional Features
- **Email notifications** - Configurable email notifications for task activities
- **Gamification** - Points, achievements, and leaderboard (when enabled)
- **Keyboard shortcuts** - F1 for help, efficient keyboard navigation
- **Column persistence** - Column preferences saved between sessions
- **Multi-level sorting** - Sort by multiple columns in List View

## Getting Started

**Default Admin Account:**
- Email: `admin@kanban.local`
- Password: `generated` at initialization - look for it in the backend console log

1. Log in with the default admin account
2. Go to the admin panel and setup:
   1. The site name and URL in Site Settings
   2. In the App Settings, choose the default language (FR/EN)
   3. Review the Project Settings
   4. Add sprints in the Sprint Settings
   5. Review Reports Settings
4. Create team members in the Users Tab
5. Go to Kanban View and set up your boards and columns
6. Start creating and managing tasks
7. Configure Google OAuth (optional) in Admin > SSO settings

## Permissions

| Action | Admin | User |
|--------|-------|------|
| View kanban boards | ✓ | ✓ |
| View List and Gantt views | ✓ | ✓ |
| Create/edit/delete tasks | ✓ | ✓ |
| Add comments and attachments | ✓ | ✓ |
| Move tasks between columns | ✓ | ✓ |
| Associate tasks with sprints | ✓ | ✓ |
| Create/edit/delete boards | ✓ | ✗ |
| Reorder boards and columns | ✓ | ✗ |
| Manage columns (add/remove/reorder) | ✓ | ✗ |
| Access Admin panel | ✓ | ✗ |
| Manage users | ✓ | ✗ |
| Configure site settings | ✓ | ✗ |
| Configure Google OAuth | ✓ | ✗ |
| Configure mail server | ✓ | ✗ |
| Manage tags and priorities | ✓ | ✗ |
| Export data (CSV/Excel) | ✓ | ✗ |
| Access Reports (when enabled) | ✓ | ✓* |
| View Leaderboard (when enabled) | ✓ | ✓* |
| Update own profile | ✓ | ✓ |
| Configure own notifications | ✓ | ✓ |

*Some reports may be restricted to admins only depending on settings

## Requirements

- nodejs v 20.18

## Installation

### Docker

**Step 1: Clone and setup**
```bash
# Clone the repo
git clone https://github.com/drenlia/easy-kanban.git
cd easy-kanban
cp docker-compose-example.yml docker-compose.yml
```

**Step 2: Configure and run**
1. Edit `docker-compose.yml` and update the following environment variables:
   - `JWT_SECRET`: Set a strong secret key for authentication
   - `ALLOWED_ORIGINS`: Set your domain(s), e.g., `yourdomain.com`
   - `DEMO_ENABLED`: Set to `true` to try the demo with generated data, `false` for production

2. Start the application:
```bash
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

```bash
# Stop the application gracefully (keeps container running)
docker-compose stop

# Replace database
docker cp ./kanban-backup.db easy-kanban:/app/server/data/kanban.db

# Restart application
docker-compose start
```

**Important:** Always stop the application before restoring to prevent data corruption.

## Security

The application includes JWT-based authentication and role-based access control. However, for production deployments:

- Change the default admin password immediately
- Set a strong JWT secret in production
- Configure HTTPS/SSL
- Consider additional network security measures

## Authors and acknowledgment
Developped with AI assistance

## License

MIT License

Copyright (c) 2024 Easy Kanban

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Project status

Improvements are always welcome.


