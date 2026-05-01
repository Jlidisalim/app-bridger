import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import sanitizeHtml from 'sanitize-html';
import { prisma } from '../config/db';
import config from '../config/env';
import { sendPushNotification } from './pushService';
import logger from '../utils/logger';

interface AuthSocket extends Socket {
  data: {
    userId?: string;
    isAdmin?: boolean;
  }
}

// Exported so that HTTP routes can emit events after DB writes
let _io: Server | null = null;
export function getIO(): Server | null { return _io; }

// ── FIX 13: Socket rate limiting ─────────────────────────────────────────────
interface RateLimitEntry { count: number; resetAt: number; }
const messageRateLimits  = new Map<string, RateLimitEntry>();
const typingRateLimits   = new Map<string, RateLimitEntry>();
const markReadRateLimits = new Map<string, RateLimitEntry>();
const violationCounts    = new Map<string, number>();

const MESSAGE_LIMIT    = 20;
const MESSAGE_WINDOW   = 60_000;
const TYPING_LIMIT     = 5;
const TYPING_WINDOW    = 10_000;
const MARK_READ_LIMIT  = 30;
const MARK_READ_WINDOW = 60_000;

function checkRateLimit(
  map: Map<string, RateLimitEntry>,
  userId: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = map.get(userId);

  if (!entry || now > entry.resetAt) {
    map.set(userId, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  if (entry.count >= limit) return false; // blocked

  entry.count += 1;
  return true; // allowed
}

// FIX: Purge violation counts alongside rate limit entries
function recordViolation(socket: AuthSocket): boolean {
  const userId = socket.data.userId!;
  const count = (violationCounts.get(userId) || 0) + 1;
  violationCounts.set(userId, count);
  if (count >= 3) {
    socket.emit('kicked', { reason: 'Repeated rate limit violations' });
    socket.disconnect(true);
    violationCounts.delete(userId);
    return true; // kicked
  }
  return false;
}

// Purge stale rate limit entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of messageRateLimits.entries())  if (now > v.resetAt) messageRateLimits.delete(k);
  for (const [k, v] of typingRateLimits.entries())   if (now > v.resetAt) typingRateLimits.delete(k);
  for (const [k, v] of markReadRateLimits.entries()) if (now > v.resetAt) markReadRateLimits.delete(k);
  // FIX: Also purge violation counts that have no corresponding rate limit entry
  for (const k of violationCounts.keys()) {
    if (!messageRateLimits.has(k) && !typingRateLimits.has(k)) violationCounts.delete(k);
  }
}, 2 * 60_000);

