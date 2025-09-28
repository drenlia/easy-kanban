import multer from 'multer';
import path from 'path';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createFileFilter, createMulterLimits } from '../utils/fileValidation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure upload directories exist
const ensureDirectories = async () => {
  const attachmentsDir = path.join(dirname(__dirname), 'attachments');
  const avatarsDir = path.join(dirname(__dirname), 'avatars');
  
  try {
    await mkdir(attachmentsDir, { recursive: true });
    await mkdir(avatarsDir, { recursive: true });
  } catch (error) {
    console.error('Error creating upload directories:', error);
  }
};

// Initialize directories
ensureDirectories();

// Configure multer for file uploads (attachments)
const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const attachmentsDir = path.join(dirname(__dirname), 'attachments');
    cb(null, attachmentsDir);
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
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const avatarsDir = path.join(dirname(__dirname), 'avatars');
    cb(null, avatarsDir);
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
export const createAttachmentUpload = async (db) => {
  const limits = await createMulterLimits(db);
  const fileFilter = createFileFilter(db);
  
  return multer({
    storage: attachmentStorage,
    fileFilter: fileFilter,
    limits: limits
  });
};

export { ensureDirectories };
