import express from 'express';
import crypto from 'crypto';
import { authenticateToken } from '../middleware/auth.js';
import { createAttachmentUploadMiddleware } from '../config/multer.js';
import { getRequestDatabase } from '../middleware/tenantRouting.js';

const router = express.Router();

// Middleware factory: creates multer middleware dynamically based on admin settings
// This must run BEFORE the route handler so multer can process the multipart stream
const createUploadMiddleware = async (req, res, next) => {
  try {
    const db = getRequestDatabase(req);
    if (!db) {
      console.error('Database not available from getRequestDatabase');
      return res.status(500).json({ error: 'Database not initialized' });
    }
    // Create multer instance with admin settings (pre-loaded for synchronous filter)
    const attachmentUploadWithValidation = await createAttachmentUploadMiddleware(db);
    
    // Use multer as middleware - this processes the multipart stream
    attachmentUploadWithValidation.single('file')(req, res, (err) => {
      if (err) {
        // Handle multer errors (file too large, invalid type, etc.)
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: 'File too large' });
        }
        return res.status(400).json({ error: err.message });
      }
      // File processed successfully, continue to route handler
      next();
    });
  } catch (error) {
    console.error('File upload middleware error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'File upload failed' });
    }
  }
};

// File upload endpoint (for backward compatibility with /api/upload)
// Note: Multer middleware must run BEFORE the route handler to process multipart stream
router.post('/', authenticateToken, createUploadMiddleware, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate authenticated URL with token
    const token = req.headers.authorization?.replace('Bearer ', '');
    const authenticatedUrl = token ? `/api/files/attachments/${req.file.filename}?token=${encodeURIComponent(token)}` : `/attachments/${req.file.filename}`;
    
    res.json({
      id: crypto.randomUUID(),
      name: req.file.originalname,
      url: authenticatedUrl,
      type: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

export default router;

