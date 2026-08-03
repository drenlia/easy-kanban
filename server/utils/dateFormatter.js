/**
 * Date formatting utilities for email notifications
 */

import { wrapQuery } from './queryLogger.js';

/**
 * @param {unknown} timeZone
 * @returns {string|null}
 */
export function normalizeTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== 'string') return null;
  const tz = timeZone.trim();
  if (!tz) return null;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/**
 * Load recipient IANA timezone from user_settings (key: timezone).
 * @param {object} db
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
export async function getUserTimeZone(db, userId) {
  if (!db || !userId) return null;
  try {
    const row = await wrapQuery(
      db.prepare(
        'SELECT setting_value FROM user_settings WHERE userid = ? AND setting_key = ?'
      ),
      'SELECT'
    ).get(userId, 'timezone');
    return normalizeTimeZone(row?.setting_value);
  } catch {
    return null;
  }
}

/**
 * Format date to YYYY-MM-DD HH:MM:SS [TZ] in the given IANA timezone.
 * Falls back to the server's local timezone when none is provided / invalid.
 *
 * @param {Date|string} date - Date object or ISO string
 * @param {string} [timeZone] - IANA timezone (e.g. America/Toronto)
 * @returns {string} Formatted date string
 */
export function formatDateTimeLocal(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';

  // Old callers sometimes passed `db` as the 2nd arg — ignore non-strings
  const tz = normalizeTimeZone(typeof timeZone === 'string' ? timeZone : null);

  if (!tz) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(d);

  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = get('hour');
  const minute = get('minute');
  const second = get('second');
  const tzName = get('timeZoneName');

  const stamp = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  return tzName ? `${stamp} ${tzName}` : stamp;
}
