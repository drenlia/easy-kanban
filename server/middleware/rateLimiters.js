import rateLimit from 'express-rate-limit';

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
});

