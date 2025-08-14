export interface TeamMember {
  id: string;
  name: string;
  color: string;
}

export type Priority = 'low' | 'medium' | 'high';

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
  effort: number;
  priority: Priority;
  comments: Comment[];
  position?: number;
  boardId?: string;
}

export interface Column {
  id: string;
  title: string;
  tasks: Task[];
  boardId: string;
}

export interface Columns {
  [key: string]: Column;
}

export interface Board {
  id: string;
  title: string;
  columns: Columns;
}