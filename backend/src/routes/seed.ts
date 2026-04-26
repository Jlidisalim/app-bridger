/**
 * Seed Route — Development only
 * POST /seed  →  populates DB with realistic fake data for UI testing
 */
import { Router } from 'express';
import { prisma } from '../config/db';
import config from '../config/env';

const router = Router();

router.post('/', async (req, res) => {
  if (config.server.nodeEnv !== 'development') {
    return res.status(403).json({ error: 'Seed only available in development' });
  }

  try {
    // ── 1. Create seed users ────────────────────────────────────────────
    const users = await Promise.all([
      prisma.user.upsert({
        where: { phone: '+21600000001' },
        update: {},
        create: {
          phone: '+21600000001',
          name: 'Ahmed Ben Ali',
          email: 'ahmed@example.com',
          verified: true,
          kycStatus: 'APPROVED',
          faceVerificationStatus: 'VERIFIED',
          walletBalance: 240.5,
          rating: 4.9,
          completionRate: 97,
          totalDeals: 43,
        },
      }),
      prisma.user.upsert({
        where: { phone: '+21600000002' },
        update: {},
        create: {
          phone: '+21600000002',
          name: 'Sara Mansouri',
          email: 'sara@example.com',
          verified: true,
          kycStatus: 'APPROVED',
          faceVerificationStatus: 'VERIFIED',
          walletBalance: 120.0,
          rating: 4.7,
          completionRate: 92,
          totalDeals: 18,
        },
      }),
      prisma.user.upsert({
        where: { phone: '+21600000003' },
        update: {},
        create: {
          phone: '+21600000003',
          name: 'Mohamed Khalil',
          email: 'moh@example.com',
          verified: true,
          kycStatus: 'APPROVED',
          faceVerificationStatus: 'VERIFIED',
          walletBalance: 75.0,
          rating: 4.5,
          completionRate: 88,
          totalDeals: 12,
        },
      }),
      prisma.user.upsert({
        where: { phone: '+21600000004' },
        update: {},
        create: {
          phone: '+21600000004',
          name: 'Leila Trabelsi',
          email: 'leila@example.com',
          verified: false,
          kycStatus: 'PENDING',
          walletBalance: 0,
          rating: 0,
          completionRate: 0,
          totalDeals: 0,
        },
      }),
    ]);

    const [ahmed, sara, mohamed] = users;

    // ── 2. Create deals ────────────────────────────────────────────────
    const existingDeals = await prisma.deal.count();
    let deals: any[] = [];

    if (existingDeals === 0) {
      deals = await Promise.all([
        prisma.deal.create({
          data: {
            senderId: ahmed.id,
            title: 'Laptop + accessories',
            description: 'MacBook Pro 14" + charger, well packed in original box',
            fromCity: 'TUN',
            toCity: 'CDG',
            fromCountry: 'TN',
            toCountry: 'FR',
            fromLat: 36.851,
            fromLng: 10.227,
            toLat: 49.009,
            toLng: 2.548,
            packageSize: 'MEDIUM',
            weight: 2.5,
            price: 120,
            currency: 'USD',
            status: 'OPEN',
            pickupDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
          },
        }),
        prisma.deal.create({
          data: {
            senderId: sara.id,
            title: 'Medical documents',
            description: 'Urgent medical files in a sealed envelope',
            fromCity: 'TUN',
            toCity: 'LHR',
            fromCountry: 'TN',
            toCountry: 'GB',
            fromLat: 36.851,
            fromLng: 10.227,
            toLat: 51.477,
            toLng: -0.461,
            packageSize: 'SMALL',
            weight: 0.3,
            price: 60,
            currency: 'USD',
            status: 'OPEN',
            pickupDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          },
        }),
        prisma.deal.create({
          data: {
            senderId: ahmed.id,
            travelerId: sara.id,
            title: 'Clothing & gifts',
            description: 'Family gifts for Eid, 2 bags of clothing',
            fromCity: 'CDG',
            toCity: 'JFK',
            fromCountry: 'FR',
            toCountry: 'US',
            fromLat: 49.009,
            fromLng: 2.548,
            toLat: 40.641,
            toLng: -73.778,
            packageSize: 'LARGE',
            weight: 8.0,
            price: 200,
            currency: 'USD',
            status: 'IN_TRANSIT',
            pickupDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
          },
        }),
        prisma.deal.create({
          data: {
            senderId: mohamed.id,
            title: 'Phone + case',
            description: 'iPhone 15 Pro Max in sealed box',
            fromCity: 'DXB',
            toCity: 'TUN',
            fromCountry: 'AE',
            toCountry: 'TN',
            fromLat: 25.253,
            fromLng: 55.365,
            toLat: 36.851,
            toLng: 10.227,
            packageSize: 'SMALL',
            weight: 0.5,
            price: 80,
            currency: 'USD',
            status: 'OPEN',
            pickupDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          },
        }),
        prisma.deal.create({
          data: {
            senderId: sara.id,
            travelerId: ahmed.id,
            title: 'Electronics components',
            description: 'Arduino kits and sensors for university project',
            fromCity: 'AMS',
            toCity: 'TUN',
            fromCountry: 'NL',
            toCountry: 'TN',
            fromLat: 52.309,
            fromLng: 4.764,
            toLat: 36.851,
            toLng: 10.227,
            packageSize: 'MEDIUM',
            weight: 1.8,
            price: 95,
            currency: 'USD',
            status: 'MATCHED',
            pickupDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
          },
        }),
      ]);
    }

    // ── 3. Create trips ────────────────────────────────────────────────
    const existingTrips = await prisma.trip.count();
    if (existingTrips === 0) {
      await Promise.all([
        prisma.trip.create({
          data: {
            travelerId: ahmed.id,
            fromCity: 'TUN',
            toCity: 'CDG',
            fromCountry: 'TN',
            toCountry: 'FR',
            departureDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
            departureTime: '08:30',
            flightNumber: 'TU742',
            maxWeight: 10,
            price: 15,
            currency: 'USD',
            negotiable: true,
            status: 'OPEN',
          },
        }),
        prisma.trip.create({
          data: {
            travelerId: sara.id,
            fromCity: 'CDG',
            toCity: 'TUN',
            fromCountry: 'FR',
            toCountry: 'TN',
            departureDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            departureTime: '14:15',
            flightNumber: 'AF1234',
            maxWeight: 8,
            price: 12,
            currency: 'USD',
            negotiable: false,
            status: 'OPEN',
          },
        }),
        prisma.trip.create({
          data: {
            travelerId: mohamed.id,
            fromCity: 'DXB',
            toCity: 'TUN',
            fromCountry: 'AE',
            toCountry: 'TN',
            departureDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
            departureTime: '22:00',
            flightNumber: 'EK742',
            maxWeight: 15,
            price: 20,
            currency: 'USD',
            negotiable: true,
            status: 'OPEN',
          },
        }),
      ]);
    }

    // ── 4. Create chat room + messages for the IN_TRANSIT deal ────────
    const transitDeal = deals.find((d) => d?.status === 'IN_TRANSIT');
    if (transitDeal) {
      const existingRoom = await prisma.chatRoom.findUnique({
        where: { dealId: transitDeal.id },
      });

      if (!existingRoom) {
        const room = await prisma.chatRoom.create({
          data: {
            dealId: transitDeal.id,
            participants: {
              create: [
                { userId: ahmed.id },
                { userId: sara.id },
              ],
            },
          },
        });

        await prisma.chatMessage.createMany({
          data: [
            {
              chatRoomId: room.id,
              senderId: ahmed.id,
              content: 'Hi Sara! Just confirming the pickup for tomorrow morning.',
              type: 'TEXT',
              createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            },
            {
              chatRoomId: room.id,
              senderId: sara.id,
              content: 'Perfect! I\'ll be at Tunis-Carthage airport at 7am. Gate C.',
              type: 'TEXT',
              createdAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
            },
            {
              chatRoomId: room.id,
              senderId: ahmed.id,
              content: 'The package is 2.5kg, fragile — please keep it upright. I packed it well.',
              type: 'TEXT',
              createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
            },
            {
              chatRoomId: room.id,
              senderId: sara.id,
              content: 'No problem, I\'ll be careful. Is the box labeled?',
              type: 'TEXT',
              createdAt: new Date(Date.now() - 30 * 60 * 1000),
            },
            {
              chatRoomId: room.id,
              senderId: ahmed.id,
              content: '✅ Yes, your name is on it. I\'ll send you the QR code before pickup.',
              type: 'TEXT',
              createdAt: new Date(Date.now() - 15 * 60 * 1000),
            },
          ],
        });
      }
    }

    // ── 5. Create wallet transactions ──────────────────────────────────
    const existingTx = await prisma.transaction.count({ where: { userId: ahmed.id } });
    if (existingTx === 0) {
      await prisma.transaction.createMany({
        data: [
          {
            userId: ahmed.id,
            type: 'DEPOSIT',
            amount: 300,
            currency: 'USD',
            status: 'COMPLETED',
            metadata: JSON.stringify({ source: 'stripe', description: 'Wallet top-up' }),
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          },
          {
            userId: ahmed.id,
            type: 'ESCROW_HOLD',
            amount: -120,
            currency: 'USD',
            status: 'COMPLETED',
            metadata: JSON.stringify({ description: 'Escrow for TUN→CDG deal' }),
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          },
          {
            userId: ahmed.id,
            type: 'ESCROW_RELEASE',
            amount: 60.5,
            currency: 'USD',
            status: 'COMPLETED',
            metadata: JSON.stringify({ description: 'Payment received for completed delivery' }),
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
          },
        ],
      });
    }

    // ── 6. Create a review ─────────────────────────────────────────────
    const completedDeal = await prisma.deal.findFirst({ where: { status: 'IN_TRANSIT' } });
    if (completedDeal) {
      const existingReview = await prisma.review.findFirst({
        where: { dealId: completedDeal.id, authorId: ahmed.id },
      });
      if (!existingReview) {
        await prisma.review.create({
          data: {
            dealId: completedDeal.id,
            authorId: ahmed.id,
            targetId: sara.id,
            rating: 5,
            comment: 'Sara was amazing! Very professional, delivered on time with no issues. Highly recommended!',
            sentiment: 'positive',
            fraudScore: 0.02,
            flagged: false,
            status: 'approved',
          },
        });
      }
    }

    return res.json({
      success: true,
      message: 'Seed data created',
      data: {
        users: users.length,
        deals: deals.length || '(already existed)',
        trips: existingTrips === 0 ? 3 : '(already existed)',
        chat: transitDeal ? 'created' : 'skipped',
      },
    });
  } catch (error: any) {
    console.error('Seed error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
