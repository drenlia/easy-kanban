# Easy-Kanban Application Documentation

## Table of Contents

1. [Application Overview](#application-overview)
2. [Getting Started](#getting-started)
3. [Header & Navigation](#header--navigation)
4. [Tools Panel](#tools-panel)
5. [Board Management](#board-management)
6. [Views](#views)
   - [Kanban View](#kanban-view)
   - [List View](#list-view)
   - [Gantt View](#gantt-view)
7. [Task Management](#task-management)
8. [User Profile & Settings](#user-profile--settings)
9. [Admin Section](#admin-section-admin-only)
10. [Advanced Features](#advanced-features)
11. [Keyboard Shortcuts](#keyboard-shortcuts)
12. [Troubleshooting](#troubleshooting)

---

## Application Overview

Easy-Kanban is a comprehensive project management platform that combines Kanban boards, Gantt charts, and list views for complete project visibility. It features real-time collaboration, advanced task management, and team coordination tools.

**Platform:** PostgreSQL-backed (single-tenant Docker or multi-tenant Kubernetes). Real-time updates use PostgreSQL `LISTEN/NOTIFY` with Socket.IO (Redis adapter for multi-pod deployments).

### Key Features
- **Multi-board Kanban system** with drag-and-drop functionality
- **Real-time collaboration** - see changes instantly as team members work
- **User authentication** with local accounts and Google OAuth support
- **Role-based access control** (Admin/User permissions)
- **Team management** with color-coded member assignments
- **Task management** with priorities, comments, and file attachments
- **Admin panel** for user management and system configuration
- **File uploads** for task attachments and user avatars
- **Site branding** - custom logo (light/dark), optional hide logo / GitHub link

### User Roles
- **Admin**: Full access to all features including user management and system configuration
- **User**: Access to boards, tasks, and collaboration features (no admin privileges)

---

## Getting Started

### Authentication & Demo Mode

#### Demo Mode (Recommended for Testing)
When running in **demo mode**, the application provides pre-configured accounts with randomly generated passwords:

**Admin Account:**
- **Email**: `admin@kanban.local`
- **Password**: Randomly generated (displayed on login page)

**Demo User Account:**
- **Email**: `demo@kanban.local` 
- **Password**: Randomly generated (displayed on login page)

The demo credentials are automatically displayed on the login page when demo mode is enabled. You can copy the credentials using the copy buttons next to each field.

#### Production Mode
In production mode, you'll need to create your own user accounts through the admin panel after initial setup.

### Initial Setup
1. **Demo Mode**: Use the credentials displayed on the login page
2. **Production Mode**: Create your first admin account through the setup process
3. Create team members in the Admin panel
4. Set up your boards and columns
5. Start creating and managing tasks
6. Configure Google OAuth (optional) in Admin > SSO settings
7. Configure branding (optional) in Admin > Site Settings (logo, site name)

---

## Header & Navigation

[Screenshot: Header with all buttons visible]

The sticky header contains branding, sprint context, app navigation, and utilities.

### Left Side
- **Site brand**: Logo and/or site name (from Admin → Site Settings). Click to follow the configured site URL.
  - Default logo is `/kanban.ico` when no custom logo is set
  - Empty site name hides the text (no fallback to “Easy Kanban”)
  - **Hide Site Logo** (admin setting) removes the logo entirely
- **Sprint selector** (Kanban page): Filter by sprint or backlog
- **Demo countdown** (when demo mode is enabled)

### Right Side (left → right)

1. **App navigation**: Kanban · Reports (if enabled) · Admin (admins)
2. **Invite** (admins): Invite a user by email
3. **Preferences**: Theme (light/dark) · Language (EN/FR)
4. **Utilities**: Refresh · System panel toggle (admins) · Help (also F1)
5. **GitHub** link (opens in a new tab; can be hidden in Site Settings)
6. **User avatar** (always last): Profile · Logout

---

## Tools Panel

The **Tools** card on the Kanban page controls board layout and card density.

- **Board view** (dropdown): Kanban · List · Gantt — same icon size as the toolbar button; short labels in the menu, full description on hover
- **Search**: Toggle advanced search/filters
- **Card density** (dropdown): Expand · Shrink · Compact
  - **Compact** (tickets only) hides descriptions on cards and shows a **red dot** on the density button as a reminder
  - Tooltips describe the current mode (including that compact hides descriptions)

---

## Board Management

[Screenshot: Board tabs and board creation interface]

### Creating Boards (Admin Only)
1. Click the `+` button in the board tabs area
2. Enter board name and description
3. Click "Create Board" to confirm

### Board Operations (Admin Only)
- **Edit Board**: Double-click on board tab → "Edit Board"
- **Delete Board**: Click x on board tab
- **Reorder Boards**: Drag and drop board tabs to reorder using handle

### Board Settings
- **Board Title**: Displayed in the tab
- **Column Management**: Add, edit, delete, and reorder columns
- **Task Management**: Create, edit, delete, and move tasks

---

## Views

The application offers three different views for managing tasks (switch via the Tools panel):

### Kanban View

[Screenshot: Kanban board with columns and tasks]

The Kanban view displays tasks as cards in columns, representing different stages of work.

#### Column Management
- **Column Headers**: Show column name and task count
- **Add Column Button** (Admin Only): `+` button at the end of columns
- **Column Settings** (Admin Only): click column header for options:
  - Edit column name
  - Mark as "Finished" (completed tasks)
  - Mark as "Archived" (archived tasks)
  - Delete column

#### Task Cards
- **Task Title**: Click to open task details
- **Task Description**: Shown in expand/shrink modes (hidden in compact)
- **Priority Indicator**: Color-coded priority level
- **Assignee**: User avatar and name
- **Tags**: Color-coded tags
- **Dates**: Start and due date
- **Watchers / collaborators / attachments**: Reflected on the card; side-panel edits update the board in real time

#### Drag & Drop Operations
- **Move Tasks**: Drag task cards between columns
- **Reorder Tasks**: Drag tasks within the same column
- **Move Columns** (Admin Only): Drag column headers to reorder

#### Task Creation
- **Quick Add**: Click `+` button in any column to create a new task
- **Task Form**: Enter title, description, assignee, priority, due date, and tags

### List View

[Screenshot: List view with table format]

The List view displays tasks in a table format for detailed data management.

#### Table Columns
- **Row Number**: Sequential numbering
- **Actions**: View, Copy, Delete buttons (appear on hover)
- **Task Title**: Click to open task details
- **Assignee**: User avatar and name
- **Priority**: Color-coded priority level
- **Tags**: Color-coded tags
- **Start Date**: Task start date
- **Due Date**: Task due date
- **Status**: Current column/status
- **Time**: Time since last update

#### Inline Editing
- **Assignee**: Click to change assignee via dropdown
- **Priority**: Click to change priority via dropdown
- **Status**: Click to change status/column via dropdown
- **Dates**: Click to edit start and due dates

#### Sorting & Filtering
- **Column Headers**: Click to sort by that column
- **Search**: Use the search bar to filter tasks
- **Advanced Filters**: Use the filter panel for detailed filtering

### Gantt View

[Screenshot: Gantt chart with timeline and task bars]

The Gantt view displays tasks on a timeline showing project schedules and dependencies.

#### Timeline Features
- **Date Range**: Horizontal timeline showing days, weeks, months
- **Task Bars**: Horizontal bars representing task duration
- **Dependencies**: Arrows showing task relationships
- **Milestones**: Special markers for important dates

#### Task Management
- **Create Tasks**: Click on timeline to create new tasks
- **Edit Tasks**: Click on task bars to edit
- **Move Tasks**: Drag task bars to change dates
- **Resize Tasks**: Drag ends of task bars to change duration

#### View Modes (Tools → card density)
- **Expand**: Full task details with titles
- **Shrink**: Reduced height with titles
- **Compact**: Minimal height, titles/descriptions minimized

#### Navigation
- **Scroll**: Horizontal scrolling through timeline
- **Jump to Task**: Navigate to specific dates
- **Today Button**: Jump to current date
- **Later Button**: Jump to the next timeline
- **Earlier Button**: Jump to the previous timeline
- **&gt; Button**: Jump to the latest task on the board horizontally
- **&lt; Button**: Jump to earliest task on the board horizontally

#### Dependencies
- **Create Links**: Connect tasks to show relationships
- **Parent-Child**: Hierarchical task relationships

---

## Task Management

### Creating Tasks
1. **Kanban View**: Click `+` button in any column
2. **List View**: There are no "Add Task" buttons.. Use other views to create them
3. **Gantt View**: Click on timeline at desired date

### Task Details Page

[Screenshot: Task details page with all sections]

When you click on a task, the Task Details page opens with comprehensive task management.

#### Task Information
- **Title**: Task name (editable)
- **Description**: Rich text description (editable)
- **Assignee**: Assigned team member (dropdown)
- **Priority**: Priority level (dropdown)
- **Tags**: Assigned tags (add/remove)
- **Dates**: Start date and due date (date pickers)
- **Effort**: Estimated effort (type freely; commits on blur)

#### Comments Section
- **Add Comments**: Rich text editor for comments
- **Comment History**: Chronological list of all comments
- **File Attachments**: Attach files to comments
- **Mention Users**: @username to notify team members

#### Task Actions
- **Save Changes**: Save all modifications
- **Delete Task**: Remove task permanently
- **Copy Task**: Duplicate task
- **Link Tasks**: Create relationships with other tasks

#### Task Linking
- **Parent Tasks**: Tasks that depend on this one
- **Child Tasks**: Tasks that this one depends on
- **Dependency Arrows**: Visual representation of relationships

Side-panel edits (description, watchers, collaborators, attachments, effort, etc.) update the board card without requiring a full page reload when real-time updates are connected.

---

## User Profile & Settings

[Screenshot: User profile modal]

### Profile Management
- **Display Name**: Your name as shown to other users
- **Avatar**: Upload profile picture

### Preferences
- **Theme**: Light/Dark mode preference is auto-saved
- **Language**: English / French (header toggle)
- **Activity Feed**: Enable/disable activity notifications
- **Default View**: Preferred view mode (Kanban/List/Gantt) is auto-saved

### Account Settings
- **Change Password**: Use the forgot password link at login
- **Account Deletion**: Delete your account

---

## Admin Section (Admin Only)

[Screenshot: Admin panel interface]

The Admin section provides comprehensive system management capabilities.

### User Management

[Screenshot: Admin users tab]

#### User List
- **All Users**: Complete list of system users
- **User Details**: Name, email, role, status
- **Account Status**: Active, inactive, pending
- **Last Login**: When user last accessed system

#### User Operations
- **Create User**: Add new team members
- **Edit User**: Modify user details and permissions
- **Delete User**: Remove user accounts
- **Reset Password**: Generate new passwords
- **Activate/Deactivate**: Control user access

#### User Creation Form
- **Name**: User's full name
- **Email**: Email address (must be unique)
- **Role**: Admin or User
- **Send Invitation**: Email invitation to new user
- **Temporary Password**: Auto-generated password

### Site Settings

[Screenshot: Admin site settings tab]

#### General
- **Site Name**: Shown in the header (leave blank to hide the name; does not fall back to “Easy Kanban”)
- **Site URL**: Destination when clicking the brand in the header
- **Website URL**: Customer portal URL (read-only; set at instance purchase)
- **Open Links in New Tab**: Global link behavior in rich text

#### Branding
- **Site Logo**: Upload an image or paste a URL (light mode). Empty → default `/kanban.ico`
- **Site Logo (Dark Mode)**: Optional; falls back to light logo, then default
- **Hide Site Logo**: When enabled, no logo is shown (including the default). Missing setting = logo visible
- **Hide GitHub Link**: When enabled, hides the header GitHub icon. Missing setting = link visible

### SSO Configuration (Admin Only)

[Screenshot: Google OAuth setup]

#### Google OAuth Setup
- **Client ID**: Google OAuth client ID
- **Client Secret**: Google OAuth client secret
- **Callback URL**: OAuth redirect URL

#### OAuth Features
- **Single Sign-On**: Login with Google account
- **Account Linking**: Link Google to existing accounts
- **Profile Sync**: Sync Google profile information
- **Avatar Import**: Use Google profile picture

### Mail Server Settings (Admin Only)

[Screenshot: Mail server configuration]

#### SMTP Configuration
- **Server**: SMTP server address
- **Port**: SMTP port number
- **Security**: SSL/TLS encryption
- **Authentication**: Username and password
- **From Address**: Sender email address

#### Email Features
- **User Invitations**: Send account invitations
- **Password Resets**: Email password reset links
- **Notifications**: Task and system notifications
- **Test Email**: Send test email to verify setup

### Priorities Management (Admin Only)

[Screenshot: Priorities management interface]

#### Priority Levels
- **Create Priority**: Add new priority levels
- **Edit Priority**: Modify existing priorities
- **Delete Priority**: Remove priority levels
- **Reorder Priorities**: Change priority order
- **Color Coding**: Assign colors to priorities

#### Priority Properties
- **Name**: Priority level name
- **Description**: Priority description
- **Color**: Visual color indicator
- **Order**: Priority sequence
- **Default**: Set default priority

### Tags Management (Admin Only)

[Screenshot: Tags management interface]

#### Tag System
- **Create Tags**: Add new tags
- **Edit Tags**: Modify existing tags
- **Delete Tags**: Remove tags
- **Tag Categories**: Organize tags by category
- **Color Coding**: Assign colors to tags

#### Tag Properties
- **Name**: Tag name
- **Description**: Tag description
- **Color**: Visual color indicator
- **Category**: Tag grouping
- **Usage Count**: How many tasks use this tag

---

## Advanced Features

### Filtering System

[Screenshot: Advanced filter interface]

#### Filter Types
- **Text Search**: Search in task titles and descriptions
- **Date Range**: Filter by start date, due date, or creation date
- **Member Filter**: Filter by assigned team members
- **Priority Filter**: Filter by priority levels
- **Tag Filter**: Filter by assigned tags
- **Project Filter**: Filter by project/board
- **Status Filter**: Filter by task status/column
- **Sprint Filter**: Filter by sprint or backlog

#### Saved Filters
- **Save Filter**: Save frequently used filter combinations
- **Load Filter**: Apply saved filter configurations
- **Share Filters**: Share filter views with team members
- **Default Filters**: Set default filter for each board

#### Filter Operations
- **Combine Filters**: Use multiple filters simultaneously
- **Clear Filters**: Reset all active filters
- **Filter History**: Recent filter combinations
- **Export Filters**: Export filter configurations

### Archive Functionality

[Screenshot: Archive column and archived tasks]

#### Archive Column
- **Archive Tasks**: Move completed tasks to archive
- **Archive Column**: Special column for archived tasks
- **Archive Settings**: Configure archive behavior

#### Archived Tasks
- **View Archived**: Browse archived tasks
- **Restore Tasks**: Move tasks back to active columns

### Completed Tasks

[Screenshot: Completed column and finished tasks]

#### Completion Tracking
- **Finished Column**: Special column for completed tasks
- **Completion Status**: Mark tasks as finished

### Real-Time Collaboration

[Screenshot: Real-time updates and collaboration features]

#### Live Updates
- **WebSocket Connection**: Real-time data synchronization across clients
- **PostgreSQL NOTIFY**: Server events fan out to connected pods/clients
- **Instant Updates**: Board cards and panels update as others edit (including side-panel changes)
- **Conflict Resolution**: Handle simultaneous edits

---

## Keyboard Shortcuts

### Global Shortcuts
- **F1**: Open help modal
- **Escape**: Close modals, exit edit modes
- **Enter**: Confirm actions, save changes

### Gantt View
- **Escape**: Exit relationship mode, exit multi-select mode
- **Enter**: Exit relationship mode, exit multi-select mode
- **Arrow Keys**: Move task selection (in multi-select mode)

### Text Editor
- **Escape**: Cancel editing
- **Enter**: Save changes
- **Ctrl/Cmd + Arrow Keys**: Normal text navigation
- **Backspace/Delete**: Delete text (respects image deletion settings)

### Task Management
- **Click**: Select task
- **Drag**: Move tasks between columns using the handle

---

## Troubleshooting

### Common Issues

#### WebSocket Connection Problems
- **Symptoms**: No real-time updates, manual refresh needed
- **Solution**: Use the refresh button to force data sync
- **Prevention**: Check internet connection and browser compatibility; in multi-pod K8s, ensure Redis is healthy for the Socket.IO adapter

#### Task Not Updating on the Board
- **Symptoms**: Side-panel edits save but the card looks unchanged
- **Solution**: Confirm you are not in **compact** card density (red dot on Tools); switch to expand/shrink to see descriptions. Use refresh if the WebSocket disconnected
- **Prevention**: Keep Tools density on expand/shrink when reviewing descriptions

#### Permission Errors
- **Symptoms**: Cannot perform certain actions
- **Solution**: Check user role and permissions
- **Prevention**: Ensure proper user role assignment

#### Performance Test Overlay (admin troubleshooting)
- **Enable**: Admin → Site Settings → **Performance Test Overlay** (`FE_PERF_TESTS`), or `PUT /api/admin/settings` with `{ "key": "FE_PERF_TESTS", "value": "true" }`
- **Use**: On the Kanban board as an admin, open the floating **PERF TESTS** panel — Generate tasks, Move tasks (0.5–2s random moves), Cleanup, and report modals (last run / session history)
- **Disable**: Turn the same setting off when finished so the overlay does not mount
- **Multi-user load**: Open multiple browsers/accounts with the flag enabled; each tab runs its own client-driven scenarios

#### Performance Issues
- **Symptoms**: Slow loading, laggy interface
- **Solution**: Clear browser cache, check internet connection
- **Prevention**: Regular browser maintenance, stable internet

### Getting Help
- **Help Modal**: Press F1 or click help button
- **Documentation**: This comprehensive guide
- **Support**: Contact system administrator
- **GitHub**: Project repository link in the header (unless hidden by admin)

---

*This documentation covers the current Easy-Kanban application (PostgreSQL edition). For deployment and operations details, see README.md and DOCKER.md.*
