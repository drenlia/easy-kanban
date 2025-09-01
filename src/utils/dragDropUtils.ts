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
    
    // If we found empty column collisions, prioritize them
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
 */
export const calculateGridStyle = (columnCount: number): React.CSSProperties => {
  const gridCols = columnCount <= 4 ? 4 : Math.min(6, columnCount);
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${gridCols}, minmax(300px, 1fr))`,
    gap: '1.5rem',
    width: '100%',
    overflowX: 'auto'
  };
};
