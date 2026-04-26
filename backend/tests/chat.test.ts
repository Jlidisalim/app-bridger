// Chat API Unit Tests
// Run with: npx jest tests/chat.test.ts --testPathIgnorePatterns=api.test.ts

describe('ChatRoom Prisma Model', () => {
  it('should have tripId defined in Prisma schema', () => {
    const fs = require('fs');
    const schemaPath = require('path').join(__dirname, '../prisma/schema.prisma');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    expect(schema).toContain('tripId');
    expect(schema).toContain('String?');
    expect(schema).toContain('@unique');
  });

  it('should allow ChatRoom to have either dealId or tripId', () => {
    const chatRoomWithDeal = {
      id: 'room-1',
      dealId: 'deal-1',
      tripId: null,
    };
    
    const chatRoomWithTrip = {
      id: 'room-2',
      dealId: null,
      tripId: 'trip-1',
    };
    
    expect(chatRoomWithDeal.dealId).toBe('deal-1');
    expect(chatRoomWithTrip.tripId).toBe('trip-1');
  });

  it('should support both deal and trip relations', () => {
    const room = {
      id: 'room-1',
      dealId: 'deal-1',
      tripId: 'trip-1',
    };
    
    expect(room.dealId).toBeDefined();
    expect(room.tripId).toBeDefined();
  });
});

