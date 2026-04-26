import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        });
      }
      (req as any).validated = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
};
