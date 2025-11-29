/**
 * Backend Internationalization (i18n) Utility
 * 
 * Provides translation functionality for the backend based on APP_LANGUAGE setting.
 * Falls back to English if translation not found or language not supported.
 */

import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cache for loaded translations
let translationsCache = {
  en: null,
  fr: null
};

/**
 * Load translation file for a given language
 * @param {string} lang - Language code ('en' or 'fr')
 * @returns {Object} Translation object
 */
function loadTranslations(lang) {
  // Normalize language code
  const normalizedLang = lang?.toUpperCase() === 'FR' ? 'fr' : 'en';
  
  // Return cached if available
  if (translationsCache[normalizedLang]) {
    return translationsCache[normalizedLang];
  }
  
  try {
    const filePath = join(__dirname, '../i18n/locales', `${normalizedLang}.json`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const translations = JSON.parse(fileContent);
    
    // Cache the translations
    translationsCache[normalizedLang] = translations;
    
    return translations;
  } catch (error) {
    console.error(`Failed to load translations for language '${normalizedLang}':`, error);
    // Fallback to English
    if (normalizedLang !== 'en') {
      return loadTranslations('en');
    }
    return {};
  }
}

/**
 * Get APP_LANGUAGE setting from database
 * @param {Object} db - Database instance
 * @returns {Promise<string>} Language code ('en' or 'fr')
 */
export async function getAppLanguage(db) {
  try {
    const { wrapQuery } = await import('./queryLogger.js');
    const setting = await wrapQuery(db.prepare('SELECT value FROM settings WHERE key = ?'), 'SELECT').get('APP_LANGUAGE');
    const lang = setting?.value || 'EN';
    return lang.toUpperCase() === 'FR' ? 'fr' : 'en';
  } catch (error) {
    console.error('Failed to get APP_LANGUAGE from settings:', error);
    return 'en'; // Default to English
  }
}

/**
 * Translate a key using dot notation (e.g., 'errors.columnNotFound')
 * @param {string} key - Translation key in dot notation
 * @param {Object} params - Parameters to replace in the translation (e.g., {resource: 'tasks'})
 * @param {string} lang - Language code ('en' or 'fr'), defaults to 'en'
 * @returns {string} Translated string
 */
export function t(key, params = {}, lang = 'en') {
  const translations = loadTranslations(lang);
  
  // Navigate through nested object using dot notation
  const keys = key.split('.');
  let value = translations;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Key not found, try English fallback if not already English
      if (lang !== 'en') {
        return t(key, params, 'en');
      }
      // Return the key itself if not found even in English
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }
  
  // If value is a string, replace parameters
  if (typeof value === 'string') {
    let result = value;
    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), paramValue);
    }
    return result;
  }
  
  return value || key;
}

/**
 * Get translation function bound to a specific language from database
 * @param {Object} db - Database instance
 * @returns {Function} Translation function bound to the app language
 */
export async function getTranslator(db) {
  const lang = await getAppLanguage(db);
  return (key, params = {}) => t(key, params, lang);
}

/**
 * Get default board column names based on APP_LANGUAGE
 * @param {Object} db - Database instance
 * @returns {Array} Array of column objects with id and title
 */
export async function getDefaultBoardColumns(db) {
  const lang = await getAppLanguage(db);
  const translations = loadTranslations(lang);
  const columns = translations.boardColumns;
  
  return [
    { id: 'todo', title: columns.toDo },
    { id: 'progress', title: columns.inProgress },
    { id: 'testing', title: columns.testing },
    { id: 'completed', title: columns.completed },
    { id: 'archive', title: columns.archive }
  ];
}

/**
 * Clear translation cache (useful for testing or hot-reloading)
 */
export function clearTranslationCache() {
  translationsCache = {
    en: null,
    fr: null
  };
}

