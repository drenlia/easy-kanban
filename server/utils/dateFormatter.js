/**
 * Date formatting utilities for email notifications
 */

/**
 * Format date to YYYY-MM-DD HH:MM:SS in local time
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} Formatted date string
 */
export function formatDateTimeLocal(date) {
  const d = date instanceof Date ? date : new Date(date);
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

