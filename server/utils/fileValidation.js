import { wrapQuery } from './queryLogger.js';

/**
 * Get admin-configured file upload settings from database
 * @param {Database} db - Database instance
 * @returns {Promise<Object>} { maxSize, allowedTypes, blockedTypes, blockedExtensions }
 */
export const getAdminFileSettings = async (db) => {
  try {
    const settings = await wrapQuery(db, 'SELECT key, value FROM settings WHERE key IN (?, ?)', 
      ['UPLOAD_MAX_FILESIZE', 'UPLOAD_FILETYPES']);
    
    const settingsMap = {};
    settings.forEach(row => {
      settingsMap[row.key] = row.value;
    });
    
    // Parse max file size (default 10MB)
    const maxSize = parseInt(settingsMap.UPLOAD_MAX_FILESIZE || '10485760');
    
    // Parse allowed file types (default all enabled)
    let allowedTypes = {};
    try {
      allowedTypes = JSON.parse(settingsMap.UPLOAD_FILETYPES || '{}');
    } catch (error) {
      console.error('Error parsing UPLOAD_FILETYPES:', error);
      // Default to all enabled if parsing fails
      allowedTypes = {
        'image/jpeg': true,
        'image/png': true,
        'image/gif': true,
        'image/webp': true,
        'image/svg+xml': true,
        'application/pdf': true,
        'text/plain': true,
        'text/csv': true,
        'application/msword': true,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
        'application/vnd.ms-excel': true,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
        'application/vnd.ms-powerpoint': true,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
        'application/zip': true,
        'application/x-rar-compressed': true,
        'application/x-7z-compressed': true,
        'text/javascript': false,
        'text/css': true,
        'text/html': true,
        'application/json': true
      };
    }
    
    // Security: Always block dangerous file types
    const blockedTypes = [
      'application/x-executable',
      'application/x-msdownload', 
      'application/x-msdos-program',
      'application/x-winexe',
      'application/x-msi',
      'application/x-sh',
      'application/x-bat'
    ];
    
    const blockedExtensions = [
      '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.msi',
      '.sh', '.ps1', '.app', '.dmg', '.deb', '.rpm'
    ];
    
    return {
      maxSize,
      allowedTypes,
      blockedTypes,
      blockedExtensions
    };
  } catch (error) {
    console.error('Error getting admin file settings:', error);
    // Return safe defaults
    return {
      maxSize: 10 * 1024 * 1024, // 10MB
      allowedTypes: {},
      blockedTypes: [
        'application/x-executable',
        'application/x-msdownload', 
        'application/x-msdos-program',
        'application/x-winexe',
        'application/x-msi',
        'application/x-sh',
        'application/x-bat'
      ],
      blockedExtensions: [
        '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.js', '.jar', '.msi',
        '.sh', '.ps1', '.app', '.dmg', '.deb', '.rpm'
      ]
    };
  }
};

/**
 * Validate file against admin settings
 * @param {Object} file - Multer file object
 * @param {Object} settings - Admin file settings
 * @returns {Object} { valid: boolean, error?: string }
 */
export const validateFile = (file, settings) => {
  const { maxSize, allowedTypes, blockedTypes, blockedExtensions } = settings;
  
  // Check file size
  if (file.size > maxSize) {
    const sizeMB = Math.round(maxSize / 1024 / 1024);
    return { valid: false, error: `File size exceeds ${sizeMB}MB limit` };
  }
  
  // Check blocked MIME types (security)
  if (blockedTypes.includes(file.mimetype)) {
    return { valid: false, error: `File type "${file.mimetype}" is not allowed for security reasons` };
  }
  
  // Check blocked extensions (security)
  const extension = getFileExtension(file.originalname);
  if (blockedExtensions.includes(extension)) {
    return { valid: false, error: `File extension "${extension}" is not allowed for security reasons` };
  }
  
  // Check allowed MIME types (only if admin has configured them)
  if (Object.keys(allowedTypes).length > 0) {
    const isAllowed = allowedTypes[file.mimetype] === true;
    if (!isAllowed) {
      return { valid: false, error: `File type "${file.mimetype}" is not supported` };
    }
  }
  
  return { valid: true };
};

/**
 * Get file extension from filename
 * @param {string} filename - Original filename
 * @returns {string} File extension (lowercase)
 */
const getFileExtension = (filename) => {
  const ext = filename.split('.').pop();
  return ext ? `.${ext.toLowerCase()}` : '';
};

/**
 * Create multer file filter based on admin settings
 * @param {Database} db - Database instance
 * @returns {Function} Multer file filter function
 */
export const createFileFilter = (db) => {
  return async (req, file, cb) => {
    try {
      const settings = await getAdminFileSettings(db);
      const validation = validateFile(file, settings);
      
      if (validation.valid) {
        cb(null, true);
      } else {
        cb(new Error(validation.error), false);
      }
    } catch (error) {
      console.error('Error in file filter:', error);
      cb(new Error('File validation failed'), false);
    }
  };
};

/**
 * Create multer limits based on admin settings
 * @param {Database} db - Database instance
 * @returns {Promise<Object>} Multer limits object
 */
export const createMulterLimits = async (db) => {
  try {
    const settings = await getAdminFileSettings(db);
    return {
      fileSize: settings.maxSize
    };
  } catch (error) {
    console.error('Error creating multer limits:', error);
    return {
      fileSize: 10 * 1024 * 1024 // 10MB fallback
    };
  }
};
