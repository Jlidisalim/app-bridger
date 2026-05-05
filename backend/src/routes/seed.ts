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

    // ── 7. Extra users — wider variety for KPIs / KYC / moderation ─────
    const extraUserSpecs = [
      { phone: '+21600000005', name: 'Yassine Hammami',     email: 'yassine@example.com',     kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.8, completionRate: 95, totalDeals: 27, walletBalance: 410.0 },
      { phone: '+21600000006', name: 'Nadia Bouzid',        email: 'nadia@example.com',       kycStatus: 'SUBMITTED', faceVerificationStatus: 'PENDING',  verified: false, rating: 4.2, completionRate: 80, totalDeals: 5,  walletBalance: 35.0  },
      { phone: '+21600000007', name: 'Karim El Fassi',      email: 'karim@example.com',       kycStatus: 'REJECTED',  faceVerificationStatus: 'FAILED',   verified: false, rating: 2.1, completionRate: 30, totalDeals: 3,  walletBalance: 0,    flagged: true },
      { phone: '+21600000008', name: 'Fatma Zayed',         email: 'fatma@example.com',       kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.9, completionRate: 99, totalDeals: 61, walletBalance: 880.5 },
      { phone: '+21600000009', name: 'Hichem Sassi',        email: 'hichem@example.com',      kycStatus: 'PENDING',   faceVerificationStatus: 'PENDING',  verified: false, rating: 0,   completionRate: 0,  totalDeals: 0,  walletBalance: 0    },
      { phone: '+21600000010', name: 'Iheb Marzouki',       email: 'iheb@example.com',        kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 1.5, completionRate: 40, totalDeals: 8,  walletBalance: 0,    banned: true, reasonForBan: 'Repeated chargebacks and unresolved disputes' },
      { phone: '+21600000011', name: "O'Connor Müller",     email: 'oconnor@example.com',     kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.6, completionRate: 91, totalDeals: 17, walletBalance: 220.0 },
      { phone: '+21600000012', name: '陈伟 (Chen Wei)',      email: 'chen.wei@example.com',    kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.7, completionRate: 93, totalDeals: 22, walletBalance: 305.75 },
      { phone: '+21600000013', name: 'Иван Петров',         email: 'ivan.p@example.ru',       kycStatus: 'SUBMITTED', faceVerificationStatus: 'PENDING',  verified: false, rating: 4.0, completionRate: 75, totalDeals: 4,  walletBalance: 12.5  },
      { phone: '+21600000014', name: 'Aïcha Ben Salem',     email: 'aicha@example.com',       kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 5.0, completionRate: 100,totalDeals: 9,  walletBalance: 145.0 },
      { phone: '+21600000015', name: null,                  email: null,                       kycStatus: 'PENDING',   faceVerificationStatus: 'PENDING',  verified: false, rating: 0,   completionRate: 0,  totalDeals: 0,  walletBalance: 0    },
    ] as const;

    const extraUsers = await Promise.all(
      extraUserSpecs.map((u) =>
        prisma.user.upsert({
          where: { phone: u.phone },
          update: {},
          create: u as any,
        }),
      ),
    );

    const allUsers = [ahmed, sara, mohamed, ...extraUsers];
    const verifiedUsers = allUsers.filter((u) => u.verified);
    const pickUser = (i: number) => verifiedUsers[i % verifiedUsers.length];

    // ── 8. Extra deals — cover every status the dashboard charts ───────
    const dealsByStatusCount = await prisma.deal.count({
      where: { status: { in: ['DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'PICKED_UP'] } },
    });

    let extraDealsCreated = 0;
    if (dealsByStatusCount === 0) {
      const dealMatrix = [
        { status: 'COMPLETED', from: ['TUN', 'TN', 36.851, 10.227],  to: ['CDG', 'FR', 49.009,  2.548],  size: 'MEDIUM', price: 110, weight: 2.0,  title: 'Books and family photos' },
        { status: 'COMPLETED', from: ['CDG', 'FR', 49.009,  2.548],  to: ['JFK', 'US', 40.641, -73.778], size: 'LARGE',  price: 240, weight: 7.5,  title: 'Wedding gifts' },
        { status: 'DELIVERED', from: ['LHR', 'GB', 51.477, -0.461],  to: ['DXB', 'AE', 25.253, 55.365],  size: 'SMALL',  price: 70,  weight: 0.6,  title: 'Legal documents' },
        { status: 'PICKED_UP', from: ['TUN', 'TN', 36.851, 10.227],  to: ['MAD', 'ES', 40.472, -3.561],  size: 'MEDIUM', price: 90,  weight: 1.7,  title: 'Handmade ceramics — fragile' },
        { status: 'CANCELLED', from: ['JFK', 'US', 40.641, -73.778], to: ['TUN', 'TN', 36.851, 10.227],  size: 'LARGE',  price: 180, weight: 6.0,  title: 'Returned electronics', cancelReason: 'Sender no-show' },
        { status: 'DISPUTED',  from: ['DXB', 'AE', 25.253, 55.365],  to: ['CDG', 'FR', 49.009,  2.548],  size: 'SMALL',  price: 130, weight: 0.4,  title: 'Watch — disputed condition' },
        { status: 'OPEN',      from: ['BCN', 'ES', 41.297,  2.078],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'EXTRA_LARGE', price: 350, weight: 18.0, title: 'Bicycle — boxed' },
        { status: 'OPEN',      from: ['CMN', 'MA', 33.367, -7.589],  to: ['CDG', 'FR', 49.009,  2.548],  size: 'SMALL',  price: 55,  weight: 0.3,  title: 'Spices and tea' },
        { status: 'MATCHED',   from: ['IST', 'TR', 41.275, 28.751],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'MEDIUM', price: 100, weight: 2.2,  title: 'Textile samples' },
        { status: 'OPEN',      from: ['FCO', 'IT', 41.804, 12.250],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'SMALL',  price: 45,  weight: 0.5,  title: 'Replacement camera lens' },
      ] as const;

      for (let i = 0; i < dealMatrix.length; i++) {
        const m = dealMatrix[i];
        const sender = pickUser(i);
        const traveler = m.status === 'OPEN' ? null : pickUser(i + 3);
        if (traveler && traveler.id === sender.id) continue;
        const createdAt = new Date(Date.now() - (i + 1) * 36 * 60 * 60 * 1000);
        await prisma.deal.create({
          data: {
            senderId: sender.id,
            travelerId: traveler?.id ?? null,
            title: m.title,
            description: `${m.title} — auto-seeded for dashboard testing.`,
            fromCity: m.from[0] as string, fromCountry: m.from[1] as string,
            fromLat: m.from[2] as number,  fromLng: m.from[3] as number,
            toCity:   m.to[0]   as string, toCountry:   m.to[1]   as string,
            toLat:    m.to[2]   as number, toLng:       m.to[3]   as number,
            packageSize: m.size,
            isFragile: m.title.toLowerCase().includes('fragile'),
            itemValue: m.price * 5,
            weight: m.weight,
            price: m.price,
            currency: 'USD',
            status: m.status,
            pickupDate:   new Date(Date.now() + (i - 2) * 24 * 60 * 60 * 1000),
            deliveryDate: m.status === 'COMPLETED' || m.status === 'DELIVERED'
              ? new Date(Date.now() - (i * 12) * 60 * 60 * 1000) : null,
            cancelledAt:    m.status === 'CANCELLED' ? new Date(Date.now() - i * 60 * 60 * 1000) : null,
            cancelledById:  m.status === 'CANCELLED' ? sender.id : null,
            cancelledByRole:m.status === 'CANCELLED' ? 'SENDER' : null,
            cancelReason:   (m as any).cancelReason ?? null,
            createdAt,
          },
        });
        extraDealsCreated++;
      }
    }

    // ── 9. Disputes (drives Disputes page + open-dispute KPI) ──────────
    let disputesCreated = 0;
    if ((await prisma.dispute.count()) === 0) {
      const disputedDeal = await prisma.deal.findFirst({ where: { status: 'DISPUTED' } });
      const completedSample = await prisma.deal.findFirst({ where: { status: 'COMPLETED' } });
      const targets = [
        disputedDeal && {
          deal: disputedDeal, type: 'ITEM_DAMAGED', status: 'EVIDENCE_SUBMITTED',
          reason: 'Watch face cracked on arrival',
          description: 'The receiver reports the watch face is cracked. Photos attached.',
        },
        completedSample && {
          deal: completedSample, type: 'NOT_DELIVERED', status: 'OPENED',
          reason: 'Package never arrived',
          description: 'Tracking shows DELIVERED but receiver never got it.',
        },
        completedSample && {
          deal: completedSample, type: 'WRONG_ITEM', status: 'ADMIN_REVIEWING',
          reason: 'Receiver got wrong item',
          description: 'Wrong package handed over — labels appear swapped.',
        },
      ].filter(Boolean) as any[];

      for (const t of targets) {
        const filer  = t.deal.senderId   ? await prisma.user.findUnique({ where: { id: t.deal.senderId   } }) : null;
        const against= t.deal.travelerId ? await prisma.user.findUnique({ where: { id: t.deal.travelerId } }) : pickUser(0);
        if (!filer || !against || filer.id === against.id) continue;
        await prisma.dispute.create({
          data: {
            dealId: t.deal.id,
            filerId: filer.id,
            againstId: against.id,
            disputeType: t.type,
            reason: t.reason,
            description: t.description,
            status: t.status,
            timeline: {
              create: [
                { eventType: 'OPENED',     actorId: filer.id, actorRole: 'FILER',  description: 'Dispute opened' },
                { eventType: 'EVIDENCE_ADDED', actorId: filer.id, actorRole: 'FILER', description: 'Photos uploaded' },
              ],
            },
          },
        });
        disputesCreated++;
      }
    }

    // ── 10. Admin tasks (drives Moderation Queue KPI) ──────────────────
    if ((await prisma.adminTask.count()) === 0) {
      const pendingKyc = await prisma.user.findFirst({ where: { kycStatus: 'PENDING' } });
      const flaggedReview = await prisma.review.findFirst({ where: { rating: { lte: 2 } } });
      await prisma.adminTask.createMany({
        data: [
          { type: 'KYC_REVIEW',    referenceId: pendingKyc?.id ?? 'unknown',    status: 'OPEN',        notes: 'New KYC submission awaiting reviewer.' },
          { type: 'DISPUTE_REVIEW',referenceId: 'dispute-pending',               status: 'IN_PROGRESS', notes: 'High-value dispute — escalated.' },
          { type: 'FRAUD_FLAG',    referenceId: 'tx-2025-0492',                  status: 'OPEN',        notes: 'Stripe risk score above threshold.' },
          { type: 'CONTENT_REPORT',referenceId: flaggedReview?.id ?? 'review-?', status: 'OPEN',        notes: 'Reported review — possible defamation.' },
        ],
      });
    }

    // ── 11. KYC documents (UserKycPreview / KYC audit page) ────────────
    if ((await prisma.kycDocument.count()) === 0) {
      const kycSamples = [
        { user: extraUsers[1], type: 'PASSPORT',        status: 'PENDING'  },
        { user: extraUsers[2], type: 'ID_CARD',         status: 'REJECTED' },
        { user: extraUsers[0], type: 'PASSPORT',        status: 'APPROVED' },
        { user: extraUsers[7], type: 'DRIVING_LICENSE', status: 'APPROVED' },
        { user: extraUsers[8], type: 'ID_CARD',         status: 'PENDING'  },
      ];
      for (const s of kycSamples) {
        await prisma.kycDocument.create({
          data: {
            userId: s.user.id,
            documentType: s.type,
            frontUrl: `https://placehold.co/600x400?text=${s.type}+front`,
            backUrl:  s.type !== 'PASSPORT' ? `https://placehold.co/600x400?text=${s.type}+back` : null,
            status: s.status,
          },
        });
      }
    }

    // ── 12. Reviews — varied ratings, one flagged for moderation ───────
    if ((await prisma.review.count()) < 4) {
      const dealsForReview = await prisma.deal.findMany({
        where: { status: { in: ['COMPLETED', 'DELIVERED'] } }, take: 4,
      });
      const reviewSpecs = [
        { rating: 5, sentiment: 'positive', fraudScore: 0.01, flagged: false, status: 'approved',           comment: 'Smooth handover, great communication.' },
        { rating: 4, sentiment: 'positive', fraudScore: 0.05, flagged: false, status: 'approved',           comment: 'Slightly late but item arrived intact.' },
        { rating: 2, sentiment: 'negative', fraudScore: 0.42, flagged: true,  status: 'pending_moderation', comment: 'Package opened. Will dispute — see ticket.' },
        { rating: 1, sentiment: 'negative', fraudScore: 0.78, flagged: true,  status: 'pending_moderation', comment: 'SCAM!!! Avoid this user, contact me on WhatsApp +0000' },
      ];
      for (let i = 0; i < dealsForReview.length && i < reviewSpecs.length; i++) {
        const d = dealsForReview[i];
        const author = pickUser(i);
        const target = pickUser(i + 1);
        if (author.id === target.id || author.id === d.senderId) continue;
        await prisma.review.create({
          data: { dealId: d.id, authorId: author.id, targetId: target.id, ...reviewSpecs[i] },
        });
      }
    }

    // ── 13. Wider transaction history (TransactionHistory page) ────────
    if ((await prisma.transaction.count()) < 8) {
      const txTypes = ['DEPOSIT', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'PAYMENT', 'WITHDRAWAL', 'REFUND'] as const;
      const txStatus = ['COMPLETED', 'COMPLETED', 'PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] as const;
      for (let i = 0; i < 12; i++) {
        const u = pickUser(i);
        await prisma.transaction.create({
          data: {
            userId: u.id,
            type: txTypes[i % txTypes.length],
            amount: [50, -120, 75.5, -80, 200, -45.25, 300, -25][i % 8],
            currency: ['USD','EUR','GBP'][i % 3],
            status: txStatus[i % txStatus.length],
            stripeId: i % 3 === 0 ? `pi_test_${1000 + i}` : null,
            metadata: JSON.stringify({ note: `Auto-seeded tx #${i + 1}` }),
            createdAt: new Date(Date.now() - i * 6 * 60 * 60 * 1000),
          },
        });
      }
    }

    // ── 14. Audit log entries (AuditLog page) ──────────────────────────
    if ((await prisma.auditLog.count()) < 10) {
      const actions = ['LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'LOGOUT', 'KYC_APPROVE', 'BAN'];
      const entities = ['USER', 'DEAL', 'TRANSACTION', 'DISPUTE', 'REVIEW'];
      for (let i = 0; i < 18; i++) {
        const u = allUsers[i % allUsers.length];
        await prisma.auditLog.create({
          data: {
            userId: u.id,
            entityType: entities[i % entities.length],
            entityId: `seed-entity-${i}`,
            action: actions[i % actions.length],
            ipAddress: `192.168.${i % 255}.${(i * 3) % 255}`,
            metadata: JSON.stringify({ ua: 'seed-script', n: i }),
            recordedAt: new Date(Date.now() - i * 2 * 60 * 60 * 1000),
          },
        });
      }
    }

    // ── 15. Pricing data points (PricingDataManager page) ──────────────
    if ((await prisma.pricingDataPoint.count()) < 6) {
      const pricingRows = [
        { distance: 1500, weight: 2.0, volume: 5000,  urgent: false, price: 95  },
        { distance: 5800, weight: 7.5, volume: 30000, urgent: false, price: 240 },
        { distance: 850,  weight: 0.6, volume: 1200,  urgent: true,  price: 110 },
        { distance: 2200, weight: 1.7, volume: 4000,  urgent: false, price: 105 },
        { distance: 9000, weight: 6.0, volume: 25000, urgent: true,  price: 380 },
        { distance: 600,  weight: 0.4, volume: 800,   urgent: false, price: 55  },
        { distance: 3300, weight: 18.0,volume: 80000, urgent: false, price: 360 },
      ];
      await prisma.pricingDataPoint.createMany({ data: pricingRows });
    }

    // ── 16. User reports (ContentModeration page) ──────────────────────
    if ((await prisma.userReport.count()) === 0) {
      await prisma.userReport.createMany({
        data: [
          { reporterId: sara.id,        reportedId: extraUsers[2].id, reason: 'SCAM',        description: 'Asked for payment outside the app.', status: 'PENDING' },
          { reporterId: ahmed.id,       reportedId: extraUsers[5].id, reason: 'HARASSMENT',  description: 'Aggressive messages after deal cancellation.', status: 'REVIEWING' },
          { reporterId: extraUsers[0].id, reportedId: extraUsers[2].id, reason: 'FAKE_LISTING', description: 'Listing photo lifted from another platform.', status: 'PENDING' },
        ],
      });
    }

    // ── 17. Notifications (so per-user nav bell shows realistic counts)
    if ((await prisma.notification.count()) < 6) {
      const notifSpecs = [
        { user: ahmed,         title: 'Deal matched',      body: 'Sara accepted your TUN→CDG shipment.', type: 'DEAL_MATCH' },
        { user: sara,          title: 'Payment received',  body: 'Escrow of $60.50 released to your wallet.', type: 'PAYMENT' },
        { user: extraUsers[0], title: 'KYC approved',      body: 'Your identity verification is complete.',  type: 'KYC' },
        { user: extraUsers[2], title: 'KYC rejected',      body: 'Document unclear. Please re-upload.',       type: 'KYC' },
        { user: extraUsers[5], title: 'Account suspended', body: 'Your account has been suspended.',          type: 'ADMIN', read: true },
        { user: ahmed,         title: 'New message',       body: 'You have a new message in your TUN→CDG chat.', type: 'CHAT' },
      ];
      for (const n of notifSpecs) {
        await prisma.notification.create({
          data: { userId: n.user.id, title: n.title, body: n.body, type: n.type, read: (n as any).read ?? false },
        });
      }
    }

    // ── 18. Extra users — broader demographic mix for analytics ────────
    const moreUserSpecs = [
      { phone: '+21600000016', name: 'Rim Cherif',          email: 'rim@example.com',        kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.4, completionRate: 89, totalDeals: 14, walletBalance: 195.0 },
      { phone: '+21600000017', name: 'Tarek Bouazizi',      email: 'tarek@example.com',      kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.6, completionRate: 92, totalDeals: 21, walletBalance: 312.50 },
      { phone: '+21600000018', name: 'Ines Kallel',         email: 'ines@example.com',       kycStatus: 'SUBMITTED', faceVerificationStatus: 'PENDING',  verified: false, rating: 0,   completionRate: 0,  totalDeals: 0,  walletBalance: 0 },
      { phone: '+21600000019', name: 'Bilel Mahmoudi',      email: 'bilel@example.com',      kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.8, completionRate: 96, totalDeals: 33, walletBalance: 540.0 },
      { phone: '+21600000020', name: 'Salma Werghi',        email: 'salma@example.com',      kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.3, completionRate: 84, totalDeals: 7,  walletBalance: 88.25 },
      { phone: '+21600000021', name: 'Marwen Ghariani',     email: 'marwen@example.com',     kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.9, completionRate: 98, totalDeals: 51, walletBalance: 720.0 },
      { phone: '+21600000022', name: 'Donia Souissi',       email: 'donia@example.com',      kycStatus: 'PENDING',   faceVerificationStatus: 'PENDING',  verified: false, rating: 0,   completionRate: 0,  totalDeals: 0,  walletBalance: 0 },
      { phone: '+21600000023', name: 'Ramzi Lasoued',       email: 'ramzi@example.com',      kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 3.8, completionRate: 70, totalDeals: 6,  walletBalance: 25.0 },
      { phone: '+21600000024', name: 'Hela Zribi',          email: 'hela@example.com',       kycStatus: 'APPROVED',  faceVerificationStatus: 'VERIFIED', verified: true,  rating: 4.7, completionRate: 94, totalDeals: 19, walletBalance: 268.0 },
      { phone: '+21600000025', name: 'Achraf Khelifi',      email: 'achraf@example.com',     kycStatus: 'REJECTED',  faceVerificationStatus: 'FAILED',   verified: false, rating: 1.8, completionRate: 25, totalDeals: 2,  walletBalance: 0, flagged: true },
    ] as const;

    const moreUsers = await Promise.all(
      moreUserSpecs.map((u) =>
        prisma.user.upsert({ where: { phone: u.phone }, update: {}, create: u as any }),
      ),
    );

    const fullUserPool = [...allUsers, ...moreUsers];
    const verifiedPool = fullUserPool.filter((u) => u.verified);
    const pickAny = (i: number) => verifiedPool[i % verifiedPool.length];

    // ── 19. Extra deals — broader route variety + every status ─────────
    const moreDealsTarget = 20;
    const dealsCount19 = await prisma.deal.count();
    let extraDeals19 = 0;
    if (dealsCount19 < 25) {
      const extraDealMatrix = [
        { status: 'COMPLETED', from: ['TUN', 'TN', 36.851, 10.227],  to: ['BRU', 'BE', 50.901,  4.484],  size: 'MEDIUM',     price: 130, weight: 2.5,  title: 'Olive oil — premium' },
        { status: 'COMPLETED', from: ['TUN', 'TN', 36.851, 10.227],  to: ['MIL', 'IT', 45.630,  8.728],  size: 'SMALL',      price: 65,  weight: 0.7,  title: 'Handmade jewelry' },
        { status: 'DELIVERED', from: ['CDG', 'FR', 49.009,  2.548],  to: ['LIS', 'PT', 38.781, -9.135],  size: 'MEDIUM',     price: 110, weight: 1.9,  title: 'Sealed children\'s books' },
        { status: 'IN_TRANSIT',from: ['CMN', 'MA', 33.367, -7.589],  to: ['BCN', 'ES', 41.297,  2.078],  size: 'LARGE',      price: 180, weight: 5.5,  title: 'Spice gift hamper' },
        { status: 'PICKED_UP', from: ['IST', 'TR', 41.275, 28.751],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'MEDIUM',     price: 95,  weight: 2.0,  title: 'Turkish ceramics' },
        { status: 'MATCHED',   from: ['MAD', 'ES', 40.472, -3.561],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'SMALL',      price: 50,  weight: 0.4,  title: 'Replacement laptop charger' },
        { status: 'OPEN',      from: ['DOH', 'QA', 25.273, 51.608],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'LARGE',      price: 280, weight: 9.0,  title: 'Industrial sample kit' },
        { status: 'OPEN',      from: ['JED', 'SA', 21.679, 39.156],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'SMALL',      price: 70,  weight: 0.5,  title: 'Sealed religious books' },
        { status: 'COMPLETED', from: ['LHR', 'GB', 51.477, -0.461],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'SMALL',      price: 60,  weight: 0.3,  title: 'University acceptance docs' },
        { status: 'CANCELLED', from: ['DXB', 'AE', 25.253, 55.365],  to: ['CDG', 'FR', 49.009,  2.548],  size: 'MEDIUM',     price: 145, weight: 2.8,  title: 'Watch with paperwork', cancelReason: 'Sender failed verification' },
        { status: 'DISPUTED',  from: ['JFK', 'US', 40.641, -73.778], to: ['TUN', 'TN', 36.851, 10.227],  size: 'LARGE',      price: 220, weight: 7.0,  title: 'Used MacBook — buyer claims condition mismatch' },
        { status: 'DELIVERED', from: ['FRA', 'DE', 50.037,  8.562],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'MEDIUM',     price: 105, weight: 1.5,  title: 'Auto parts — alternator' },
        { status: 'OPEN',      from: ['VIE', 'AT', 48.110, 16.569],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'EXTRA_LARGE',price: 320, weight: 14.0, title: 'Folding stroller in original box' },
        { status: 'COMPLETED', from: ['TUN', 'TN', 36.851, 10.227],  to: ['ATH', 'GR', 37.937, 23.944],  size: 'SMALL',      price: 55,  weight: 0.6,  title: 'Sealed cosmetics gift' },
        { status: 'IN_TRANSIT',from: ['TUN', 'TN', 36.851, 10.227],  to: ['MAD', 'ES', 40.472, -3.561],  size: 'MEDIUM',     price: 125, weight: 3.2,  title: 'Vintage vinyl records (fragile)' },
        { status: 'OPEN',      from: ['ZRH', 'CH', 47.464,  8.549],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'SMALL',      price: 80,  weight: 0.5,  title: 'Watch repair return' },
        { status: 'MATCHED',   from: ['TUN', 'TN', 36.851, 10.227],  to: ['LYS', 'FR', 45.726,  5.090],  size: 'MEDIUM',     price: 95,  weight: 2.1,  title: 'Family clothing parcel' },
        { status: 'COMPLETED', from: ['CAI', 'EG', 30.111, 31.413],  to: ['TUN', 'TN', 36.851, 10.227],  size: 'SMALL',      price: 60,  weight: 0.8,  title: 'Sealed dates and dried fruit' },
        { status: 'PICKED_UP', from: ['TUN', 'TN', 36.851, 10.227],  to: ['ALG', 'DZ', 36.691,  3.215],  size: 'MEDIUM',     price: 70,  weight: 1.8,  title: 'Pharmaceuticals (sealed pack)' },
        { status: 'DELIVERED', from: ['TUN', 'TN', 36.851, 10.227],  to: ['TIP', 'LY', 32.671, 13.159],  size: 'LARGE',      price: 150, weight: 6.5,  title: 'Auto spares — bulk' },
      ];

      for (let i = 0; i < extraDealMatrix.length && i < moreDealsTarget; i++) {
        const m = extraDealMatrix[i];
        const sender   = pickAny(i + 5);
        const traveler = m.status === 'OPEN' ? null : pickAny(i + 11);
        if (traveler && traveler.id === sender.id) continue;
        const ageDays = (i + 1) * 1.5;
        const createdAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
        await prisma.deal.create({
          data: {
            senderId: sender.id,
            travelerId: traveler?.id ?? null,
            title: m.title,
            description: `${m.title} — Lot #${1000 + i}.`,
            fromCity: m.from[0] as string, fromCountry: m.from[1] as string,
            fromLat: m.from[2] as number,  fromLng: m.from[3] as number,
            toCity:   m.to[0]   as string, toCountry:   m.to[1]   as string,
            toLat:    m.to[2]   as number, toLng:       m.to[3]   as number,
            packageSize: m.size,
            isFragile: ['Vintage vinyl records (fragile)', 'Handmade jewelry', 'Watch repair return', 'Turkish ceramics'].includes(m.title),
            itemValue: m.price * 4,
            weight: m.weight,
            price: m.price,
            currency: ['USD', 'EUR', 'USD', 'GBP'][i % 4],
            status: m.status,
            pickupDate:   new Date(Date.now() + (i - 5) * 24 * 60 * 60 * 1000),
            deliveryDate: ['COMPLETED', 'DELIVERED'].includes(m.status)
              ? new Date(Date.now() - (i * 8) * 60 * 60 * 1000) : null,
            cancelledAt:    m.status === 'CANCELLED' ? new Date(Date.now() - i * 60 * 60 * 1000) : null,
            cancelledById:  m.status === 'CANCELLED' ? sender.id : null,
            cancelledByRole:m.status === 'CANCELLED' ? 'SENDER' : null,
            cancelReason:   (m as any).cancelReason ?? null,
            createdAt,
          },
        });
        extraDeals19++;
      }
    }

    // ── 20. Extra trips — more variety for matching/search ─────────────
    let extraTrips20 = 0;
    if ((await prisma.trip.count()) < 8) {
      const extraTripSpecs = [
        { traveler: pickAny(0), from: 'TUN', to: 'BRU', fromC: 'TN', toC: 'BE', flight: 'TU654', maxKg: 12, price: 18, days: 6,  time: '06:45' },
        { traveler: pickAny(1), from: 'CDG', to: 'TUN', fromC: 'FR', toC: 'TN', flight: 'AF1620',maxKg: 9,  price: 14, days: 2,  time: '19:10' },
        { traveler: pickAny(3), from: 'TUN', to: 'IST', fromC: 'TN', toC: 'TR', flight: 'TK660', maxKg: 14, price: 22, days: 9,  time: '11:30' },
        { traveler: pickAny(4), from: 'TUN', to: 'CMN', fromC: 'TN', toC: 'MA', flight: 'AT579', maxKg: 8,  price: 16, days: 3,  time: '08:15' },
        { traveler: pickAny(2), from: 'TUN', to: 'JED', fromC: 'TN', toC: 'SA', flight: 'SV220', maxKg: 18, price: 28, days: 14, time: '23:45' },
        { traveler: pickAny(7), from: 'MAD', to: 'TUN', fromC: 'ES', toC: 'TN', flight: 'IB3760',maxKg: 10, price: 13, days: 5,  time: '15:20' },
        { traveler: pickAny(8), from: 'TUN', to: 'FRA', fromC: 'TN', toC: 'DE', flight: 'LH1352',maxKg: 11, price: 20, days: 8,  time: '13:40' },
        { traveler: pickAny(0), from: 'TUN', to: 'MIL', fromC: 'TN', toC: 'IT', flight: 'AZ891', maxKg: 10, price: 17, days: 4,  time: '07:00' },
      ];
      for (const t of extraTripSpecs) {
        await prisma.trip.create({
          data: {
            travelerId: t.traveler.id,
            fromCity: t.from, toCity: t.to,
            fromCountry: t.fromC, toCountry: t.toC,
            departureDate: new Date(Date.now() + t.days * 24 * 60 * 60 * 1000),
            departureTime: t.time,
            flightNumber: t.flight,
            maxWeight: t.maxKg,
            price: t.price,
            currency: 'USD',
            negotiable: t.maxKg > 10,
            status: 'OPEN',
          },
        });
        extraTrips20++;
      }
    }

    // ── 21. Tracking events for IN_TRANSIT / PICKED_UP deals (live map)
    let trackingEventsAdded = 0;
    const transitDeals = await prisma.deal.findMany({
      where: { status: { in: ['IN_TRANSIT', 'PICKED_UP'] } },
      take: 8,
    });
    for (const d of transitDeals) {
      const existing = await prisma.trackingEvent.count({ where: { dealId: d.id } });
      if (existing > 0) continue;
      const events = [
        { status: 'MATCHED',    actor: 'system',    note: 'Traveler accepted the deal',      offsetH: -48 },
        { status: 'PICKED_UP',  actor: 'traveler',  note: 'Package picked up at origin',     offsetH: -24 },
        { status: 'IN_TRANSIT', actor: 'system',    note: 'Departure scan recorded',         offsetH:  -6 },
      ];
      for (const ev of events) {
        if (d.status === 'PICKED_UP' && ev.status === 'IN_TRANSIT') continue;
        await prisma.trackingEvent.create({
          data: {
            dealId: d.id, status: ev.status, actor: ev.actor, note: ev.note,
            createdAt: new Date(Date.now() + ev.offsetH * 60 * 60 * 1000),
          },
        });
        trackingEventsAdded++;
      }
    }

    // ── 22. More transactions — broader history for finance dashboards ─
    let extraTx22 = 0;
    if ((await prisma.transaction.count()) < 24) {
      const txTypes  = ['DEPOSIT', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'PAYMENT', 'WITHDRAWAL', 'REFUND'] as const;
      const txStates = ['COMPLETED', 'COMPLETED', 'PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'] as const;
      const amounts  = [45, -90, 110.25, -150.5, 65.0, -33.75, 220, -55.5, 310.40, -125, 75, -200];
      const currencies = ['USD', 'EUR', 'GBP'];
      for (let i = 0; i < 18; i++) {
        const u = pickAny(i + 2);
        await prisma.transaction.create({
          data: {
            userId: u.id,
            type: txTypes[i % txTypes.length],
            amount: amounts[i % amounts.length],
            currency: currencies[i % currencies.length],
            status: txStates[i % txStates.length],
            stripeId: i % 4 === 0 ? `pi_test_${2000 + i}` : null,
            metadata: JSON.stringify({ note: `History tx #${i + 1}`, channel: ['stripe', 'wallet', 'manual'][i % 3] }),
            createdAt: new Date(Date.now() - (i * 4 + 1) * 60 * 60 * 1000),
          },
        });
        extraTx22++;
      }
    }

    // ── 23. More notifications — varied types across the user pool ─────
    let extraNotif23 = 0;
    if ((await prisma.notification.count()) < 18) {
      const tpl = [
        { title: 'Trip posted',          body: 'Your trip TUN→IST is now live.',                  type: 'TRIP' },
        { title: 'Match suggestion',     body: 'A traveler matches your CDG→TUN shipment.',       type: 'DEAL_MATCH' },
        { title: 'Pickup reminder',      body: 'Pickup scheduled for tomorrow morning.',          type: 'REMINDER' },
        { title: 'Review received',      body: 'You received a 5-star review from a sender.',      type: 'REVIEW' },
        { title: 'Wallet top-up',        body: 'Your wallet has been topped up with $200.',        type: 'PAYMENT' },
        { title: 'Refund processed',     body: 'A refund of $45 has been credited to your wallet.',type: 'PAYMENT' },
        { title: 'Document expiring',    body: 'Your KYC document expires in 30 days.',            type: 'KYC' },
        { title: 'Promo: 10% off',       body: 'Use code BRIDGE10 on your next shipment.',         type: 'PROMOTION', read: true },
        { title: 'New chat message',     body: 'You received a new message about your shipment.',  type: 'CHAT' },
        { title: 'Trip cancelled',       body: 'A scheduled trip you booked was cancelled.',       type: 'TRIP', read: true },
        { title: 'Dispute opened',       body: 'A dispute has been opened on one of your deals.',  type: 'DISPUTE' },
        { title: 'Payout sent',          body: 'A payout of $120 was sent to your bank.',          type: 'PAYMENT' },
      ];
      for (let i = 0; i < tpl.length; i++) {
        const u = pickAny(i + 3);
        await prisma.notification.create({
          data: {
            userId: u.id,
            title: tpl[i].title,
            body: tpl[i].body,
            type: tpl[i].type,
            read: (tpl[i] as any).read ?? false,
            createdAt: new Date(Date.now() - i * 90 * 60 * 1000),
          },
        });
        extraNotif23++;
      }
    }

    // ── 24. More audit log entries — wider action/entity coverage ──────
    let extraAudit24 = 0;
    if ((await prisma.auditLog.count()) < 30) {
      const actions  = ['LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'KYC_APPROVE', 'KYC_REJECT', 'BAN', 'UNBAN', 'PASSWORD_CHANGE', 'FRAUD_REVIEW'];
      const entities = ['USER', 'DEAL', 'TRIP', 'TRANSACTION', 'DISPUTE', 'REVIEW', 'KYC_DOCUMENT', 'NOTIFICATION'];
      for (let i = 0; i < 25; i++) {
        const u = fullUserPool[i % fullUserPool.length];
        await prisma.auditLog.create({
          data: {
            userId: u.id,
            entityType: entities[i % entities.length],
            entityId: `seed-extra-${i}`,
            action: actions[i % actions.length],
            ipAddress: `41.${(i * 7) % 255}.${(i * 13) % 255}.${(i * 19) % 255}`,
            metadata: JSON.stringify({ ua: 'seed-extra', i, channel: ['mobile', 'web', 'admin'][i % 3] }),
            recordedAt: new Date(Date.now() - i * 47 * 60 * 1000),
          },
        });
        extraAudit24++;
      }
    }

    // ── 25. More reviews — fill out the rating distribution ────────────
    let extraReviews25 = 0;
    if ((await prisma.review.count()) < 12) {
      const completedDeals = await prisma.deal.findMany({
        where: { status: { in: ['COMPLETED', 'DELIVERED'] } }, take: 12,
      });
      const ratingPlan: Array<{ rating: number; sentiment: string; comment: string; flagged?: boolean; status?: string }> = [
        { rating: 5, sentiment: 'positive', comment: 'Outstanding service, will use again.' },
        { rating: 4, sentiment: 'positive', comment: 'Smooth delivery, friendly traveler.' },
        { rating: 5, sentiment: 'positive', comment: 'Faster than expected — very pleased.' },
        { rating: 3, sentiment: 'neutral',  comment: 'Late by a day but ok overall.' },
        { rating: 4, sentiment: 'positive', comment: 'Good communication throughout.' },
        { rating: 2, sentiment: 'negative', comment: 'Item arrived but packaging was damaged.', flagged: true, status: 'pending_moderation' },
        { rating: 5, sentiment: 'positive', comment: 'Pleasure to deal with.' },
        { rating: 1, sentiment: 'negative', comment: 'Unresponsive — escalated to support.', flagged: true, status: 'pending_moderation' },
      ];
      for (let i = 0; i < completedDeals.length && i < ratingPlan.length; i++) {
        const d = completedDeals[i];
        const author = pickAny(i + 7);
        const target = pickAny(i + 9);
        if (author.id === target.id || author.id === d.senderId) continue;
        const exists = await prisma.review.findFirst({ where: { dealId: d.id, authorId: author.id } });
        if (exists) continue;
        const p = ratingPlan[i];
        await prisma.review.create({
          data: {
            dealId: d.id, authorId: author.id, targetId: target.id,
            rating: p.rating, sentiment: p.sentiment, comment: p.comment,
            fraudScore: p.rating <= 2 ? 0.4 + Math.random() * 0.4 : Math.random() * 0.1,
            flagged: p.flagged ?? false,
            status: p.status ?? 'approved',
          },
        });
        extraReviews25++;
      }
    }

    // ── 26. KYC documents for the new user batch ───────────────────────
    if ((await prisma.kycDocument.count()) < 10) {
      const moreKycSpecs = [
        { user: moreUsers[0], type: 'PASSPORT',        status: 'APPROVED' },
        { user: moreUsers[1], type: 'ID_CARD',         status: 'APPROVED' },
        { user: moreUsers[2], type: 'PASSPORT',        status: 'PENDING'  },
        { user: moreUsers[3], type: 'DRIVING_LICENSE', status: 'APPROVED' },
        { user: moreUsers[5], type: 'ID_CARD',         status: 'APPROVED' },
        { user: moreUsers[9], type: 'PASSPORT',        status: 'REJECTED' },
      ];
      for (const s of moreKycSpecs) {
        await prisma.kycDocument.create({
          data: {
            userId: s.user.id,
            documentType: s.type,
            frontUrl: `https://placehold.co/600x400?text=${s.type}+front`,
            backUrl:  s.type !== 'PASSPORT' ? `https://placehold.co/600x400?text=${s.type}+back` : null,
            status: s.status,
          },
        });
      }
    }

    // ── 27. More pricing data points — feeds the pricing model ─────────
    if ((await prisma.pricingDataPoint.count()) < 14) {
      await prisma.pricingDataPoint.createMany({
        data: [
          { distance: 1200, weight: 1.2, volume: 2200,  urgent: false, price: 75 },
          { distance: 4400, weight: 4.5, volume: 14000, urgent: true,  price: 280 },
          { distance: 7000, weight: 9.0, volume: 32000, urgent: false, price: 320 },
          { distance: 350,  weight: 0.2, volume: 500,   urgent: false, price: 35 },
          { distance: 2800, weight: 3.0, volume: 9000,  urgent: true,  price: 195 },
          { distance: 5500, weight: 6.0, volume: 22000, urgent: false, price: 245 },
          { distance: 1800, weight: 2.4, volume: 6500,  urgent: false, price: 120 },
          { distance: 950,  weight: 0.8, volume: 1800,  urgent: true,  price: 95 },
        ],
      });
    }

    return res.json({
      success: true,
      message: 'Seed data created',
      data: {
        users:          users.length,
        extraUsers:     extraUsers.length,
        moreUsers:      moreUsers.length,
        deals:          deals.length || '(already existed)',
        extraDeals:     extraDealsCreated,
        extraDeals19,
        extraTrips20,
        trackingEventsAdded,
        extraTx22,
        extraNotif23,
        extraAudit24,
        extraReviews25,
        trips:          existingTrips === 0 ? 3 : '(already existed)',
        chat:           transitDeal ? 'created' : 'skipped',
        disputes:       disputesCreated,
        totalUsers:     await prisma.user.count(),
        totalDeals:     await prisma.deal.count(),
        totalTrips:     await prisma.trip.count(),
        adminTasks:     await prisma.adminTask.count(),
        kycDocuments:   await prisma.kycDocument.count(),
        reviews:        await prisma.review.count(),
        transactions:   await prisma.transaction.count(),
        auditLogs:      await prisma.auditLog.count(),
        pricingPoints:  await prisma.pricingDataPoint.count(),
        userReports:    await prisma.userReport.count(),
        notifications:  await prisma.notification.count(),
        trackingEvents: await prisma.trackingEvent.count(),
      },
    });
  } catch (error: any) {
    console.error('Seed error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
