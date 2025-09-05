import { Board, Task } from '../types';

export interface BoardDropState {
  hoveredBoardId: string | null;
  hoverStartTime: number | null;
  isDropReady: boolean;
}

export const HOVER_DELAY = 1000; // 1 second

/**
 * Check if a board tab should show drop-ready state
 */
export const shouldShowDropReady = (
  boardId: string,
  hoveredBoardId: string | null,
  hoverStartTime: number | null,
  currentTime: number
): boolean => {
  return (
    boardId === hoveredBoardId &&
    hoverStartTime !== null &&
    currentTime - hoverStartTime >= HOVER_DELAY
  );
};

/**
 * Check if a task can be moved to a target board
 */
export const canMoveTaskToBoard = (
  task: Task,
  targetBoard: Board,
  currentBoardId: string
): boolean => {
  // Can't move to the same board
  if (targetBoard.id === currentBoardId) {
    return false;
  }
  
  // Target board must have at least one column
  if (!targetBoard.columns || Object.keys(targetBoard.columns).length === 0) {
    return false;
  }
  
  return true;
};

/**
 * Get CSS classes for board tab drop state
 */
export const getBoardTabDropClasses = (
  isDropReady: boolean,
  isHovering: boolean,
  isDragActive: boolean
): string => {
  const baseClasses = 'transition-all duration-300 ease-in-out';
  
  if (!isDragActive) {
    return baseClasses;
  }
  
  if (isDropReady) {
    return `${baseClasses} ring-2 ring-blue-400 bg-blue-50 scale-105 shadow-lg animate-pulse`;
  }
  
  if (isHovering) {
    return `${baseClasses} bg-blue-25 border-blue-200`;
  }
  
  return `${baseClasses} opacity-70`;
};

/**
 * Create drop animation keyframes
 */
export const getDropAnimationClasses = (): string => {
  return 'animate-bounce';
};
