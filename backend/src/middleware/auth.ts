import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import config from '../config/env';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    phone: string;
    name: string | null;
    avatar: string | null;
    kycStatus: string;
    walletBalance: number;
    rating: number;
    totalDeals: number;
    isAdmin: boolean;
  };
  sessionId?: string;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret) as { userId: string; sessionId: string };

    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = session.user;
    req.sessionId = session.id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    return next();
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, config.jwt.secret) as { userId: string; sessionId: string };

    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { user: true },
    });

    if (session && session.expiresAt > new Date()) {
      req.user = session.user;
      req.sessionId = session.id;
    }
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next();
};
