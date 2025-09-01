export interface TeamMember {
  id: string;
  name: string;
  color: string;
  user_id: string;
  avatarUrl?: string;
  authProvider?: 'local' | 'google';
  googleAvatarUrl?: string;
}

export type Priority = string; // Now dynamic from database

export interface PriorityOption {
  id: number;
  priority: string;
  color: string;
  position: number;
  created_at: string;
  initial?: boolean | number; // SQLite returns 0/1, but could be boolean
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}

export interface Comment {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  taskId: string;
  attachments: Attachment[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  columnId: string;
  memberId?: string;
  requesterId?: string;
  startDate: string;
  dueDate?: string;
  effort: number;
  priority: Priority;
  comments: Comment[];
  position?: number;
  boardId?: string;
  tags?: Tag[];
}

export interface Tag {
  id: number;
  tag: string;
  description?: string;
  color?: string;
  created_at: string;
}

export interface Column {
  id: string;
  title: string;
  tasks: Task[];
  boardId: string;
  position?: number;
}

export interface Columns {
  [key: string]: Column;
}

export interface Board {
  id: string;
  title: string;
  columns: Columns;
  position?: number;
}

export interface QueryLog {
  id: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE' | 'ERROR';
  query: string;
  timestamp: string;
  error?: string;
}

export interface DragPreview {
  targetColumnId: string;
  insertIndex: number;
}

export interface SearchFilters {
  text: string;
  dateFrom: string;
  dateTo: string;
  dueDateFrom: string;
  dueDateTo: string;
  selectedMembers: string[];
  selectedPriorities: string[];
  selectedTags: string[];
}

export interface UserPreferences {
  isTasksShrunk: boolean;
  isSearchActive: boolean;
  searchFilters: SearchFilters;
}

export interface SiteSettings {
  SITE_NAME: string;
  SITE_URL: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  avatarUrl?: string;
  authProvider?: 'local' | 'google';
  googleAvatarUrl?: string;
  displayName?: string;
}