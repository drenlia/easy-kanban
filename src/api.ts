import axios from 'axios';
import { TeamMember, Board, Task, Column, Comment } from './types';

const api = axios.create({
  baseURL: '/api'
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('authToken');
      // Don't redirect - let the component handle the auth error
      // This prevents the login loop issue
    }
    return Promise.reject(error);
  }
);

// Members
export const getMembers = async (includeSystem?: boolean) => {
  const params = includeSystem ? { includeSystem: 'true' } : {};
  const { data } = await api.get<TeamMember[]>('/members', { params });
  return data;
};

export const createMember = async (member: TeamMember) => {
  const { data } = await api.post<TeamMember>('/members', member);
  return data;
};

export const deleteMember = async (id: string) => {
  const { data } = await api.delete(`/members/${id}`);
  return data;
};

// Boards
export const getBoards = async () => {
  const { data } = await api.get<Board[]>('/boards');
  return data;
};

// Get columns for a specific board
export const getBoardColumns = async (boardId: string) => {
  const { data } = await api.get<{id: string, title: string, boardId: string, position: number}[]>(`/boards/${boardId}/columns`);
  return data;
};

export const createBoard = async (board: Board) => {
  const { data } = await api.post<Board>('/boards', board);
  return data;
};

export const updateBoard = async (id: string, title: string) => {
  const { data } = await api.put<Board>(`/boards/${id}`, { title });
  return data;
};

export const deleteBoard = async (id: string) => {
  const { data } = await api.delete(`/boards/${id}`);
  return data;
};

export const reorderBoards = async (boardId: string, newPosition: number) => {
  const { data } = await api.post('/boards/reorder', { boardId, newPosition });
  return data;
};

// Columns
export const createColumn = async (column: Column) => {
  const { data } = await api.post<Column>('/columns', column);
  return data;
};

export const updateColumn = async (id: string, title: string) => {
  const { data } = await api.put<Column>(`/columns/${id}`, { title });
  return data;
};

export const deleteColumn = async (id: string) => {
  const { data } = await api.delete(`/columns/${id}`);
  return data;
};

export const reorderColumns = async (columnId: string, newPosition: number, boardId: string) => {
  const { data } = await api.post('/columns/reorder', { columnId, newPosition, boardId });
  return data;
};

// Move task to different board
export const moveTaskToBoard = async (taskId: string, targetBoardId: string) => {
  const { data } = await api.post('/tasks/move-to-board', { taskId, targetBoardId });
  return data;
};

export const reorderTasks = async (taskId: string, newPosition: number, columnId: string) => {
  const { data } = await api.post('/tasks/reorder', { taskId, newPosition, columnId });
  return data;
};

export const createTaskAtTop = async (task: Task) => {
  const { data } = await api.post<Task>('/tasks/add-at-top', task);
  return data;
};

// Tasks
export const getTaskById = async (id: string) => {
  const { data } = await api.get<Task>(`/tasks/${id}`);
  return data;
};

export const createTask = async (task: Task) => {
  const { data } = await api.post<Task>('/tasks', task);
  return data;
};

export const updateTask = async (task: Task) => {
  const { data } = await api.put<Task>(`/tasks/${task.id}`, task);
  return data;
};

export const deleteTask = async (id: string) => {
  const { data } = await api.delete(`/tasks/${id}`);
  return data;
};

// Comments
export const createComment = async (comment: Comment & { 
  taskId: string; 
  attachments?: Array<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }> 
}) => {
  const { data } = await api.post<Comment>('/comments', comment);
  return data;
};

export const updateComment = async (id: string, text: string) => {
  const { data } = await api.put(`/comments/${id}`, { text });
  return data;
};

export const deleteComment = async (id: string) => {
  const { data } = await api.delete(`/comments/${id}`);
  return data;
};

// Authentication
export const login = async (email: string, password: string) => {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
};

export const register = async (userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: string;
}) => {
  const { data } = await api.post('/auth/register', userData);
  return data;
};

export const getCurrentUser = async () => {
  const { data } = await api.get('/auth/me');
  return data;
};

// Debug
export const getQueryLogs = async () => {
  const { data } = await api.get('/debug/logs');
  return data;
};

// Add a new function to handle file uploads
export const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<{
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
  }>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
};

export const fetchCommentAttachments = async (commentId: string) => {
  const response = await fetch(`/api/comments/${commentId}/attachments`);
  if (!response.ok) {
    throw new Error('Failed to fetch comment attachments');
  }
  return response.json();
};

// Task Attachments API
export const fetchTaskAttachments = async (taskId: string) => {
  const { data } = await api.get(`/tasks/${taskId}/attachments`);
  return data;
};

export const addTaskAttachments = async (taskId: string, attachments: Array<{
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
}>) => {
  const { data } = await api.post(`/tasks/${taskId}/attachments`, { attachments });
  return data;
};

export const deleteAttachment = async (attachmentId: string) => {
  const { data } = await api.delete(`/attachments/${attachmentId}`);
  return data;
};

