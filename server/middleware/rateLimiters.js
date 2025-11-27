import rateLimit from 'express-rate-limit';

// Determine if we should trust proxy based on environment
// This MUST match the Express 'trust proxy' setting in server/index.js
// In Docker without reverse proxy, set TRUST_PROXY=false
// In K8s with ingress, set TRUST_PROXY=1 (or number of proxies)
// Default to false for Docker, true for K8s (multi-tenant mode)
let shouldTrustProxy = false;
if (process.env.TRUST_PROXY === 'false') {
  shouldTrustProxy = false;
} else if (process.env.TRUST_PROXY) {
  const proxyCount = parseInt(process.env.TRUST_PROXY);
  shouldTrustProxy = isNaN(proxyCount) ? true : proxyCount;
} else {
  // Default: trust proxy only in multi-tenant mode (K8s with ingress)
  shouldTrustProxy = process.env.MULTI_TENANT === 'true';
}

// Login rate limiter: 5 attempts per 15 minutes
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 login attempts per window
  message: {
    error: 'Too many login attempts, please try again in 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful logins
  trustProxy: shouldTrustProxy, // Explicitly set trust proxy to avoid validation warning
  validate: false, // Disable all validations - we handle trust proxy explicitly
});

// Password reset rate limiter: 3 attempts per hour
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  message: {
    error: 'Too many password reset attempts, please try again in 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: shouldTrustProxy,
  validate: false, // Disable all validations - we handle trust proxy explicitly
});

// Registration rate limiter: 3 attempts per hour
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registration attempts per hour
  message: {
    error: 'Too many registration attempts, please try again in 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: shouldTrustProxy,
  validate: false, // Disable all validations - we handle trust proxy explicitly
});

// Account activation rate limiter: 10 attempts per hour
export const activationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 activation attempts per hour
  message: {
    error: 'Too many activation attempts, please try again in 1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: shouldTrustProxy,
  validate: false, // Disable all validations - we handle trust proxy explicitly
});

