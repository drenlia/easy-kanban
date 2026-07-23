/**
 * Application-wide constants
 */

// System user member ID - used to identify system-generated tasks and members
export const SYSTEM_MEMBER_ID = '00000000-0000-0000-0000-000000000001';

// AI Agent pseudo-member (assignable when AI_ENABLED); mirrors SYSTEM fixed UUIDs
export const AGENT_USER_ID = '00000000-0000-0000-0000-000000000010';
export const AGENT_MEMBER_ID = '00000000-0000-0000-0000-000000000011';

/** task_work.status values for agent automation */
export const AGENT_WORK_STATUSES = {
  queued: 'queued',
  running: 'running',
  paused: 'paused',
  waiting: 'waiting',
  stopped: 'stopped',
  done: 'done',
  failed: 'failed'
} as const;

export type AgentWorkStatus = (typeof AGENT_WORK_STATUSES)[keyof typeof AGENT_WORK_STATUSES];

/** Statuses that show spinner / disable drag on the card (active work) */
export const AGENT_ACTIVE_WORK_STATUSES: readonly AgentWorkStatus[] = [
  'queued',
  'running',
  'paused',
  'waiting'
];

/** Statuses where the card should not be dragged (in-flight agent work) */
export const AGENT_DRAG_BLOCKING_STATUSES: readonly AgentWorkStatus[] = [
  'queued',
  'running',
  'paused',
  'waiting'
];

/** Statuses that can be resumed / restarted from the card menu */
export const AGENT_RESUMABLE_STATUSES: readonly AgentWorkStatus[] = [
  'paused',
  'waiting',
  'stopped',
  'failed',
  'done'
];

// WebSocket throttle duration in milliseconds
// Throttles to max 20 updates per second for better performance
export const WEBSOCKET_THROTTLE_MS = 50;

