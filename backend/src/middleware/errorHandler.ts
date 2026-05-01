import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import config from '../config/env';
import logger from '../utils/logger';

export class AppError extends Error {
  status: number;
  isOperational: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  const status = (err as AppError).status || (err as any).statusCode || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  // Log error in development or send to Sentry in production
  if (status === 500) {
    // FIX: Never log req.body or req.query — they may contain passwords, tokens, or secrets
    const logData = {
      error: err.message,
      stack: err.stack,
      method: req.method,
      path: req.path,
      requestId: (req as any).requestId,
    };
    
    if (config.server.nodeEnv === 'development') {
      logger.error('[ERROR]', logData);
    } else {
      // In production, you would send to Sentry here
      logger.error('[ERROR]', {
        error: err.message,
        requestId: (req as any).requestId,
        method: req.method,
        path: req.path,
      });
    }
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // Handle operational errors
  if (err instanceof AppError) {
    return res.status(status).json({
      error: message,
    });
  }

  res.status(status).json({
    error: message,
  });
};

export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
  });
};
