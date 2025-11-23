import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createFileFilter, createMulterLimits, getAdminFileSettings, validateFile } from '../utils/fileValidation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Get base paths (for single-tenant mode or fallback)
const getBasePaths = () => {
  const basePath = process.env.DOCKER_ENV === 'true'
    ? '/app/server'
    : dirname(__dirname);
  
  return {
    attachments: path.join(basePath, 'attachments'),
    avatars: path.join(basePath, 'avatars')
  };
};

// Ensure base upload directories exist (for backward compatibility)
const ensureDirectories = async () => {
  const basePaths = getBasePaths();
  
  try {
    await mkdir(basePaths.attachments, { recursive: true });
    await mkdir(basePaths.avatars, { recursive: true });
  } catch (error) {
    console.error('Error creating upload directories:', error);
  }
};

// Initialize base directories
ensureDirectories();

// Get tenant-specific storage paths from request (set by tenant routing middleware)
// Falls back to base paths for single-tenant mode
const getStoragePaths = (req) => {
  // Check if tenant routing middleware has set tenant storage paths
  // Check req.locals first (multi-tenant mode) then req.app.locals (single-tenant mode)
  if (req.locals?.tenantStoragePaths) {
    return req.locals.tenantStoragePaths;
  }
  if (req.app.locals?.tenantStoragePaths) {
    return req.app.locals.tenantStoragePaths;
  }
  
  // Fallback to base paths (single-tenant mode)
  return getBasePaths();
};

// Ensure tenant directory exists (creates if needed, similar to database.js)
const ensureTenantDirectory = (dirPath, tenantId = null) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      if (tenantId) {
        console.log(`📁 Created tenant storage directory: ${dirPath}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error creating directory ${dirPath}:`, error);
    throw error;
  }
};

// Configure multer for file uploads (attachments)
// Uses tenant-specific paths in multi-tenant mode
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const storagePaths = getStoragePaths(req);
      const attachmentsDir = storagePaths.attachments;
      
      // Get tenant ID for logging (if available)
      const tenantId = req.tenantId || req.app.locals?.currentTenant || null;
      
      // Create tenant directory if it doesn't exist
      ensureTenantDirectory(attachmentsDir, tenantId);
      
      cb(null, attachmentsDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    // Create unique filename
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000000);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${timestamp}-${random}${ext}`);
  }
});

// Configure multer for avatar uploads
// Uses tenant-specific paths in multi-tenant mode
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const storagePaths = getStoragePaths(req);
      const avatarsDir = storagePaths.avatars;
      
      // Get tenant ID for logging (if available)
      const tenantId = req.tenantId || req.app.locals?.currentTenant || null;
      
      // Create tenant directory if it doesn't exist
      ensureTenantDirectory(avatarsDir, tenantId);
      
      cb(null, avatarsDir);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    // Create unique filename for avatars
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000000);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${timestamp}-${random}${ext}`);
  }
});

// File filter for images (avatars)
const imageFileFilter = (req, file, cb) => {
  // Only allow image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Create multer instances
export const attachmentUpload = multer({ 
  storage: attachmentStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export const avatarUpload = multer({ 
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit for avatars
  }
});

// Create attachment upload with admin settings
// Note: fileFilter is async, but multer handles it correctly
export const createAttachmentUpload = async (db) => {
  const limits = await createMulterLimits(db);
  const fileFilter = createFileFilter(db);
  
  return multer({
    storage: attachmentStorage,
    fileFilter: fileFilter,
    limits: limits
  });
};

// Create a middleware factory that pre-loads settings and creates multer instance
export const createAttachmentUploadMiddleware = async (db) => {
  const limits = await createMulterLimits(db);
  const settings = await getAdminFileSettings(db);
  
  // Create a synchronous file filter using pre-loaded settings
  const syncFileFilter = (req, file, cb) => {
    try {
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
  
  return multer({
    storage: attachmentStorage,
    fileFilter: syncFileFilter,
    limits: limits
  });
};

export { ensureDirectories };
