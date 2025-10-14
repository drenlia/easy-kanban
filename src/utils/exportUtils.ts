import * as XLSX from 'xlsx';
import { Task, Board, TeamMember, Tag, Columns } from '../types';

/**
 * Strip HTML tags from text while preserving line breaks
 * Converts <p> tags to CRLF for better readability in exports
 */
function stripHtmlPreservingLineBreaks(html: string): string {
  if (!html) return '';
  
  // Convert <p> opening tags to CRLF
  let text = html.replace(/<p[^>]*>/gi, '\r\n');
  
  // Convert </p> closing tags to CRLF
  text = text.replace(/<\/p>/gi, '\r\n');
  
  // Convert <br> tags to CRLF
  text = text.replace(/<br\s*\/?>/gi, '\r\n');
  
  // Convert <div> tags to line breaks
  text = text.replace(/<div[^>]*>/gi, '\r\n');
  text = text.replace(/<\/div>/gi, '');
  
  // Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  
  // Clean up multiple consecutive line breaks (more than 2)
  text = text.replace(/(\r\n){3,}/g, '\r\n\r\n');
  
  // Trim leading/trailing whitespace
  text = text.trim();
  
  return text;
}

export interface ExportData {
  ticket?: string;
  title: string;
  description?: string;
  assignee?: string;
  priority: string;
  status: string;
  startDate: string;
  dueDate?: string;
  effort: number;
  tags?: string;
  comments?: string;
  createdAt?: string;
  updatedAt?: string;
  project?: string;
  boardName: string;
}

export interface ExportOptions {
  format: 'csv' | 'xlsx';
  scope: 'current' | 'all';
  currentBoardId?: string;
  currentBoardName?: string;
}

/**
 * Transform task data for export, excluding internal IDs but keeping relevant business data
 */
export function transformTaskForExport(
  task: Task, 
  boardName: string, 
  members: TeamMember[], 
  availableTags: Tag[],
  project?: string,
  columns?: Columns
): ExportData {
  // Get assignee name
  const assignee = task.memberId 
    ? members.find(m => m.id === task.memberId)?.name || 'Unassigned'
    : 'Unassigned';

  // Get tags as comma-separated string
  const tags = task.tags 
    ? task.tags.map(tag => tag.tag).join(', ')
    : '';

  // Get comments as text, separated by newlines, with HTML stripped
  const comments = task.comments?.length 
    ? task.comments.map(comment => stripHtmlPreservingLineBreaks(comment.text)).join('\n\n')
    : '';

  // Get column name (status) from columnId
  const status = columns && task.columnId 
    ? columns[task.columnId]?.title || 'Unknown'
    : task.status || 'Unknown';

  return {
    ticket: task.ticket || '',
    title: task.title,
    description: stripHtmlPreservingLineBreaks(task.description || ''),
    assignee,
    priority: task.priorityName || task.priority,
    status,
    startDate: task.startDate,
    dueDate: task.dueDate || '',
    effort: task.effort,
    tags,
    comments,
    createdAt: task.createdAt || task.created_at || '',
    updatedAt: task.updatedAt || task.updated_at || '',
    project: project || '',
    boardName
  };
}

/**
 * Get all tasks from boards for export
 */
export function getAllTasksForExport(
  boards: Board[], 
  members: TeamMember[], 
  availableTags: Tag[]
): ExportData[] {
  const allTasks: ExportData[] = [];

  boards.forEach(board => {
    Object.values(board.columns).forEach(column => {
      column.tasks.forEach(task => {
        const exportData = transformTaskForExport(
          task, 
          board.title, 
          members, 
          availableTags,
          board.project,
          board.columns
        );
        allTasks.push(exportData);
      });
    });
  });

  return allTasks;
}

/**
 * Get tasks from current board for export
 */
export function getCurrentBoardTasksForExport(
  board: Board, 
  members: TeamMember[], 
  availableTags: Tag[]
): ExportData[] {
  const tasks: ExportData[] = [];

  Object.values(board.columns).forEach(column => {
    column.tasks.forEach(task => {
      const exportData = transformTaskForExport(
        task, 
        board.title, 
        members, 
        availableTags,
        board.project,
        board.columns
      );
      tasks.push(exportData);
    });
  });

  return tasks;
}

/**
 * Convert data to CSV format for browser download
 */
export function convertToCSV(data: ExportData[]): string {
  if (data.length === 0) return '';
  
  const headers = [
    'Board', 'Ticket', 'Task', 'Description', 'Assignee', 'Priority', 'Status',
    'Start Date', 'Due Date', 'Effort', 'Tags', 'Comments', 'Created', 'Updated', 'Project'
  ];
  
  const csvRows = [headers.join(',')];
  
  data.forEach(row => {
    const values = [
      `"${String(row.boardName || '').replace(/"/g, '""')}"`,
      `"${String(row.ticket || '').replace(/"/g, '""')}"`,
      `"${String(row.title || '').replace(/"/g, '""')}"`,
      `"${String(row.description || '').replace(/"/g, '""')}"`,
      `"${String(row.assignee || '').replace(/"/g, '""')}"`,
      `"${String(row.priority || '').replace(/"/g, '""')}"`,
      `"${String(row.status || '').replace(/"/g, '""')}"`,
      `"${String(row.startDate || '').replace(/"/g, '""')}"`,
      `"${String(row.dueDate || '').replace(/"/g, '""')}"`,
      `"${String(row.effort || '').replace(/"/g, '""')}"`,
      `"${String(row.tags || '').replace(/"/g, '""')}"`,
      `"${String(row.comments || '').replace(/"/g, '""')}"`,
      `"${String(row.createdAt || '').replace(/"/g, '""')}"`,
      `"${String(row.updatedAt || '').replace(/"/g, '""')}"`,
      `"${String(row.project || '').replace(/"/g, '""')}"`
    ];
    csvRows.push(values.join(','));
  });
  
  return csvRows.join('\n');
}


/**
 * Generate filename with timestamp
 */
export function generateFilename(format: 'csv' | 'xlsx', scope: 'current' | 'all', boardName?: string): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const scopeText = scope === 'current' ? (boardName || 'current-board') : 'all-boards';
  const extension = format === 'csv' ? 'csv' : 'xlsx';
  
  return `kanban-export-${scopeText}-${timestamp}.${extension}`;
}

/**
 * Download file in browser
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
