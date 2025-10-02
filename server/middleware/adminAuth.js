// Admin Portal Authentication Middleware
// This middleware validates INSTANCE_TOKEN for admin portal access

export const authenticateAdminPortal = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ 
      error: 'Admin portal access token required',
      message: 'Include Authorization header with Bearer token'
    });
  }

  // Get the instance token from environment
  const instanceToken = process.env.INSTANCE_TOKEN;
  
  if (!instanceToken) {
    console.error('❌ INSTANCE_TOKEN environment variable not set');
    return res.status(500).json({ 
      error: 'Instance configuration error',
      message: 'Instance token not configured'
    });
  }

  // Validate the token
  if (token !== instanceToken) {
    console.warn(`⚠️ Invalid admin portal token attempt from ${req.ip}`);
    return res.status(403).json({ 
      error: 'Invalid admin portal token',
      message: 'The provided token does not match the instance token'
    });
  }

  // Token is valid, add admin context to request
  req.adminPortal = {
    authenticated: true,
    instanceToken: instanceToken,
    timestamp: new Date().toISOString()
  };

  console.log(`✅ Admin portal authenticated for instance: ${process.env.INSTANCE_NAME || 'unknown'}`);
  next();
};

// Optional: Add rate limiting for admin portal endpoints
export const adminPortalRateLimit = (req, res, next) => {
  // Simple rate limiting - can be enhanced with Redis-based rate limiting
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // For now, just log the request
  console.log(`📊 Admin portal request from ${clientIP}: ${req.method} ${req.path}`);
  
  next();
};
