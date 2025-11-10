# Email Notification Events - Complete List

This document lists all email notification events currently supported and sent to users via email.

## Task-Related Notifications

### 1. **newTaskAssigned**
- **Trigger**: When a task is created (`create_task` action) and assigned to a user
- **Recipients**: The assigned user (if different from the creator)
- **User Preference Key**: `newTaskAssigned`
- **Description**: Notifies a user when they are assigned to a new task created by someone else

### 2. **myTaskUpdated**
- **Trigger**: When a task is updated (`update_task` action) and the task is assigned to a user
- **Recipients**: The assigned user (if different from the person making the change)
- **User Preference Key**: `myTaskUpdated`
- **Description**: Notifies a user when their assigned task is updated by someone else
- **Includes**: Change details showing what was modified (old value → new value)

### 3. **watchedTaskUpdated**
- **Trigger**: When a task is updated (`update_task` action) and the user is watching the task
- **Recipients**: All watchers of the task (except the person making the change)
- **User Preference Key**: `watchedTaskUpdated`
- **Description**: Notifies users who are watching a task when it's updated
- **Includes**: Change details showing what was modified

### 4. **addedAsCollaborator**
- **Trigger**: When a user is added as a collaborator to a task (handled as `update_task` action)
- **Recipients**: The user being added as a collaborator
- **User Preference Key**: `addedAsCollaborator`
- **Description**: Notifies a user when they are added as a collaborator to a task

### 5. **collaboratingTaskUpdated**
- **Trigger**: When a task is updated (`update_task` action) and the user is a collaborator
- **Recipients**: All collaborators of the task (except the person making the change)
- **User Preference Key**: `collaboratingTaskUpdated`
- **Description**: Notifies users who are collaborating on a task when it's updated
- **Includes**: Change details showing what was modified

### 6. **requesterTaskCreated**
- **Trigger**: When a task is created (`create_task` action) and the user is the requester
- **Recipients**: The requester (if different from the creator)
- **User Preference Key**: `requesterTaskCreated`
- **Description**: Notifies a user when a task they requested is created

### 7. **requesterTaskUpdated**
- **Trigger**: When a task is updated (`update_task` action) and the user is the requester
- **Recipients**: The requester (if different from the person making the change)
- **User Preference Key**: `requesterTaskUpdated`
- **Description**: Notifies a user when a task they requested is updated
- **Includes**: Change details showing what was modified

## Comment Notifications

### 8. **commentAdded**
- **Trigger**: When a comment is added to a task (`create_comment` action)
- **Recipients**: 
  - Task assignee (if different from commenter)
  - Task requester (if different from commenter)
  - All watchers (except the commenter)
  - All collaborators (except the commenter)
- **User Preference Key**: `commentAdded`
- **Description**: Notifies all involved users when a comment is added to a task
- **Includes**: The comment content in the email

## User Management Notifications

### 9. **user_invite**
- **Trigger**: When an admin creates a new local user account and the user is inactive
- **Recipients**: The newly created user
- **User Preference Key**: N/A (system notification, not user-configurable)
- **Description**: Invitation email sent to new users to activate their account
- **Includes**: Activation link with token, account details (email, name)

## Password Reset Notifications

### 10. **password_reset**
- **Trigger**: When a user requests a password reset
- **Recipients**: The user requesting the reset
- **User Preference Key**: N/A (system notification, not user-configurable)
- **Description**: Password reset email with reset link
- **Includes**: Reset link with token, expiration information

## Notification Features

### Throttling
- All task-related notifications are throttled (default: 30 minutes delay)
- Multiple changes to the same task within the delay period are consolidated into a single email
- Comment notifications are sent immediately (not throttled)

### User Preferences
- Users can enable/disable each notification type (except system notifications like invitations and password resets)
- Global defaults are set in `NOTIFICATION_DEFAULTS` setting
- User-specific preferences override global defaults
- Preferences are stored in `user_settings` table

### Notification Types That Support User Preferences
1. `newTaskAssigned`
2. `myTaskUpdated`
3. `watchedTaskUpdated`
4. `addedAsCollaborator`
5. `collaboratingTaskUpdated`
6. `commentAdded`
7. `requesterTaskCreated`
8. `requesterTaskUpdated`

### System Notifications (No User Preferences)
- `user_invite` - Always sent when applicable
- `password_reset` - Always sent when requested

## Action Types That Trigger Notifications

### Task Actions
- `create_task` → Triggers: `newTaskAssigned`, `requesterTaskCreated`
- `update_task` → Triggers: `myTaskUpdated`, `watchedTaskUpdated`, `collaboratingTaskUpdated`, `requesterTaskUpdated`
- `associate_tag` → Treated as `update_task`
- `disassociate_tag` → Treated as `update_task`
- Other task actions → Treated as `update_task`

### Comment Actions
- `create_comment` → Triggers: `commentAdded`

## Email Template Types

The system uses different email template types:
- `task` → For task-related notifications (uses `taskNotification` template)
- `comment` → For comment notifications (uses `commentNotification` template)
- `user_invite` → For user invitations (uses `userInvite` template)
- `password_reset` → For password resets (uses `passwordReset` template)

## Notes

- All notifications respect user preferences (except system notifications)
- The actor (person making the change) never receives notifications for their own actions
- Notifications are deduplicated by email address per task
- Task URLs in emails include project ID and task ticket when available
- All email templates support internationalization (EN/FR)

