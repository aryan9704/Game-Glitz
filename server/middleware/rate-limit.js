const rateLimit = require('express-rate-limit');

const AUTH_WINDOW_MS = 15 * 60 * 1000;

function getRetryAfterSeconds(resetTime) {
  const resetMs = resetTime instanceof Date ? resetTime.getTime() : Number(resetTime || 0);
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

function createRateLimitHandler(message = 'Too many attempts. Try again later.') {
  return (req, res) => {
    const retryAfter = getRetryAfterSeconds(req.rateLimit?.resetTime);
    res.set('Retry-After', String(retryAfter));
    res.status(429).json({ error: message, retry_after: retryAfter });
  };
}

function normalizeLoginRateLimitKey(value) {
  return String(value || '').trim().toLowerCase() || 'anonymous';
}

const authLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler(),
});

const loginLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${normalizeLoginRateLimitKey(req.body?.login)}`,
  handler: createRateLimitHandler('Too many login attempts. Try again later.'),
});

const twoFactorLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.temp_token || 'no-temp-token').slice(0, 96)}`,
  handler: createRateLimitHandler('Too many 2FA attempts. Try again later.'),
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,
  skip: (req) => req.originalUrl.includes('/api/auth'),
  message: { error: 'Rate limit exceeded.' },
});

const adminLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('Too many admin requests. Try again later.'),
});

const passwordResetLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${normalizeLoginRateLimitKey(req.body?.email)}`,
  handler: createRateLimitHandler('Too many password reset requests. Try again later.'),
});

module.exports = { authLimiter, loginLimiter, twoFactorLimiter, apiLimiter, adminLimiter, passwordResetLimiter };
