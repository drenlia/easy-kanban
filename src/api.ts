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
export const getMembers = async () => {
  const { data } = await api.get<TeamMember[]>('/members');
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

// Tasks
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
  role: string;
}) => {
  const { data } = await api.post('/admin/users', userData);
  return data;
};

export const updateUser = async (userId: string, userData: {
  firstName: string;
  lastName: string;
  email: string;
  isActive: boolean;
}) => {
  const { data } = await api.put(`/admin/users/${userId}`, userData);
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

export const getSettings = async () => {
  const { data } = await api.get('/admin/settings');
  return data;
};

export const updateSetting = async (key: string, value: string) => {
  const { data } = await api.put('/admin/settings', { key, value });
  return data;
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

export default api;