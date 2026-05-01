// Search Routes
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { searchRateLimiter } from '../middleware/security';
import { searchDealsSchema, searchUsersSchema } from '../validators/auth';
import { prisma } from '../config/db';

const router = Router();

// POST /search/deals - Search dealsi
router.post('/deals', authenticate, searchRateLimiter, validate(searchDealsSchema), async (req: any, res, next) => {
  try {
    const { query, filters } = req.validated || req.body;

    const where: any = { status: 'OPEN' };
    if (query) {
      where.OR = [
        { title: { contains: query } },
        { description: { contains: query } },
        { fromCity: { contains: query } },
        { toCity: { contains: query } },
        { fromCountry: { contains: query } },
        { toCountry: { contains: query } },
      ];
    }

    if (filters?.fromCity) where.fromCity = { contains: filters.fromCity };
    if (filters?.toCity) where.toCity = { contains: filters.toCity };
    if (filters?.fromCountry) where.fromCountry = { contains: filters.fromCountry };
    if (filters?.toCountry) where.toCountry = { contains: filters.toCountry };
    if (filters?.packageSize) where.packageSize = filters.packageSize;
    if (filters?.minPrice || filters?.maxPrice) {
      where.price = {};
      if (filters.minPrice) where.price.gte = Number(filters.minPrice);
      if (filters.maxPrice) where.price.lte = Number(filters.maxPrice);
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        sender: { select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, verified: true } },
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    res.json(deals);
  } catch (error) {
    next(error);
  }
});

// POST /search/users - Search users
router.post('/users', authenticate, validate(searchUsersSchema), async (req: any, res, next) => {
  try {
    const { query } = req.validated || req.body;

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { phone: { contains: query } },
        ],
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        rating: true,
        totalDeals: true,
      },
      take: 20,
    });

    res.json(users);
  } catch (error) {
    next(error);
  }
});

// GET /search/suggestions - Get search suggestions
router.get('/suggestions', authenticate, async (req: any, res, next) => {
  try {
    const q = String(req.query.q || '');
    if (!q || q.length < 2) {
      return res.json({ deals: [], users: [], locations: [] });
    }

    const [deals, users] = await Promise.all([
      prisma.deal.findMany({
        where: { title: { contains: q }, status: 'OPEN' },
        select: { title: true },
        take: 5,
        distinct: ['title'],
      }),
      prisma.user.findMany({
        where: { name: { contains: q } },
        select: { name: true },
        take: 5,
      }),
    ]);

    // Get unique city names matching the query
    const fromDeals = await prisma.deal.findMany({
      where: { fromCity: { contains: q } },
      select: { fromCity: true },
      take: 5,
      distinct: ['fromCity'],
    });
    const toDeals = await prisma.deal.findMany({
      where: { toCity: { contains: q } },
      select: { toCity: true },
      take: 5,
      distinct: ['toCity'],
    });

    const locations = [
      ...new Set([
        ...fromDeals.map((d) => d.fromCity),
        ...toDeals.map((d) => d.toCity),
      ]),
    ].slice(0, 5);

    res.json({
      deals: deals.map((d) => d.title),
      users: users.map((u) => u.name).filter(Boolean),
      locations,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
