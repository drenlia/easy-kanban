import { Task } from '../../types';

// Drag item types for different drag operations
export const DRAG_TYPES = {
  TASK_START_HANDLE: 'task-start-handle',
  TASK_END_HANDLE: 'task-end-handle',
  TASK_MOVE_HANDLE: 'task-move-handle',
  TASK_BODY: 'task-body',
  TASK_ROW_HANDLE: 'task-row-handle'
} as const;

export type DragType = typeof DRAG_TYPES[keyof typeof DRAG_TYPES];

// Data passed during drag operations
export interface TaskDragData {
  taskId: string;
  taskTitle: string;
  originalStartDate: string;
  originalEndDate: string;
  dragType: DragType;
}

// Data passed during row reordering
export interface RowDragData {
  taskId: string;
  taskTitle: string;
  originalIndex: number;
  dragType: DragType;
}

// Drop result when dropping on a date column
export interface DateDropResult {
  date: string;
  dateIndex: number;
}

// Combined drag item for dnd-kit
export interface GanttDragItem extends TaskDragData {
  id: string; // Required by dnd-kit
}

// Row drag item for dnd-kit
export interface GanttRowDragItem extends RowDragData {
  id: string; // Required by dnd-kit
}

// Sortable task row item for dnd-kit
export interface SortableTaskRowItem {
  id: string; // Required by dnd-kit
  type: 'task-row-reorder';
  task: Task;
  taskIndex: number;
}

// Union type for all possible drag items
export type AnyDragItem = GanttDragItem | GanttRowDragItem | SortableTaskRowItem;

// Props for draggable task handles
export interface TaskHandleProps {
  taskId: string;
  task: Task;
  handleType: 'start' | 'end';
  onDateChange: (taskId: string, handleType: 'start' | 'end', newDate: string) => void;
  taskColor?: {
    backgroundColor: string;
    color: string;
  };
}

// Props for droppable date columns
export interface DateColumnProps {
  date: Date;
  dateIndex: number;
  children: React.ReactNode;
  onTaskDrop: (dragData: TaskDragData, targetDate: string) => void;
}

// Props for draggable row handles
export interface RowHandleProps {
  taskId: string;
  taskTitle: string;
  taskIndex: number;
  onRowReorder: (dragData: RowDragData, targetIndex: number) => void;
}
