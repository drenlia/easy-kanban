/**
 * Utility functions for board management
 */

import { Board } from '../types';
import i18n from '../i18n/config';

/**
 * Generates a unique board name by appending a number if the name already exists
 * @param boards - Array of existing boards to check against
 * @returns A unique board name (e.g., "New Board 1", "New Board 2", etc.)
 */
export const generateUniqueBoardName = (boards: Board[]): string => {
  const baseName = i18n.t('boardTabs.newBoard', { ns: 'common' });
  let counter = 1;
  let proposedName = `${baseName} ${counter}`;
  
  while (boards.some(board => board.title.toLowerCase() === proposedName.toLowerCase())) {
    counter++;
    proposedName = `${baseName} ${counter}`;
  }
  
  return proposedName;
};