export function initWebSocket(httpServer: any): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.server.allowedOrigins,
      credentials: true,
    },
  });

  // Auth middleware — accepts the JWT access token; tolerates expired JWT but
  // still validates the session record exists and hasn't been revoked.
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));

      let payload: { userId: string; sessionId: string; isAdmin?: boolean };
      try {
        payload = jwt.verify(token, config.jwt.secret) as typeof payload;
      } catch (err: any) {
        // If only expired, decode without verification to extract sessionId and
        // check whether the DB session is still valid (for long-lived socket connections)
        if (err.name === 'TokenExpiredError') {
          payload = jwt.decode(token) as typeof payload;
          if (!payload?.sessionId) return next(new Error('Authentication failed'));
        } else {
          return next(new Error('Authentication failed'));
        }
      }

      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
      });

      if (!session || session.expiresAt < new Date()) {
        return next(new Error('Session expired'));
      }

      socket.data.userId  = payload.userId;
      socket.data.isAdmin = payload.isAdmin ?? false;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  _io = io;

  io.on('connection', (socket: AuthSocket) => {
    logger.info(`User ${socket.data.userId} connected`);

    // Join user's personal room
    socket.join(`user:${socket.data.userId}`);

    // Admins join the admin room to receive real-time admin task notifications
    if ((socket.data as any).isAdmin) {
      socket.join('admin_room');
      logger.debug(`Admin ${socket.data.userId} joined admin_room`);
    }

    // ── Heartbeat: detect stale connections ─────────────────────────────────
    // Every 30s the server pings the client. If no pong arrives within 10s,
    // the connection is treated as stale and forcibly disconnected.
    const PING_INTERVAL_MS = 30_000;
    const PONG_TIMEOUT_MS  = 10_000;

    let pongReceived = true;
    let pongTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const pingIntervalId = setInterval(() => {
      if (!pongReceived) {
        // Previous ping went unanswered — stale connection
        logger.warn(`[Heartbeat] No pong from user ${socket.data.userId}, disconnecting stale socket`);
        socket.disconnect(true);
        return;
      }
      pongReceived = false;
      socket.emit('ping');

      // Give client 10s to reply
      pongTimeoutId = setTimeout(() => {
        if (!pongReceived) {
          logger.warn(`[Heartbeat] Pong timeout for user ${socket.data.userId}`);
          socket.disconnect(true);
        }
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);

    socket.on('pong', () => {
      pongReceived = true;
      if (pongTimeoutId) clearTimeout(pongTimeoutId);
    });

    // Join chat room
    socket.on('join_room', async (roomId: string) => {
      // Verify user is a participant
      const participant = await prisma.chatParticipant.findFirst({
        where: {
          chatRoomId: roomId,
          userId: socket.data.userId,
        },
      });

      if (participant) {
        socket.join(`chat:${roomId}`);
        logger.debug(`User ${socket.data.userId} joined room ${roomId}`);
      }
    });

    // Leave chat room
    socket.on('leave_room', (roomId: string) => {
      socket.leave(`chat:${roomId}`);
      logger.debug(`User ${socket.data.userId} left room ${roomId}`);
    });

    // Join dispute room — verifies the user is a participant of the dispute
    socket.on('join_dispute', async (disputeId: string) => {
      try {
        const dispute = await prisma.dispute.findUnique({
          where: { id: disputeId },
          select: { filerId: true, againstId: true },
        });
        if (!dispute) return;
        if (
          dispute.filerId === socket.data.userId ||
          dispute.againstId === socket.data.userId ||
          socket.data.isAdmin
        ) {
          socket.join(`dispute:${disputeId}`);
          logger.debug(`User ${socket.data.userId} joined dispute ${disputeId}`);
        }
      } catch (e) {
        logger.warn('join_dispute failed', { error: String(e) });
      }
    });

    socket.on('leave_dispute', (disputeId: string) => {
      socket.leave(`dispute:${disputeId}`);
    });

    // Send message
    socket.on('send_message', async ({ roomId, content, type = 'TEXT', imageUrl, latitude, longitude, address }: any) => {
      // FIX 13: Rate limit messages — max 20/min per user
      if (!checkRateLimit(messageRateLimits, socket.data.userId!, MESSAGE_LIMIT, MESSAGE_WINDOW)) {
        socket.emit('rate_limit_error', { message: 'Too many messages. Slow down.' });
        recordViolation(socket);
        return;
      }
      try {
        // Verify sender is a participant
        const participant = await prisma.chatParticipant.findFirst({
          where: {
            chatRoomId: roomId,
            userId: socket.data.userId,
          },
        });

        if (!participant) {
          socket.emit('error', { message: 'Not a participant of this chat room' });
          return;
        }

        // Block enforcement: refuse if either party has blocked the other
        const otherParticipants = await prisma.chatParticipant.findMany({
          where: { chatRoomId: roomId, userId: { not: socket.data.userId! } },
          select: { userId: true },
        });
        const otherIds = otherParticipants.map((p) => p.userId);
        if (otherIds.length > 0) {
          const block = await prisma.userBlock.findFirst({
            where: {
              OR: [
                { blockerId: socket.data.userId!, blockedId: { in: otherIds } },
                { blockerId: { in: otherIds }, blockedId: socket.data.userId! },
              ],
            },
          });
          if (block) {
            socket.emit('error', { message: 'Messaging is blocked between these users', code: 'BLOCKED' });
            return;
          }
        }

        // Sanitize message content — strip all HTML tags
        const sanitizedContent = sanitizeHtml(content ?? '', {
          allowedTags: [],
          allowedAttributes: {},
        }).trim();

        if (!sanitizedContent) {
          socket.emit('error', { message: 'Message content is empty' });
          return;
        }

        // Create message in database
        const message = await prisma.chatMessage.create({
          data: {
            chatRoomId: roomId,
            senderId: socket.data.userId!,
            content: sanitizedContent,
            type: type as any,
            imageUrl: imageUrl || null,
            latitude: typeof latitude === 'number' ? latitude : null,
            longitude: typeof longitude === 'number' ? longitude : null,
            address: address || null,
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        });

        // Broadcast to everyone inside the chat room (e.g. both phones in ChatDetailScreen)
        io.to(`chat:${roomId}`).emit('new_message', message);

        // Get other participants
        const participants = await prisma.chatParticipant.findMany({
          where: {
            chatRoomId: roomId,
            userId: { not: socket.data.userId },
          },
          include: {
            user: { select: { id: true, pushToken: true } },
          },
        });

        for (const p of participants) {
          // Also emit to the recipient's personal room so MessagesScreen updates
          // even when they are not inside the ChatDetailScreen
          io.to(`user:${p.userId}`).emit('new_message', message);
          io.to(`user:${p.userId}`).emit('conversations_updated');

          const userSockets = io.sockets.adapter.rooms.get(`user:${p.userId}`);
          if (!userSockets?.size) {
            // User is fully offline — send push notification
            await sendPushNotification(
              p.userId,
              'New Message',
              sanitizedContent.substring(0, 100),
              { type: 'chat', roomId }
            );
          }
        }
      } catch (error) {
        logger.error('Error sending message', { error: String(error) });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Typing indicators — max 5 per 10s
    socket.on('typing', ({ roomId }) => {
      if (!checkRateLimit(typingRateLimits, socket.data.userId!, TYPING_LIMIT, TYPING_WINDOW)) return;
      socket.to(`chat:${roomId}`).emit('user_typing', {
        userId: socket.data.userId,
        roomId,
      });
    });

    socket.on('stop_typing', ({ roomId }) => {
      socket.to(`chat:${roomId}`).emit('user_stop_typing', {
        userId: socket.data.userId,
        roomId,
      });
    });

    // Mark messages as read — max 30 per minute
    socket.on('mark_read', async ({ roomId }) => {
      if (!checkRateLimit(markReadRateLimits, socket.data.userId!, MARK_READ_LIMIT, MARK_READ_WINDOW)) return;
      try {
        await prisma.chatMessage.updateMany({
          where: {
            chatRoomId: roomId,
            senderId: { not: socket.data.userId },
            readAt: null,
          },
          data: {
            readAt: new Date(),
          },
        });

        io.to(`chat:${roomId}`).emit('messages_read', {
          roomId,
          userId: socket.data.userId,
        });
      } catch (error) {
        logger.error('Error marking messages as read', { error: String(error) });
      }
    });

    // ── Tracking room handlers ──────────────────────────────────────────────
    // Sender + traveler each join `deal:${dealId}` to receive live tracking.
    // The traveler additionally pushes GPS positions over the same socket.
    registerTrackingHandlers(socket);

    // Disconnect — clean up heartbeat resources to prevent memory leaks
    socket.on('disconnect', () => {
      clearInterval(pingIntervalId);
      if (pongTimeoutId) clearTimeout(pongTimeoutId);
      logger.info(`User ${socket.data.userId} disconnected`);
    });
  });

  return io;
}

// --- Tracking socket plumbing ------------------------------------------------
// Imported lazily to avoid a circular import (tracking.service imports getIO()).
function registerTrackingHandlers(socket: AuthSocket): void {
  // Lazy require so this module's load order doesn't matter.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { dealRoom, TRACKING_EVENTS } = require('./tracking/tracking.events');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const trackingService = require('./tracking/tracking.service');

  socket.on(TRACKING_EVENTS.JOIN_DEAL, async ({ dealId }: { dealId: string }) => {
    if (!dealId || typeof dealId !== 'string') return;
    try {
      const deal = await prisma.deal.findUnique({
        where: { id: dealId },
        select: { senderId: true, travelerId: true },
      });
      if (!deal) return;
      const uid = socket.data.userId;
      if (deal.senderId !== uid && deal.travelerId !== uid) return;
      socket.join(dealRoom(dealId));
      const session = await trackingService.getTrackingSession(uid, dealId).catch(() => null);
      socket.emit(TRACKING_EVENTS.PONG, {
        dealId,
        session,
        serverTime: Date.now(),
      });
    } catch (err) {
      logger.warn('tracking join_deal failed', { error: String(err) });
    }
  });

  socket.on(TRACKING_EVENTS.LEAVE_DEAL, ({ dealId }: { dealId: string }) => {
    if (!dealId) return;
    socket.leave(dealRoom(dealId));
  });

  socket.on(TRACKING_EVENTS.GPS_POSITION, async (payload: any) => {
    const uid = socket.data.userId;
    if (!uid || !payload?.dealId) return;
    try {
      await trackingService.pushGPSPosition(uid, payload.dealId, {
        lat:       payload.lat,
        lng:       payload.lng,
        accuracy:  payload.accuracy,
        heading:   payload.heading ?? null,
        speed:     payload.speed ?? null,
        altitude:  payload.altitude ?? null,
        timestamp: payload.timestamp ?? Date.now(),
      });
    } catch (err: any) {
      socket.emit(TRACKING_EVENTS.ERROR, {
        dealId: payload.dealId,
        code:   err?.status === 403 ? 'forbidden' : 'gps_push_failed',
        message: err?.message ?? 'Failed to push GPS position',
      });
    }
  });

  socket.on(TRACKING_EVENTS.PING, async ({ dealId }: { dealId: string }) => {
    if (!dealId) return;
    const session = await trackingService
      .getTrackingSession(socket.data.userId, dealId)
      .catch(() => null);
    socket.emit(TRACKING_EVENTS.PONG, { dealId, session, serverTime: Date.now() });
  });
}
