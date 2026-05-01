// Chat Routes
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { sendMessageSchema } from '../validators/auth';
import { prisma } from '../config/db';
import { getIO } from '../services/websocket';
import { saveBuffer } from '../services/uploadService';

const router = Router();

const CHAT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const chatImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    if (CHAT_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  },
});

// POST /chat/upload - Upload an image attachment, returns the public URL.
// Client then sends a message with type=IMAGE and imageUrl set to the returned url.
router.post('/upload', authenticate, chatImageUpload.single('image'), async (req: any, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'image file is required (field: image)' });
    }
    const url = await saveBuffer(req.file.buffer, req.file.mimetype, 'chat', `chat_${req.user.id}`);
    res.json({ success: true, url });
  } catch (error: any) {
    if (error?.message?.includes('Only JPEG')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

// GET /chat/rooms - List chat rooms
// OPTIMIZATION: unread counts fetched in a single groupBy query instead of
// one count() per room (avoids N+1: 1 query total regardless of room count).
router.get('/rooms', authenticate, async (req: any, res, next) => {
  try {
    const rooms = await prisma.chatParticipant.findMany({
      where: { userId: req.user.id },
      include: {
        chatRoom: {
          include: {
            deal: {
              select: { id: true, title: true, fromCity: true, toCity: true }
            },
            trip: {
              select: { id: true, fromCity: true, toCity: true, departureDate: true }
            },
            participants: {
              include: {
                user: {
                  select: { id: true, name: true, avatar: true, profilePhoto: true }
                }
              }
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: {
                  select: { id: true, name: true, avatar: true, profilePhoto: true }
                }
              }
            }
          }
        }
      }
    });

    if (rooms.length === 0) {
      return res.json([]);
    }

    const roomIds = rooms.map((p) => p.chatRoom.id);

    // Single groupBy query replaces N individual count() calls
    const unreadGroups = await prisma.chatMessage.groupBy({
      by: ['chatRoomId'],
      where: {
        chatRoomId: { in: roomIds },
        senderId: { not: req.user.id },
        readAt: null,
      },
      _count: { id: true },
    });

    // Build O(1) lookup map: roomId → unread count
    const unreadMap = new Map<string, number>(
      unreadGroups.map((g) => [g.chatRoomId, g._count.id])
    );

    // DEV logging to verify single-query behaviour
    if (process.env.NODE_ENV === 'development') {
      console.log(`[chat/rooms] Fetched ${rooms.length} rooms in 2 queries (was ${rooms.length + 1})`);
    }

    const formattedRooms = rooms.map((p) => {
      // Exclude the current user so the list shows the OTHER person's info
      const otherParticipants = p.chatRoom.participants
        .filter(participant => participant.user.id !== req.user.id)
        .map(participant => ({
          id: participant.user.id,
          name: participant.user.name,
          avatar: participant.user.avatar,
          profilePhoto: participant.user.profilePhoto,
        }));

      // Get current user's info
      const currentUser = p.chatRoom.participants
        .find(participant => participant.user.id === req.user.id);

      // Get the other participant for conversation image
      const otherParticipant = otherParticipants[0];

      return {
        id: p.chatRoom.id,
        deal: p.chatRoom.deal,
        trip: p.chatRoom.trip,
        participants: otherParticipants.map(op => ({
          id: op.id,
          name: op.name,
          avatar: op.profilePhoto || op.avatar,
          profilePhoto: op.profilePhoto,
        })),
        currentUser: {
          id: currentUser?.user.id,
          name: currentUser?.user.name,
          avatar: currentUser?.user.profilePhoto || currentUser?.user.avatar,
          profilePhoto: currentUser?.user.profilePhoto,
        },
        conversationImage: otherParticipant?.profilePhoto || otherParticipant?.avatar || null,
        lastMessage: p.chatRoom.messages[0] ? {
          id: p.chatRoom.messages[0].id,
          content: p.chatRoom.messages[0].content,
          senderId: p.chatRoom.messages[0].senderId,
          sender: p.chatRoom.messages[0].sender,
          createdAt: p.chatRoom.messages[0].createdAt,
        } : null,
        // O(1) map lookup — no extra DB query per room
        unreadCount: unreadMap.get(p.chatRoom.id) ?? 0,
      };
    });

    res.json(formattedRooms);
  } catch (error) {
    next(error);
  }
});

// GET /chat/rooms/:id/messages - Get messages in a room
router.get('/rooms/:id/messages', authenticate, async (req: any, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Verify user is participant
    const participant = await prisma.chatParticipant.findFirst({
      where: {
        chatRoomId: req.params.id,
        userId: req.user.id
      }
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this room' });
    }

    const [items, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where: { chatRoomId: req.params.id },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: {
            select: { id: true, name: true, avatar: true, profilePhoto: true }
          },
          replyTo: {
            select: { id: true, content: true, sender: { select: { id: true, name: true, avatar: true, profilePhoto: true } } }
          }
        }
      }),
      prisma.chatMessage.count({ where: { chatRoomId: req.params.id } })
    ]);

    // Mark messages as read
    await prisma.chatMessage.updateMany({
      where: {
        chatRoomId: req.params.id,
        senderId: { not: req.user.id },
        readAt: null
      },
      data: { readAt: new Date() }
    });

    res.json({
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + take < total
    });
  } catch (error) {
    next(error);
  }
});

