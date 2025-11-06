import { closestCorners, pointerWithin } from '@dnd-kit/core';
import { Columns, Task, Column } from '../types';

/**
 * Custom collision detection that prioritizes empty columns over tasks
 */
export const customCollisionDetection = (args: any, draggedColumn: Column | null, draggedTask: Task | null, columns: Columns) => {
  // If we're dragging a column, use normal collision detection but filter for columns only
  if (draggedColumn) {
    const defaultCollisions = closestCorners(args);
    
    // Filter to only include column collisions (not tasks)
    const columnCollisions = defaultCollisions.filter((collision: any) => {
      const id = collision.id;
      // Check if this ID corresponds to a column (not a task)
      return Object.values(columns).some(col => col.id === id);
    });
    
    return columnCollisions.length > 0 ? columnCollisions : defaultCollisions;
  }
  
  // If we're dragging a task, check for empty column prioritization
  if (draggedTask) {
    // Get all possible collisions
    const defaultCollisions = closestCorners(args);
    const pointerCollisions = pointerWithin(args);
    
    // Check if any pointer collisions are empty columns from different source
    const emptyColumnCollisions = pointerCollisions.filter((collision: any) => {
      const columnId = collision.id;
      const column = Object.values(columns).find(col => col.id === columnId);
      // Only prioritize if it's an empty column AND from a different source column
      return column && column.tasks.length === 0 && draggedTask.columnId !== columnId;
    });
    
    // Only prioritize empty columns if we have a clear intention to drop there
    // (i.e., if there are no other valid collision targets like tasks)
    const taskCollisions = defaultCollisions.filter((collision: any) => {
      // Check if this collision is with a task (not a column)
      return !Object.values(columns).some(col => col.id === collision.id);
    });
    
    // If we have task collisions, prefer those over empty columns
    if (taskCollisions.length > 0) {
      return defaultCollisions;
    }
    
    // If we found empty column collisions and no task collisions, prioritize them
    if (emptyColumnCollisions.length > 0) {
      return emptyColumnCollisions;
    }
    
    // Otherwise use default collisions for task moves
    return defaultCollisions;
  }
  
  // Fallback to normal collision detection
  return closestCorners(args);
};

/**
 * Calculate grid columns based on number of columns
 * Uses actual column count to prevent wrapping - columns will scroll horizontally
 * @param columnCount - Number of columns to display
 * @param columnWidth - Fixed width for each column in pixels (default: 300px)
 */
export const calculateGridStyle = (columnCount: number, columnWidth: number = 300): React.CSSProperties => {
  // Use actual column count (minimum 1 to avoid errors)
  const gridCols = Math.max(1, columnCount);
  // Calculate minimum width: (column width + gap) * column count
  // columnWidth + 24px gap (1.5rem) = (columnWidth + 24) per column
  const minWidth = gridCols * (columnWidth + 24);
  
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${gridCols}, ${columnWidth}px)`, // Fixed width for all columns
    gap: '1.5rem',
    width: 'max-content', // Allow grid to expand beyond viewport
    minWidth: `${minWidth}px`, // Ensure minimum width for all columns
  };
};
