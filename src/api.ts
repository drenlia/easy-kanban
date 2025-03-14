import axios from 'axios';
import { TeamMember, Board, Task, Column, Comment } from './types';

const api = axios.create({
  baseURL: '/api'
});

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