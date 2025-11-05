import express from 'express';
import crypto from 'crypto';
import { authenticateToken } from '../middleware/auth.js';
import { createAttachmentUpload } from '../config/multer.js';

const router = express.Router();

// File upload endpoint (for backward compatibility with /api/upload)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const db = req.app.locals.db;
    // Create multer instance with admin settings
    const attachmentUploadWithValidation = await createAttachmentUpload(db);
    
    // Use the validated multer instance
    attachmentUploadWithValidation.single('file')(req, res, (err) => {
      if (err) {
        console.error('File upload validation error:', err.message);
        return res.status(400).json({ error: err.message });
      }
      
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
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

export default router;

