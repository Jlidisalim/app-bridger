import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import config from '../config/env';

// Security middleware
export const securityMiddleware = [
  // Helmet for security headers
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),

  // CORS
  cors({
    origin: config.server.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
];

// General rate limiter
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict rate limiter for auth endpoints
// Uses phone from body when available, falls back to IP
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // Use phone from request body if available, otherwise fall back to IP
    const phone = req.body?.phone;
    if (phone) {
      // Normalize phone for consistent rate limiting across formats
      return `phone:${phone.replace(/[^\d+]/g, '')}`;
    }
    return req.ip || req.connection.remoteAddress || 'anonymous';
  },
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// ML / AI endpoint rate limiter — per authenticated user (falls back to IP)
// Prevents CPU-heavy abuse on /ml/match, /ml/price-estimate, /verify/capture-face
export const mlRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,              // 5 requests per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'anonymous',
  message: { error: 'Too many ML requests. Please wait before trying again.' },
});

// Face capture is extra strict — running it twice a minute is unusual
export const faceCaptureLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3,              // 3 per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'anonymous',
  message: { error: 'Too many face verification attempts. Please wait.' },
});

// Search endpoint — more lenient than ML but still capped
export const searchRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.id || req.ip || 'anonymous',
  message: { error: 'Too many search requests. Please slow down.' },
});

// Request ID middleware
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] || 
    `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
};
