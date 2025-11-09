# Tour Steps Review

## Current Tour Steps

### User Steps (9 steps)
1. **Welcome** - Welcome message (body target)
2. **Board Tabs** - `data-tour-id="board-tabs"` - Switch between boards
3. **Kanban Columns** - `data-tour-id="kanban-columns"` - Drag and drop tasks
4. **Add Task Button** - `data-tour-id="add-task-button"` - Create new tasks
5. **Search Filter** - `data-tour-id="search-filter"` - Search and filter tools
6. **View Mode Toggle** - `data-tour-id="view-mode-toggle"` - Switch between Kanban, List, Gantt
7. **Team Members** - `data-tour-id="team-members"` - Filter by team members
8. **Profile Menu** - `data-tour-id="profile-menu"` - Access settings and logout
9. **Help Button** - `data-tour-id="help-button"` - Open help guide (F1)

### Admin Steps (12 additional steps)
10. **Add Board Button** - `data-tour-id="add-board-button"` - Create new boards (admin only)
11. **Admin Tab** - `data-tour-id="admin-tab"` - Access admin panel
12. **Admin Users** - `data-tour-id="admin-users"` - Manage team members
13. **Admin Boards** - `data-tour-id="admin-boards"` - Create/rename/delete boards
14. **Admin Columns** - `data-tour-id="admin-columns"` - Customize workflow columns
15. **Admin Settings** - `data-tour-id="admin-settings"` - Site settings, email, SSO
16. **Admin Tags** - `data-tour-id="admin-tags"` - Create and manage tags
17. **Admin Priorities** - `data-tour-id="admin-priorities"` - Set up priority levels
18. **Admin App Settings** - `data-tour-id="admin-app-settings"` - Application settings
19. **Admin Project Settings** - `data-tour-id="admin-project-settings"` - Project-specific settings
20. **Admin Licensing** - `data-tour-id="admin-licensing"` - License information
21. **System Usage Panel** - `data-tour-id="system-usage-panel"` - Resource monitoring

---

## Issues & Updates Needed

### 1. Content Updates Required

#### Team Members Step
- **Current**: Mentions "All" button
- **Issue**: Button is now called "Clear" (or "Effacer" in French)
- **Status**: ✅ **FIXED** - Will update translation to reflect "Clear" button functionality

---

## Missing Tour Steps - Implementation Plan

### ✅ To Implement

#### Header/Utility Features
1. **Sprint Selector** - `data-tour-id="sprint-selector"`
   - Location: Header (next to board tabs, only visible in Kanban view)
   - Purpose: Filter tasks by sprint (All Sprints, Backlog, or specific sprint)
   - Status: ✅ **TO IMPLEMENT**

2. **Theme Toggle** - `data-tour-id="theme-toggle"`
   - Location: Header (right side)
   - Purpose: Switch between light and dark mode
   - Status: ✅ **TO IMPLEMENT**

#### Admin-Only Features
3. **Invite User Button** - `data-tour-id="invite-user-button"`
   - Location: Header (right side, admin only)
   - Purpose: Invite new users via email
   - Status: ✅ **TO IMPLEMENT** (Admin only, skip if not admin)

4. **Reports Button/Page** - `data-tour-id="reports-button"`
   - Location: Header navigation (if reports enabled)
   - Purpose: Access reports section
   - Status: ✅ **TO IMPLEMENT** (For everyone if enabled, skip if not enabled)

#### Kanban View Features
5. **Task Card Toolbar** - `data-tour-id="task-card-toolbar"`
   - Location: Task cards (visible on hover)
   - Purpose: Quick actions (edit, assign, priority, etc.)
   - Status: ✅ **TO IMPLEMENT**

6. **Task Quick Edit** - `data-tour-id="task-quick-edit"`
   - Location: Task cards (pen icon)
   - Purpose: Quick inline editing
   - Status: ✅ **TO IMPLEMENT**

7. **Sprint Association** - `data-tour-id="sprint-association"`
   - Location: Task cards (calendar icon)
   - Purpose: Associate tasks with sprints
   - Status: ✅ **TO IMPLEMENT**

#### List View Features
8. **Export Menu** - `data-tour-id="export-menu"`
   - Location: List View header (next to column management)
   - Purpose: Export tasks to CSV/XLSX
   - Status: ✅ **TO IMPLEMENT** (Admin only, requires switching to List View)
   - Note: User needs to switch to List View during tour

9. **Column Visibility** - `data-tour-id="column-visibility"`
   - Location: List View header
   - Purpose: Show/hide columns
   - Status: ✅ **TO IMPLEMENT** (Requires switching to List View)
   - Note: User needs to switch to List View during tour

#### Admin Panel Tabs
10. **Admin SSO Tab** - `data-tour-id="admin-sso"`
    - Status: ✅ **TO IMPLEMENT** (Add in correct order in admin steps)

11. **Admin Mail Server Tab** - `data-tour-id="admin-mail-server"`
    - Status: ✅ **TO IMPLEMENT** (Add in correct order in admin steps)

12. **Admin Sprint Settings Tab** - `data-tour-id="admin-sprint-settings"`
    - Status: ✅ **TO IMPLEMENT** (Add in correct order in admin steps)

13. **Admin Reporting Tab** - `data-tour-id="admin-reporting"`
    - Status: ✅ **TO IMPLEMENT** (Add in correct order in admin steps)

### ❌ Skipped (Per User Request)
- Search Filter step update (advanced filters)
- View Mode Toggle step update (view explanations)
- Activity Feed Button
- Refresh Button
- Language Toggle
- Gantt View explanation

---

## Summary

### Total Current Steps
- **User Steps**: 9
- **Admin Steps**: 12 additional (21 total for admins)

### Steps Needing Updates
- 3 steps need content updates (Team Members, Search Filter, View Mode Toggle)

### Missing Steps
- **Header/Utility**: 5 steps (Sprint Selector, Activity Feed, Theme Toggle, Refresh, Language Toggle)
- **Admin Header**: 1 step (Invite User)
- **Reports**: 1+ steps (Reports button + report types if enabled)
- **List View**: 2 steps (Export Menu, Column Visibility)
- **Kanban View**: 3 explanations (Task Toolbar, Quick Edit, Sprint Association)
- **Gantt View**: 1 step (dedicated explanation)
- **Admin Tabs**: 4 steps (SSO, Mail Server, Sprint Settings, Reporting)

### Total Missing Steps
- **Minimum**: 17 new steps
- **With Reports**: 18+ steps (depending on enabled report types)

---

## Recommendations

### Priority 1 (Critical - Core Features)
1. Sprint Selector - Key feature for sprint management
2. Activity Feed - Major collaboration feature
3. Export Menu - Important List View feature
4. Invite User Button - Key admin onboarding feature
5. Admin Sprint Settings Tab - Major admin feature

### Priority 2 (Important - User Experience)
6. Theme Toggle - User preference
7. Refresh Button - Utility feature
8. Language Toggle - Internationalization
9. Task Card Toolbar - Task interaction
10. Admin SSO Tab - Admin configuration
11. Admin Mail Server Tab - Admin configuration

### Priority 3 (Nice to Have)
12. Column Visibility - List View feature
13. Gantt View explanation - View type
14. Admin Reporting Tab - Admin configuration
15. Reports page steps - If reports enabled

### Implementation Notes
- All missing steps need `data-tour-id` attributes added to components
- Translation keys need to be added to `en/common.json` and `fr/common.json`
- Some steps may need conditional logic (e.g., Reports only if enabled)
- Consider grouping related steps (e.g., all header utilities together)