// POST /chat/rooms/:id/messages - Send a message (or reply)
router.post('/rooms/:id/messages', authenticate, validate(sendMessageSchema), async (req: any, res, next) => {
  try {
    const { content, type = 'TEXT', replyToId, imageUrl, latitude, longitude, address } = req.validated || req.body;

    // Verify user is participant
    const participant = await prisma.chatParticipant.findFirst({
      where: {
        chatRoomId: req.params.id,
        userId: req.user.id
      }
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not a participant in this room' });
    }

    // Block enforcement: refuse if either party has blocked the other
    const otherParticipants = await prisma.chatParticipant.findMany({
      where: { chatRoomId: req.params.id, userId: { not: req.user.id } },
      select: { userId: true },
    });
    const otherIds = otherParticipants.map((p) => p.userId);
    if (otherIds.length > 0) {
      const block = await prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: req.user.id, blockedId: { in: otherIds } },
            { blockerId: { in: otherIds }, blockedId: req.user.id },
          ],
        },
      });
      if (block) {
        return res.status(403).json({ error: 'Messaging is blocked between these users', code: 'BLOCKED' });
      }
    }

    // Verify replyToId exists in this room if provided
    if (replyToId) {
      const parentMessage = await prisma.chatMessage.findFirst({
        where: { id: replyToId, chatRoomId: req.params.id }
      });
      if (!parentMessage) {
        return res.status(400).json({ error: 'Parent message not found in this room' });
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        chatRoomId: req.params.id,
        senderId: req.user.id,
        content,
        type,
        replyToId: replyToId || null,
        imageUrl: imageUrl || null,
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
        address: address || null,
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true, profilePhoto: true }
        },
        replyTo: {
          select: { id: true, content: true, sender: { select: { id: true, name: true, avatar: true, profilePhoto: true } } }
        }
      }
    });

    // Broadcast to room members inside ChatDetailScreen
    const io = getIO();
    if (io) {
      io.to(`chat:${req.params.id}`).emit('new_message', message);

      // Also notify each participant's personal room so MessagesScreen updates
      const others = await prisma.chatParticipant.findMany({
        where: { chatRoomId: req.params.id, userId: { not: req.user.id } },
        select: { userId: true },
      });
      for (const p of others) {
        io.to(`user:${p.userId}`).emit('new_message', message);
        io.to(`user:${p.userId}`).emit('conversations_updated');
      }
    }

    res.json(message);
  } catch (error) {
    next(error);
  }
});

