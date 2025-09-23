import React, { memo } from 'react';
import { Columns, Task } from '../types';
import GanttView from './GanttView';

// Split implementation that renders the GanttView in a more optimized way
const GanttViewSplit = memo((props: {
  columns: Columns;
  onSelectTask: (task: Task) => void;
  taskViewMode?: 'expand' | 'compact' | 'shrink';
  onUpdateTask?: (task: Task) => void;
  onTaskDragStart?: (task: Task) => void;
  onTaskDragEnd?: () => void;
  boardId?: string | null;
  onAddTask?: (columnId: string) => Promise<void>;
  currentUser?: any;
  members?: any[];
  onRefreshData?: () => Promise<void>;
  relationships?: any[];
  onCopyTask?: (task: Task) => Promise<void>;
  onRemoveTask?: (taskId: string, clickEvent?: React.MouseEvent) => Promise<void>;
  siteSettings?: { [key: string]: string };
}) => {
  // For now, just pass through to the original GanttView
  // We'll implement the split architecture incrementally
  return <GanttView {...props} />;
});

GanttViewSplit.displayName = 'GanttViewSplit';

export default GanttViewSplit;
