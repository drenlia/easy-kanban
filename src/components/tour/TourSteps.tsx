import { Step } from 'react-joyride';

export interface TourStepsConfig {
  userSteps: Step[];
  adminSteps: Step[];
}

export const getTourSteps = (): TourStepsConfig => {
  const userSteps: Step[] = [
    {
      target: 'body', // Use body as fallback for testing
      content: 'Welcome to Easy Kanban! This is your main navigation area where you can switch between different boards.',
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour-id="board-tabs"]',
      content: 'These are your board tabs. Click on any tab to switch between different project boards.',
      placement: 'bottom',
      offset: 20,
      disableBeacon: false,
      spotlightClicks: false,
    },
    {
      target: '[data-tour-id="kanban-columns"]',
      content: 'This is your Kanban board! Tasks are organized in columns. You can drag and drop tasks between columns to update their status.',
      placement: 'top',
    },
    {
      target: '[data-tour-id="add-task-button"]',
      content: 'Click the "+" button on any column to add a new task. This is the main way to create new work items.',
      placement: 'top',
    },
    {
      target: '[data-tour-id="search-filter"]',
      content: 'Use the search and filter tools to find specific tasks. You can filter by assignee, tags, priority, and more.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="view-mode-toggle"]',
      content: 'Switch between different view modes: Kanban (default), List view, or Gantt chart to see your tasks in different ways.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="team-members"]',
      content: 'Filter tasks by team members. Click on member avatars to show only their tasks, or use the "All" button to see everyone.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="profile-menu"]',
      content: 'Click on your profile to access settings, view your profile, or logout.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="help-button"]',
      content: 'Need help? Click the help button (or press F1) anytime to open the help guide.',
      placement: 'bottom',
    },
  ];

  const adminSteps: Step[] = [
    // All user steps plus admin-specific ones
    ...userSteps,
    {
      target: '[data-tour-id="add-board-button"]',
      content: 'As an admin, you can create new boards by clicking this "+" button. Boards help organize different projects or teams.',
      placement: 'bottom',
      offset: 20,
    },
    {
      target: '[data-tour-id="admin-tab"]',
      content: '🚨 IMPORTANT: Click the Admin button to continue the tour! The next steps will show you admin features. If you click "Next" without clicking Admin, you\'ll miss important admin functionality.',
      placement: 'bottom',
      spotlightClicks: true,
      disableBeacon: false,
      offset: 20,
    },
    {
      target: '[data-tour-id="admin-users"]',
      content: 'In the admin panel, manage team members, create new users, and assign roles.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-boards"]',
      content: 'Create, rename, and delete boards. Organize your workspace with multiple project boards.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-columns"]',
      content: 'Customize your workflow by creating, renaming, and reordering columns. Set up your process stages.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-settings"]',
      content: 'Configure site settings, email server, SSO, and other system preferences.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-tags"]',
      content: 'Create and manage tags to categorize and organize your tasks effectively.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-priorities"]',
      content: 'Set up priority levels for your tasks to help team members understand urgency.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-app-settings"]',
      content: 'Configure application settings, user preferences, and system behavior in the App Settings tab.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-project-settings"]',
      content: 'Manage project-specific settings, workflows, and custom configurations in Project Settings.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="admin-licensing"]',
      content: 'View and manage your license information, usage limits, and subscription details.',
      placement: 'bottom',
    },
    {
      target: '[data-tour-id="system-usage-panel"]',
      content: 'This system usage panel shows real-time resource monitoring: RAM usage, CPU usage, and disk space. It helps you monitor your instance performance and resource consumption.',
      placement: 'left',
    },
  ];

  return {
    userSteps,
    adminSteps,
  };
};
