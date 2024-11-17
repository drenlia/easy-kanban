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
  attachments: Attachment[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  memberId: string;
  startDate: string;
  effort: number;
  columnId: string;
  priority: Priority;
  requesterId: string;
  comments: Comment[];
}

export interface Column {
  id: string;
  title: string;
  tasks: Task[];
}

export interface Columns {
  [key: string]: Column;
}