// Admin API
export const getUsers = async () => {
  const { data } = await api.get('/admin/users');
  return data;
};

export const createUser = async (userData: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  role: string;
}) => {
  const { data } = await api.post('/admin/users', {
    ...userData,
    baseUrl: window.location.origin // Send the current browser origin
  });
  return data;
};

export const updateUser = async (userId: string, userData: {
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
  displayName?: string; // Optional since it's handled separately
}) => {
  // Only send fields that the backend endpoint expects
  const { firstName, lastName, email, isActive } = userData;
  const { data } = await api.put(`/admin/users/${userId}`, { 
    firstName, 
    lastName, 
    email, 
    isActive 
  });
  return data;
};

export const updateUserRole = async (userId: string, action: 'promote' | 'demote') => {
  const { data } = await api.put(`/admin/users/${userId}/role`, { action });
  return data;
};

export const deleteUser = async (userId: string) => {
  const { data } = await api.delete(`/admin/users/${userId}`);
  return data;
};

export const resendUserInvitation = async (userId: string) => {
  const { data } = await api.post(`/admin/users/${userId}/resend-invitation`, {
    baseUrl: window.location.origin // Send the current browser origin
  });
  return data;
};


export const getUserTaskCount = async (userId: string) => {
  const { data } = await api.get(`/admin/users/${userId}/task-count`);
  return data;
};

export const updateMemberColor = async (userId: string, color: string) => {
  const { data } = await api.put(`/admin/users/${userId}/color`, { color });
  return data;
};

// Self-service account deletion
export const deleteAccount = async () => {
  const { data } = await api.delete('/users/account');
  return data;
};

export const getSettings = async () => {
  const { data } = await api.get('/admin/settings');
  return data;
};

export const getPublicSettings = async () => {
  const { data } = await api.get('/settings');
  return data;
};

// Activity Feed
export const getActivityFeed = async (limit: number = 20) => {
  const { data } = await api.get(`/activity/feed?limit=${limit}`);
  return data;
};

// User Settings
export const getUserSettings = async () => {
  const { data } = await api.get('/user/settings');
  return data;
};

export const updateUserSetting = async (setting_key: string, setting_value: any) => {
  const { data } = await api.put('/user/settings', { setting_key, setting_value });
  return data;
};

export const updateSetting = async (key: string, value: string) => {
  const { data } = await api.put('/admin/settings', { key, value });
  return data;
};

// Tags (public endpoint for all users)
export const getAllTags = async () => {
  const { data } = await api.get('/tags');
  return data;
};

// Tags management (admin only)
export const getTags = async () => {
  const { data } = await api.get('/admin/tags');
  return data;
};

export const createTag = async (tag: { tag: string; description?: string; color?: string }) => {
  const { data } = await api.post('/admin/tags', tag);
  return data;
};

export const updateTag = async (tagId: number, tag: { tag: string; description?: string; color?: string }) => {
  const { data } = await api.put(`/admin/tags/${tagId}`, tag);
  return data;
};

export const deleteTag = async (tagId: number) => {
  const { data } = await api.delete(`/admin/tags/${tagId}`);
  return data;
};

export const getTagUsage = async (tagId: number) => {
  const { data } = await api.get(`/admin/tags/${tagId}/usage`);
  return data;
};

// Task-Tag associations
export const getTaskTags = async (taskId: string) => {
  const { data } = await api.get(`/tasks/${taskId}/tags`);
  return data;
};

export const addTagToTask = async (taskId: string, tagId: number) => {
  const { data } = await api.post(`/tasks/${taskId}/tags/${tagId}`);
  return data;
};

export const removeTagFromTask = async (taskId: string, tagId: number) => {
  const { data } = await api.delete(`/tasks/${taskId}/tags/${tagId}`);
  return data;
};

// Task-Watchers associations
export const getTaskWatchers = async (taskId: string) => {
  const { data } = await api.get(`/tasks/${taskId}/watchers`);
  return data;
};

export const addWatcherToTask = async (taskId: string, memberId: string) => {
  const { data } = await api.post(`/tasks/${taskId}/watchers/${memberId}`);
  return data;
};

export const removeWatcherFromTask = async (taskId: string, memberId: string) => {
  const { data } = await api.delete(`/tasks/${taskId}/watchers/${memberId}`);
  return data;
};

// Task-Collaborators associations
export const getTaskCollaborators = async (taskId: string) => {
  const { data } = await api.get(`/tasks/${taskId}/collaborators`);
  return data;
};

export const addCollaboratorToTask = async (taskId: string, memberId: string) => {
  const { data } = await api.post(`/tasks/${taskId}/collaborators/${memberId}`);
  return data;
};

export const removeCollaboratorFromTask = async (taskId: string, memberId: string) => {
  const { data } = await api.delete(`/tasks/${taskId}/collaborators/${memberId}`);
  return data;
};

// Priorities management
export const getAllPriorities = async () => {
  const { data } = await api.get('/priorities');
  return data;
};

export const getPriorities = async () => {
  const { data } = await api.get('/admin/priorities');
  return data;
};

