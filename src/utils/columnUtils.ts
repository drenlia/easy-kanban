/**
 * Utility functions for column management
 */

import api from '../api';

/**
 * Checks if a column name matches any of the finished column names (case-insensitive)
 * @param columnName - The column name to check
 * @param finishedColumnNames - Array of finished column names from settings
 * @returns true if the column should be marked as finished
 */
export const isColumnFinished = (columnName: string, finishedColumnNames: string[]): boolean => {
  if (!columnName || !finishedColumnNames || finishedColumnNames.length === 0) {
    return false;
  }
  
  return finishedColumnNames.some(finishedName => 
    finishedName.toLowerCase() === columnName.toLowerCase()
  );
};

/**
 * Parses the finished column names from the settings JSON string
 * @param finishedColumnNamesJson - JSON string containing the finished column names
 * @returns Array of finished column names, or default values if parsing fails
 */
export const parseFinishedColumnNames = (finishedColumnNamesJson?: string): string[] => {
  if (!finishedColumnNamesJson) {
    return ['Done', 'Completed', 'Finished'];
  }
  
  try {
    const parsed = JSON.parse(finishedColumnNamesJson);
    return Array.isArray(parsed) ? parsed : ['Done', 'Completed', 'Finished'];
  } catch (error) {
    console.error('Error parsing finished column names:', error);
    return ['Done', 'Completed', 'Finished'];
  }
};

/**
 * Renumbers columns for a board to ensure clean position values
 * @param boardId - The ID of the board whose columns should be renumbered
 * @returns Promise that resolves when renumbering is complete
 */
export const renumberColumns = async (boardId: string): Promise<void> => {
  try {
    const { data } = await api.post('/columns/renumber', { boardId });
    return data;
  } catch (error) {
    console.error('Failed to renumber columns:', error);
    throw error;
  }
};
