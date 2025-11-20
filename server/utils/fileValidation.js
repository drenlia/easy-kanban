import { wrapQuery } from './queryLogger.js';

/**
 * Get admin-configured file upload settings from database
 * @param {Database} db - Database instance
 * @returns {Promise<Object>} { maxSize, allowedTypes, blockedTypes, blockedExtensions, limitsEnforced }
 */
export const getAdminFileSettings = async (db) => {
  try {
    const settings = wrapQuery(db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?)'), 'SELECT')
      .all('UPLOAD_MAX_FILESIZE', 'UPLOAD_FILETYPES', 'UPLOAD_LIMITS_ENFORCED');
    
    const settingsMap = {};
    settings.forEach(row => {
      settingsMap[row.key] = row.value;
    });
    
    // Parse limits enforced flag (default true)
    const limitsEnforced = settingsMap.UPLOAD_LIMITS_ENFORCED !== 'false';
    
    // Parse max file size (default 10MB)
    const maxSize = parseInt(settingsMap.UPLOAD_MAX_FILESIZE || '10485760');
    
    // Parse allowed file types (default all enabled)
    let allowedTypes = {};
    try {
      const fileTypesJson = settingsMap.UPLOAD_FILETYPES;
      if (fileTypesJson) {
        allowedTypes = JSON.parse(fileTypesJson);
        // If parsed result is empty object {}, use defaults (backward compatibility)
        if (Object.keys(allowedTypes).length === 0) {
          console.log('⚠️ UPLOAD_FILETYPES is empty object, using default file types');
          allowedTypes = null; // Signal to use defaults
        }
      } else {
        // No UPLOAD_FILETYPES in database, use defaults
        allowedTypes = null;
      }
    } catch (error) {
      console.error('Error parsing UPLOAD_FILETYPES:', error);
      // Default to all enabled if parsing fails
      allowedTypes = null; // Signal to use defaults
    }
    
    // Use default file types if not set or empty
    if (allowedTypes === null) {
      allowedTypes = {
        // Images
        'image/jpeg': true,
        'image/png': true,
        'image/gif': true,
        'image/webp': true,
        'image/svg+xml': true,
        'image/bmp': true,
        'image/tiff': true,
        'image/ico': true,
        'image/heic': true,
        'image/heif': true,
        'image/avif': true,
        // Videos
        'video/mp4': true,
        'video/webm': true,
        'video/ogg': true,
        'video/quicktime': true,
        'video/x-msvideo': true,
        'video/x-ms-wmv': true,
        'video/x-matroska': true,
        'video/mpeg': true,
        'video/3gpp': true,
        // Documents
        'application/pdf': true,
        'text/plain': true,
        'text/csv': true,
        // Office Documents
        'application/msword': true,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
        'application/vnd.ms-excel': true,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
        'application/vnd.ms-powerpoint': true,
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
        // Archives
        'application/zip': true,
        'application/x-rar-compressed': true,
        'application/x-7z-compressed': true,
        // Code Files
        'text/javascript': true,
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
      blockedExtensions,
      limitsEnforced
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
      ],
      limitsEnforced: true // Default to enforced for safety
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
  const { maxSize, allowedTypes, blockedTypes, blockedExtensions, limitsEnforced } = settings;
  
  // Always check blocked MIME types (security - always enforced)
  if (blockedTypes.includes(file.mimetype)) {
    return { valid: false, error: `File type "${file.mimetype}" is not allowed for security reasons` };
  }
  
  // Always check blocked extensions (security - always enforced)
  const extension = getFileExtension(file.originalname);
  if (blockedExtensions.includes(extension)) {
    return { valid: false, error: `File extension "${extension}" is not allowed for security reasons` };
  }
  
  // If limits are not enforced, skip size and type restrictions
  if (!limitsEnforced) {
    return { valid: true };
  }
  
  // Check file size (only if limits enforced)
  if (file.size > maxSize) {
    const sizeMB = Math.round(maxSize / 1024 / 1024);
    return { valid: false, error: `File size exceeds ${sizeMB}MB limit` };
  }
  
  // Check allowed MIME types (only if limits enforced and admin has configured them)
  // If allowedTypes is empty {}, allow all types (backward compatibility)
  // If allowedTypes has keys, only allow types explicitly set to true
  if (Object.keys(allowedTypes).length > 0) {
    // Normalize MIME type (remove charset, parameters, etc.)
    // Example: "image/gif; charset=binary" -> "image/gif"
    const normalizedMimeType = file.mimetype.split(';')[0].trim().toLowerCase();
    const isAllowed = allowedTypes[normalizedMimeType] === true || allowedTypes[file.mimetype] === true;
    if (!isAllowed) {
      // Log the rejection for debugging
      console.log(`❌ File type "${file.mimetype}" (normalized: "${normalizedMimeType}") not in allowed types. Allowed types:`, Object.keys(allowedTypes).filter(k => allowedTypes[k] === true));
      return { valid: false, error: `File type "${file.mimetype}" is not supported. Please contact your administrator to enable this file type.` };
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
