/**
 * Utility functions for board management
 */

import { Board } from '../types';

/**
 * Generates a unique board name by appending a number if the name already exists
 * @param boards - Array of existing boards to check against
 * @returns A unique board name (e.g., "New Board 1", "New Board 2", etc.)
 */
export const generateUniqueBoardName = (boards: Board[]): string => {
  let counter = 1;
  let proposedName = `New Board ${counter}`;
  
  while (boards.some(board => board.title.toLowerCase() === proposedName.toLowerCase())) {
    counter++;
    proposedName = `New Board ${counter}`;
  }
  
  return proposedName;
};