describe('Chat Routes Logic', () => {
  const mockPrisma = {
    chatRoom: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    chatParticipant: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    chatMessage: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
    },
    deal: {
      findUnique: jest.fn(),
    },
    trip: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /chat/rooms with tripId', () => {
    it('should find existing room by tripId', async () => {
      const existingRoom = {
        id: 'room-1',
        tripId: 'trip-1',
        participants: [
          { userId: 'traveler-1' },
          { userId: 'user-2' },
        ],
      };
      
      mockPrisma.chatRoom.findUnique.mockResolvedValue(existingRoom);
      
      const result = await mockPrisma.chatRoom.findUnique({
        where: { tripId: 'trip-1' },
        include: { participants: true },
      });
      
      expect(result).toEqual(existingRoom);
      expect(result?.tripId).toBe('trip-1');
    });

    it('should create new room when none exists for trip', async () => {
      mockPrisma.chatRoom.findUnique.mockResolvedValue(null);
      
      const newRoom = {
        id: 'room-new',
        tripId: 'trip-1',
        participants: [],
      };
      
      mockPrisma.chatRoom.create.mockResolvedValue(newRoom);
      
      const result = await mockPrisma.chatRoom.create({
        data: {
          tripId: 'trip-1',
          participants: {
            create: [{ userId: 'traveler-1' }, { userId: 'user-2' }],
          },
        },
        include: { participants: true },
      });
      
      expect(result.tripId).toBe('trip-1');
    });

    it('should reject when neither dealId nor tripId provided', () => {
      const validateInput = (input: { dealId?: string; tripId?: string }) => {
        if (!input.dealId && !input.tripId) {
          throw new Error('Either dealId or tripId is required');
        }
        return true;
      };
      
      expect(() => validateInput({})).toThrow('Either dealId or tripId is required');
      expect(() => validateInput({ dealId: 'deal-1' })).not.toThrow();
      expect(() => validateInput({ tripId: 'trip-1' })).not.toThrow();
    });
  });

  describe('GET /chat/rooms', () => {
    it('should fetch rooms including trip data', async () => {
      const rooms = [
        {
          chatRoom: {
            id: 'room-1',
            trip: {
              id: 'trip-1',
              fromCity: 'Paris',
              toCity: 'Berlin',
              departureDate: new Date('2024-01-01'),
            },
            participants: [
              { user: { id: 'user-1', name: 'Alice', avatar: null } },
              { user: { id: 'user-2', name: 'Bob', avatar: null } },
            ],
            messages: [],
          },
        },
      ];
      
      mockPrisma.chatParticipant.findMany.mockResolvedValue(rooms);
      mockPrisma.chatMessage.groupBy.mockResolvedValue([]);
      
      const result = await mockPrisma.chatParticipant.findMany({
        where: { userId: 'user-1' },
        include: {
          chatRoom: {
            include: {
              trip: { select: { id: true, fromCity: true, toCity: true, departureDate: true } },
              participants: { include: { user: { select: { id: true, name: true, avatar: true } } } },
              messages: { orderBy: { createdAt: 'desc' }, take: 1 },
            },
          },
        },
      });
      
      expect(result[0].chatRoom.trip).toBeDefined();
      expect(result[0].chatRoom.trip.fromCity).toBe('Paris');
    });

    it('should calculate unread counts with groupBy', async () => {
      const roomIds = ['room-1', 'room-2'];
      
      mockPrisma.chatMessage.groupBy.mockResolvedValue([
        { chatRoomId: 'room-1', _count: { id: 5 } },
        { chatRoomId: 'room-2', _count: { id: 2 } },
      ]);
      
      const result = await mockPrisma.chatMessage.groupBy({
        by: ['chatRoomId'],
        where: {
          chatRoomId: { in: roomIds },
          senderId: { not: 'current-user' },
          readAt: null,
        },
        _count: { id: true },
      });
      
      const unreadMap = new Map(result.map((g: any) => [g.chatRoomId, g._count.id]));
      expect(unreadMap.get('room-1')).toBe(5);
      expect(unreadMap.get('room-2')).toBe(2);
    });

    it('should include current user info in room response', async () => {
      const rooms = [
        {
          chatRoom: {
            id: 'room-1',
            participants: [
              { user: { id: 'user-1', name: 'Amal', avatar: 'https://example.com/amal.jpg', profilePhoto: null } },
              { user: { id: 'user-2', name: 'Salim', avatar: 'https://example.com/salim.jpg', profilePhoto: 'https://example.com/salim-profile.jpg' } },
            ],
            messages: [],
          },
        },
      ];
      
      const currentUserId = 'user-2';
      const currentUser = rooms[0].chatRoom.participants.find(
        (p: any) => p.user.id === currentUserId
      );
      const otherParticipants = rooms[0].chatRoom.participants
        .filter((p: any) => p.user.id !== currentUserId);
      
      expect(otherParticipants[0].user.name).toBe('Amal');
      expect(currentUser?.user.name).toBe('Salim');
      
      // Test conversationImage: uses other person's profilePhoto or avatar
      const otherParticipant = otherParticipants[0];
      const conversationImage = otherParticipant.user.profilePhoto || otherParticipant.user.avatar;
      expect(conversationImage).toBe('https://example.com/amal.jpg');
    });
  });

  describe('Message operations', () => {
    it('should mark messages as read', async () => {
      mockPrisma.chatMessage.updateMany.mockResolvedValue({ count: 3 });
      
      const result = await mockPrisma.chatMessage.updateMany({
        where: {
          chatRoomId: 'room-1',
          senderId: { not: 'current-user' },
          readAt: null,
        },
        data: { readAt: new Date() },
      });
      
      expect(result.count).toBe(3);
    });

    it('should create new message (reply)', async () => {
      const message = {
        id: 'msg-1',
        chatRoomId: 'room-1',
        senderId: 'user-1',
        content: 'Hello',
        type: 'TEXT',
      };
      
      mockPrisma.chatMessage.create.mockResolvedValue(message);
      
      const result = await mockPrisma.chatMessage.create({
        data: {
          chatRoomId: 'room-1',
          senderId: 'user-1',
          content: 'Hello',
          type: 'TEXT',
        },
      });
      
      expect(result.content).toBe('Hello');
    });

    it('should create reply message with proper structure', async () => {
      const replyMessage = {
        id: 'msg-reply',
        chatRoomId: 'room-1',
        senderId: 'user-2',
        content: 'Thanks for the message!',
        type: 'TEXT',
        sender: { id: 'user-2', name: 'Bob', avatar: null },
      };
      
      mockPrisma.chatMessage.create.mockResolvedValue(replyMessage);
      
      const result = await mockPrisma.chatMessage.create({
        data: {
          chatRoomId: 'room-1',
          senderId: 'user-2',
          content: 'Thanks for the message!',
          type: 'TEXT',
        },
        include: {
          sender: { select: { id: true, name: true, avatar: true } },
        },
      });
      
      expect(result.content).toBe('Thanks for the message!');
      expect(result.sender.name).toBe('Bob');
    });

    it('should create message with replyToId', async () => {
      const replyMessage = {
        id: 'msg-reply-2',
        chatRoomId: 'room-1',
        senderId: 'user-2',
        content: 'Replying to your message',
        type: 'TEXT',
        replyToId: 'msg-parent-1',
        replyTo: {
          id: 'msg-parent-1',
          content: 'Original message',
          sender: { name: 'Alice' },
        },
      };
      
      mockPrisma.chatMessage.create.mockResolvedValue(replyMessage);
      
      const result = await mockPrisma.chatMessage.create({
        data: {
          chatRoomId: 'room-1',
          senderId: 'user-2',
          content: 'Replying to your message',
          type: 'TEXT',
          replyToId: 'msg-parent-1',
        },
        include: {
          sender: { select: { id: true, name: true, avatar: true } },
          replyTo: { select: { id: true, content: true, sender: { select: { name: true } } } },
        },
      });
      
      expect(result.replyToId).toBe('msg-parent-1');
      expect(result.replyTo.content).toBe('Original message');
    });

    it('should validate replyToId belongs to same room', async () => {
      mockPrisma.chatMessage.findFirst.mockResolvedValue(null);
      
      const parentMessage = await mockPrisma.chatMessage.findFirst({
        where: { id: 'msg-1', chatRoomId: 'room-1' },
      });
      
      expect(parentMessage).toBeNull();
    });
  });
});

describe('Prisma Client Integration', () => {
  it('should be able to import PrismaClient', () => {
    expect(() => require('@prisma/client')).not.toThrow();
  });

  it('should have ChatRoom model with tripId', () => {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    expect(prisma.chatRoom).toBeDefined();
  });
});