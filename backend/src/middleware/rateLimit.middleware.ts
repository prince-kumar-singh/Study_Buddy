import rateLimit from 'express-rate-limit';
import { ApiError } from './error.middleware';

export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    throw new ApiError(429, 'Too many requests, please try again later.');
  },
});

// Stricter rate limit for Q&A endpoint
export const qaRateLimiter = rateLimit({
  windowMs: parseInt(process.env.QA_COOLDOWN_SECONDS || '30', 10) * 1000,
  max: 1,
  message: 'Please wait before asking another question.',
  skipSuccessfulRequests: false,
});