// POST /chat/rooms - Get or create a unified chat thread for a user pair.
// Instead of creating one room per deal/trip, we find the most-recent room that
// already has BOTH users as participants.  This consolidates all conversations
// between the same Sender and Traveler into a single continuous thread,
// regardless of how many deals/trips they share.
// Accepts either { dealId } or { tripId } in the request body.
router.post('/rooms', authenticate, async (req: any, res, next) => {
  try {
    const { dealId, tripId } = req.body;

    if (!dealId && !tripId) {
      return res.status(400).json({ error: 'Either dealId or tripId is required' });
    }

    // Shared include shape for all room queries/creates
    const roomInclude = {
      participants: {
        include: {
          user: { select: { id: true, name: true, avatar: true, profilePhoto: true } },
        },
      },
      deal: { select: { id: true, title: true, fromCity: true, toCity: true } },
      trip: { select: { id: true, fromCity: true, toCity: true, departureDate: true } },
    };

    // Helper: find any existing room shared by exactly these two users
    async function findUserPairRoom(userIdA: string, userIdB: string) {
      return prisma.chatRoom.findFirst({
        where: {
          AND: [
            { participants: { some: { userId: userIdA } } },
            { participants: { some: { userId: userIdB } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: roomInclude,
      });
    }

    // Helper: ensure req.user is a participant in the returned room
    async function ensureParticipant(roomId: string) {
      const already = await prisma.chatParticipant.findFirst({
        where: { chatRoomId: roomId, userId: req.user.id },
      });
      if (!already) {
        await prisma.chatParticipant.create({
          data: { chatRoomId: roomId, userId: req.user.id },
        });
      }
    }

    // ── Trip-based unified thread ──────────────────────────────────
    if (tripId) {
      const trip = await prisma.trip.findUnique({ where: { id: tripId } });
      if (!trip) return res.status(404).json({ error: 'Trip not found' });

      // Determine user pair: trip owner + requesting user
      const ownerId = trip.travelerId;
      const requesterId = req.user.id;

      if (ownerId !== requesterId) {
        // Look for an existing room between these two users first
        const existing = await findUserPairRoom(ownerId, requesterId);
        if (existing) {
          await ensureParticipant(existing.id);
          return res.json(existing);
        }
      }

      // No existing user-pair room — create a new one linked to this trip
      // Fallback to unlinked room if the unique tripId constraint is violated
      let room: any;
      try {
        room = await prisma.chatRoom.create({
          data: {
            tripId,
            participants: {
              create: Array.from(new Set([ownerId, requesterId])).map((uid) => ({ userId: uid })),
            },
          },
          include: roomInclude,
        });
      } catch {
        room = await prisma.chatRoom.create({
          data: {
            participants: {
              create: Array.from(new Set([ownerId, requesterId])).map((uid) => ({ userId: uid })),
            },
          },
          include: roomInclude,
        });
      }
      return res.status(201).json(room);
    }

    // ── Deal-based unified thread ──────────────────────────────────
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Determine user pair: deal sender + requesting user (potential traveler)
    const senderId = deal.senderId;
    const requesterId = req.user.id;

    if (senderId !== requesterId) {
      // Look for any existing room between these two users (from any prior deal/trip)
      const existing = await findUserPairRoom(senderId, requesterId);
      if (existing) {
        await ensureParticipant(existing.id);
        return res.json(existing);
      }
    }

    // No existing user-pair room — create a new one, linked to this deal for context
    // Fallback to unlinked room if the unique dealId constraint is violated
    const participantIds = Array.from(
      new Set([senderId, requesterId, ...(deal.travelerId ? [deal.travelerId] : [])])
    );

    let room: any;
    try {
      room = await prisma.chatRoom.create({
        data: {
          dealId,
          participants: { create: participantIds.map((uid) => ({ userId: uid })) },
        },
        include: roomInclude,
      });
    } catch {
      room = await prisma.chatRoom.create({
        data: {
          participants: { create: participantIds.map((uid) => ({ userId: uid })) },
        },
        include: roomInclude,
      });
    }
    res.status(201).json(room);
  } catch (error) {
    next(error);
  }
});

// POST /chat/rooms/:id/read - Mark messages as read
router.post('/rooms/:id/read', authenticate, async (req: any, res, next) => {
  try {
    const participant = await prisma.chatParticipant.findFirst({
      where: { chatRoomId: req.params.id, userId: req.user.id },
    });
    if (!participant) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    await prisma.chatMessage.updateMany({
      where: {
        chatRoomId: req.params.id,
        senderId: { not: req.user.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
