// License checking middleware
import { getLicenseManager } from '../config/license.js';

// Middleware to check user limit before creating users
export const checkUserLimit = (req, res, next) => {
  const licenseManager = getLicenseManager(req.app.locals.db);
  
  if (!licenseManager.isEnabled()) {
    return next(); // Skip license checks when disabled
  }

  licenseManager.checkUserLimit()
    .then(() => next())
    .catch(error => {
      res.status(403).json({
        error: 'License limit exceeded',
        details: error.message,
        limit: 'USER_LIMIT'
      });
    });
};

// Middleware to check task limit before creating tasks
export const checkTaskLimit = (req, res, next) => {
  const licenseManager = getLicenseManager(req.app.locals.db);
  
  if (!licenseManager.isEnabled()) {
    return next(); // Skip license checks when disabled
  }

  const boardId = req.body.boardId || req.params.boardId;
  if (!boardId) {
    return res.status(400).json({ error: 'Board ID is required for task limit check' });
  }

  licenseManager.checkTaskLimit(boardId)
    .then(() => next())
    .catch(error => {
      res.status(403).json({
        error: 'License limit exceeded',
        details: error.message,
        limit: 'TASK_LIMIT'
      });
    });
};

// Middleware to check board limit before creating boards
export const checkBoardLimit = (req, res, next) => {
  const licenseManager = getLicenseManager(req.app.locals.db);
  
  if (!licenseManager.isEnabled()) {
    return next(); // Skip license checks when disabled
  }

  licenseManager.checkBoardLimit()
    .then(() => next())
    .catch(error => {
      res.status(403).json({
        error: 'License limit exceeded',
        details: error.message,
        limit: 'BOARD_LIMIT'
      });
    });
};

// Middleware to check storage limit before file uploads
export const checkStorageLimit = (req, res, next) => {
  const licenseManager = getLicenseManager(req.app.locals.db);
  
  if (!licenseManager.isEnabled()) {
    return next(); // Skip license checks when disabled
  }

  licenseManager.checkStorageLimit()
    .then(() => next())
    .catch(error => {
      res.status(403).json({
        error: 'License limit exceeded',
        details: error.message,
        limit: 'STORAGE_LIMIT'
      });
    });
};

// Middleware to inject license info into request
export const injectLicenseInfo = async (req, res, next) => {
  const licenseManager = getLicenseManager(req.app.locals.db);
  req.licenseInfo = await licenseManager.getLicenseInfo();
  next();
};
