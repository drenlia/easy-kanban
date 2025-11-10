// Application constants
export const DEFAULT_COLUMNS = [
  { id: 'todo', title: 'To Do' },
  { id: 'progress', title: 'In Progress' },
  { id: 'testing', title: 'Testing' },
  { id: 'completed', title: 'Completed' },
  { id: 'archive', title: 'Archive' }
];

// Page and navigation constants
export const PAGE_IDENTIFIERS = ['kanban', 'admin', 'reports', 'task', 'forgot-password', 'reset-password', 'reset-success', 'activate-account'];
export const ADMIN_TABS = ['users', 'site-settings', 'sso', 'mail-server', 'tags', 'priorities', 'app-settings', 'project-settings', 'sprint-settings', 'reporting', 'licensing', 'notification-queue'];
export const REPORT_TABS = ['stats', 'leaderboard', 'burndown', 'team', 'tasks'];

// Routing configuration
export const ROUTES = {
  // Pages that don't require authentication
  PUBLIC_PAGES: ['forgot-password', 'reset-password', 'reset-success', 'activate-account'],
  // Pages that require authentication
  PROTECTED_PAGES: ['kanban', 'admin', 'reports', 'task'],
  // Pages that should skip auto-board-selection
  NO_AUTO_BOARD: ['forgot-password', 'reset-password', 'reset-success', 'activate-account', 'admin', 'reports', 'task'],
  // Default routes
  DEFAULT_PAGE: 'kanban',
  DEFAULT_ADMIN_TAB: 'users',
  DEFAULT_REPORT_TAB: 'burndown'
} as const;

// Default site settings
export const DEFAULT_SITE_SETTINGS = {
  SITE_NAME: 'Easy Kanban',
  SITE_URL: 'http://localhost:3000'
};

// Polling configuration
export const POLLING_INTERVAL = 15000; // 15 seconds (backup only, WebSocket handles real-time)
export const DRAG_COOLDOWN_DURATION = 5000; // 5 seconds
export const TASK_CREATION_PAUSE_DURATION = 3000; // 3 seconds - increased to prevent race conditions
export const BOARD_CREATION_PAUSE_DURATION = 1000; // 1 second

// JWT configuration
export const JWT_EXPIRES_IN = '24h';

// Drag and drop configuration
export const DND_ACTIVATION_DISTANCE = 3; // 3px for responsive drag start

// Grid layout configuration
export const MAX_GRID_COLUMNS = 6;
export const MIN_COLUMN_WIDTH = 300; // pixels
export const GRID_GAP = '1.5rem';