export const createPriority = async (priority: { priority: string; color: string }) => {
  const { data } = await api.post('/admin/priorities', priority);
  return data;
};

export const updatePriority = async (priorityId: number, priority: { priority: string; color: string }) => {
  const { data } = await api.put(`/admin/priorities/${priorityId}`, priority);
  return data;
};

export const deletePriority = async (priorityId: number) => {
  const { data } = await api.delete(`/admin/priorities/${priorityId}`);
  return data;
};

export const reorderPriorities = async (priorities: any[]) => {
  const { data } = await api.put('/admin/priorities/reorder', { priorities });
  return data;
};

export const setDefaultPriority = async (priorityId: number) => {
  const { data } = await api.put(`/admin/priorities/${priorityId}/set-default`);
  return data;
};

// Views (saved filters) management
export interface SavedFilterView {
  id: number;
  filterName: string;
  userId: string;
  shared: boolean;
  textFilter?: string;
  dateFromFilter?: string;
  dateToFilter?: string;
  dueDateFromFilter?: string;
  dueDateToFilter?: string;
  memberFilters?: string[];
  priorityFilters?: string[];
  tagFilters?: string[];
  projectFilter?: string;
  taskFilter?: string;
  created_at: string;
  updated_at: string;
  creatorName?: string; // Available for shared filters
}

export interface CreateFilterViewRequest {
  filterName: string;
  filters: {
    text?: string;
    dateFrom?: string;
    dateTo?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    selectedMembers?: string[];
    selectedPriorities?: string[];
    selectedTags?: string[];
    projectId?: string;
    taskId?: string;
  };
  shared?: boolean;
}

export interface UpdateFilterViewRequest {
  filterName?: string;
  filters?: {
    text?: string;
    dateFrom?: string;
    dateTo?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    selectedMembers?: string[];
    selectedPriorities?: string[];
    selectedTags?: string[];
    projectId?: string;
    taskId?: string;
  };
  shared?: boolean;
}

export const getSavedFilterViews = async (): Promise<SavedFilterView[]> => {
  const { data } = await api.get('/views');
  return data;
};

export const getSharedFilterViews = async (): Promise<SavedFilterView[]> => {
  const { data } = await api.get('/views/shared');
  return data;
};

export const getSavedFilterView = async (viewId: number): Promise<SavedFilterView> => {
  const { data } = await api.get(`/views/${viewId}`);
  return data;
};

export const createSavedFilterView = async (request: CreateFilterViewRequest): Promise<SavedFilterView> => {
  const { data } = await api.post('/views', request);
  return data;
};

export const updateSavedFilterView = async (viewId: number, request: UpdateFilterViewRequest): Promise<SavedFilterView> => {
  const { data } = await api.put(`/views/${viewId}`, request);
  return data;
};

export const deleteSavedFilterView = async (viewId: number): Promise<void> => {
  await api.delete(`/views/${viewId}`);
};

// Avatar management
export const uploadAvatar = async (file: File) => {
  const formData = new FormData();
  formData.append('avatar', file);

  const { data } = await api.post<{
    message: string;
    avatarUrl: string;
  }>('/users/avatar', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
};

// Task Relationships
export const getTaskRelationships = async (taskId: string) => {
  const response = await api.get(`/tasks/${taskId}/relationships`);
  return response.data;
};

export const getAvailableTasksForRelationship = async (taskId: string) => {
  const response = await api.get(`/tasks/${taskId}/available-for-relationship`);
  return response.data;
};

export const addTaskRelationship = async (taskId: string, relationship: 'parent' | 'child' | 'related', toTaskId: string) => {
  const response = await api.post(`/tasks/${taskId}/relationships`, {
    relationship,
    toTaskId
  });
  return response.data;
};

export const removeTaskRelationship = async (taskId: string, relationshipId: string) => {
  const response = await api.delete(`/tasks/${taskId}/relationships/${relationshipId}`);
  return response.data;
};

export const getBoardTaskRelationships = async (boardId: string) => {
  const response = await api.get(`/boards/${boardId}/relationships`);
  return response.data;
};

// Get complete task flow chart data (optimized)
export const getTaskFlowChart = async (taskId: string): Promise<{
  rootTaskId: string;
  tasks: Array<{
    id: string;
    ticket: string;
    title: string;
    memberId: string;
    memberName: string;
    memberColor: string;
    status: string;
    priority: string;
    startDate: string;
    dueDate: string;
    projectId: string;
  }>;
  relationships: Array<{
    id: string;
    taskId: string;
    relationship: string;
    relatedTaskId: string;
    taskTicket: string;
    relatedTaskTicket: string;
  }>;
}> => {
  const response = await api.get(`/tasks/${taskId}/flow-chart`);
  return response.data;
};

// User Status
export const getUserStatus = async (): Promise<{
  isActive: boolean;
  isAdmin: boolean;
  forceLogout: boolean;
}> => {
  const response = await api.get('/user/status');
  return response.data;
};

export default api;