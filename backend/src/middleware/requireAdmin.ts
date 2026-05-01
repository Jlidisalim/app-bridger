import { Request, Response, NextFunction } from 'express';

/**
 * Middleware that blocks non-admin users from admin-only routes.
 * Must be applied AFTER the `authenticate` middleware so req.user is populated.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user || !user.isAdmin) {
    res.status(403).json({ error: 'Forbidden. Admin access required.' });
    return;
  }
  next();
}
