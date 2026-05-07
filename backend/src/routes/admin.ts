/**
 * Admin CRUD routes — all protected by authenticate + requireAdmin.
 * Provides management access to AuditLog, AdminTask, and PricingDataPoint.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { normalizePhone } from '../utils/phone';
import logger from '../utils/logger';

const router = Router();
router.use(authenticate, requireAdmin);

// ── Dashboard Stats ───────────────────────────────────────────────────────────

/** GET /admin/stats — all KPIs + chart data for the dashboard */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now   = new Date();
    const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalDeals,
      dealStatusGroups,
      openDisputes,
      kycPending,
      openTasks,
      recentDeals,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.deal.count(),
      prisma.deal.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.dispute.count({ where: { status: { in: ['OPENED', 'EVIDENCE_SUBMITTED', 'ADMIN_REVIEWING'] } } }),
      prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      prisma.adminTask.count({ where: { status: 'OPEN' } }),
      prisma.deal.findMany({
        where: { createdAt: { gte: ago30 } },
        select: { createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // dealsByStatus — { OPEN: 5, MATCHED: 3, … }
    const dealsByStatus: Record<string, number> = {};
    for (const g of dealStatusGroups) dealsByStatus[g.status] = g._count._all;

    const successfulMatches = (dealsByStatus['MATCHED'] ?? 0)
      + (dealsByStatus['PICKED_UP'] ?? 0)
      + (dealsByStatus['IN_TRANSIT'] ?? 0)
      + (dealsByStatus['DELIVERED'] ?? 0)
      + (dealsByStatus['COMPLETED'] ?? 0);

    const matchRate = totalDeals > 0
      ? Math.round((successfulMatches / totalDeals) * 100)
      : 0;

    // dailyActivity — one entry per day for the last 30 days
    const dayMap: Record<string, { dealsPosted: number; matches: number }> = {};
    for (let d = 0; d < 30; d++) {
      const dt = new Date(ago30.getTime() + d * 24 * 60 * 60 * 1000);
      dayMap[dt.toISOString().slice(0, 10)] = { dealsPosted: 0, matches: 0 };
    }
    for (const deal of recentDeals) {
      const key = deal.createdAt.toISOString().slice(0, 10);
      if (!dayMap[key]) continue;
      dayMap[key].dealsPosted += 1;
      if (!['OPEN', 'CANCELLED'].includes(deal.status)) dayMap[key].matches += 1;
    }
    const dailyActivity = Object.entries(dayMap).map(([date, v]) => ({ date: date.slice(5), ...v }));

    // topRoutes — top 5 city pairs by volume
    const routeGroups = await prisma.deal.groupBy({
      by: ['fromCity', 'toCity'],
      _count: { _all: true },
      orderBy: { _count: { fromCity: 'desc' } },
      take: 5,
    });
    const topRoutes = routeGroups.map(r => ({
      route: `${r.fromCity} → ${r.toCity}`,
      volume: r._count._all,
    }));

    // usersByRole — simple sender/traveler split from deal counts
    const [senderCount, travelerCount] = await Promise.all([
      prisma.user.count({ where: { sentDeals: { some: {} } } }),
      prisma.user.count({ where: { traveledDeals: { some: {} } } }),
    ]);
    const newUsers = totalUsers - senderCount - travelerCount;
    const usersByRole = [
      { role: 'Senders',   count: senderCount },
      { role: 'Travelers', count: travelerCount },
      { role: 'New',       count: Math.max(0, newUsers) },
    ];

    res.json({
      kpis: { totalUsers, totalDeals, successfulMatches, matchRate, openDisputes, kycPending, openTasks },
      dealsByStatus,
      dailyActivity,
      topRoutes,
      usersByRole,
    });
  } catch (err) { next(err); }
});

// ── AuditLog ──────────────────────────────────────────────────────────────────

/** GET /admin/audit-logs?page=1&limit=50&userId=&entityType=&action= */
router.get('/audit-logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip  = (page - 1) * limit;

    const where: any = {};
    // FIX: Validate UUID format before passing to Prisma to prevent injection
    const uuidRegex = /^[a-z0-9]{20,30}$/; // cuid format
    if (req.query.userId) {
      const userId = String(req.query.userId);
      if (!uuidRegex.test(userId)) return res.status(400).json({ error: 'Invalid userId format' });
      where.userId = userId;
    }
    if (req.query.entityType) where.entityType = String(req.query.entityType);
    if (req.query.action)     where.action     = String(req.query.action);

    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, skip, take: limit, orderBy: { recordedAt: 'desc' } }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ items, total, page, limit, hasMore: skip + limit < total });
  } catch (err) { next(err); }
});

/** DELETE /admin/audit-logs/:id */
router.delete('/audit-logs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.auditLog.delete({ where: { id: req.params.id } });
    logger.info('[Admin] AuditLog deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── AdminTask ─────────────────────────────────────────────────────────────────

/** GET /admin/tasks?page=1&limit=50&status=OPEN&type= */
router.get('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.type)   where.type   = String(req.query.type);

    const [items, total] = await prisma.$transaction([
      prisma.adminTask.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.adminTask.count({ where }),
    ]);

    res.json({ items, total, page, limit, hasMore: skip + limit < total });
  } catch (err) { next(err); }
});

/** POST /admin/tasks — create a new admin task */
router.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, referenceId, notes, assignedTo } = req.body;
    if (!type || !referenceId) {
      return res.status(400).json({ error: 'type and referenceId are required' });
    }
    const task = await prisma.adminTask.create({
      data: { type, referenceId, notes, assignedTo },
    });
    res.status(201).json(task);
  } catch (err) { next(err); }
});

/** PATCH /admin/tasks/:id — update status / assignee / notes */
router.patch('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, assignedTo, notes } = req.body;
    const task = await prisma.adminTask.update({
      where: { id: req.params.id },
      data: { status, assignedTo, notes },
    });
    res.json(task);
  } catch (err) { next(err); }
});

/** DELETE /admin/tasks/:id */
router.delete('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.adminTask.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── PricingDataPoint ──────────────────────────────────────────────────────────

/** GET /admin/pricing-data?page=1&limit=50 */
router.get('/pricing-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const skip  = (page - 1) * limit;

    const [items, total] = await prisma.$transaction([
      prisma.pricingDataPoint.findMany({ skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.pricingDataPoint.count(),
    ]);

    res.json({ items, total, page, limit, hasMore: skip + limit < total });
  } catch (err) { next(err); }
});

/** POST /admin/pricing-data — add a training data point */
router.post('/pricing-data', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { distance, weight, volume = 0, urgent = false, price } = req.body;
    if (distance == null || weight == null || price == null) {
      return res.status(400).json({ error: 'distance, weight, and price are required' });
    }
    const point = await prisma.pricingDataPoint.create({
      data: { distance: Number(distance), weight: Number(weight), volume: Number(volume), urgent: Boolean(urgent), price: Number(price) },
    });
    res.status(201).json(point);
  } catch (err) { next(err); }
});

/** DELETE /admin/pricing-data/:id */
router.delete('/pricing-data/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.pricingDataPoint.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Transactions List ─────────────────────────────────────────────────────────

/** GET /admin/transactions?page=1&limit=20&userId=&type=&status=&dateFrom=&dateTo= */
router.get('/transactions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (req.query.userId) where.userId = String(req.query.userId);
    if (req.query.type)   where.type   = String(req.query.type);
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.dateFrom || req.query.dateTo) {
      where.createdAt = {};
      if (req.query.dateFrom) where.createdAt.gte = new Date(String(req.query.dateFrom));
      if (req.query.dateTo)   where.createdAt.lte = new Date(String(req.query.dateTo) + 'T23:59:59Z');
    }

    const [items, total] = await prisma.$transaction([
      prisma.transaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, phone: true } },
          deal: {
            select: {
              id: true,
              title: true,
              status: true,
              price: true,
              currency: true,
              fromCity: true,
              toCity: true,
              fromCountry: true,
              toCountry: true,
              sender:   { select: { id: true, name: true, phone: true } },
              traveler: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ items, total, page, limit, hasMore: skip + limit < total });
  } catch (err) { next(err); }
});

// ── Trip Visualisation Stats ──────────────────────────────────────────────────

/** GET /admin/trips/stats — top 5 destinations + departures + transport mix. */
router.get('/trips/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [topDestinations, topDepartures, byTransport] = await Promise.all([
      prisma.trip.groupBy({
        by: ['toCity', 'toCountry'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.trip.groupBy({
        by: ['fromCity', 'fromCountry'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
      prisma.trip.groupBy({
        by: ['transportType'],
        _count: { id: true },
      }),
    ]);

    res.json({
      topDestinations: topDestinations.map(r => ({
        city: r.toCity,
        country: r.toCountry,
        count: r._count.id,
      })),
      topDepartures: topDepartures.map(r => ({
        city: r.fromCity,
        country: r.fromCountry,
        count: r._count.id,
      })),
      byTransport: byTransport.map(r => ({
        type: r.transportType,
        count: r._count.id,
      })),
    });
  } catch (err) { next(err); }
});

// ── Generated Reports ─────────────────────────────────────────────────────────

/** GET /admin/reports — virtual report list derived from live DB stats */
router.get('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();

    const [totalUsers, totalDeals, totalDisputes, totalTx, openTasks, recentAudit] = await Promise.all([
      prisma.user.count(),
      prisma.deal.count(),
      prisma.dispute.count(),
      prisma.transaction.count(),
      prisma.adminTask.count({ where: { status: 'OPEN' } }),
      prisma.auditLog.findMany({ orderBy: { recordedAt: 'desc' }, take: 1 }),
    ]);

    const lastAuditAt = recentAudit[0]?.recordedAt ?? null;

    // Build virtual reports from live stats
    const reports = [
      {
        id: 'rpt-users-monthly',
        name: 'Monthly User Growth Report',
        author: 'System',
        frequency: 'MONTHLY',
        date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        size: `${Math.max(1, Math.round(totalUsers / 50))} KB`,
        status: 'ready',
        format: 'pdf',
      },
      {
        id: 'rpt-deals-weekly',
        name: 'Weekly Deals & Escrow Summary',
        author: 'System',
        frequency: 'WEEKLY',
        date: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        size: `${Math.max(1, Math.round(totalDeals / 20))} KB`,
        status: 'ready',
        format: 'csv',
      },
      {
        id: 'rpt-transactions-daily',
        name: 'Daily Transaction Log',
        author: 'System',
        frequency: 'DAILY',
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
        size: `${Math.max(1, Math.round(totalTx / 10))} KB`,
        status: 'ready',
        format: 'csv',
      },
      {
        id: 'rpt-disputes-weekly',
        name: 'Dispute Resolution Report',
        author: 'System',
        frequency: 'WEEKLY',
        date: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        size: `${Math.max(1, Math.round(totalDisputes / 5))} KB`,
        status: totalDisputes > 0 ? 'ready' : 'archived',
        format: 'pdf',
      },
      {
        id: 'rpt-audit-daily',
        name: 'Admin Audit Log Export',
        author: 'System',
        frequency: 'DAILY',
        date: lastAuditAt ? lastAuditAt.toISOString() : now.toISOString(),
        size: `${Math.max(2, openTasks)} KB`,
        status: 'ready',
        format: 'xlsx',
      },
      {
        id: 'rpt-kyc-weekly',
        name: 'KYC Verification Status Report',
        author: 'System',
        frequency: 'WEEKLY',
        date: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        size: `${Math.max(1, Math.round(totalUsers / 100))} KB`,
        status: 'ready',
        format: 'pdf',
      },
    ];

    const storageKb = reports.reduce((acc, r) => acc + parseInt(r.size, 10), 0);
    const storageUsed = storageKb >= 1024 ? `${(storageKb / 1024).toFixed(1)} MB` : `${storageKb} KB`;

    res.json({
      reports,
      stats: {
        total: reports.length,
        storageUsed,
        lastGeneration: lastAuditAt ? lastAuditAt.toISOString() : null,
      },
    });
  } catch (err) { next(err); }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

/** GET /admin/analytics — comprehensive analytics for the admin dashboard */
router.get('/analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // KPIs
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [totalUsers, totalDeals, dealStatusGroups, newUsersThisMonth, newDealsThisMonth] = await Promise.all([
      prisma.user.count(),
      prisma.deal.count(),
      prisma.deal.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.deal.count({ where: { createdAt: { gte: startOfMonth } } }),
    ]);

    const dealsByStatus: Record<string, number> = {};
    for (const g of dealStatusGroups) dealsByStatus[g.status] = g._count._all;
    const successfulMatches = ['MATCHED','PICKED_UP','IN_TRANSIT','DELIVERED','COMPLETED']
      .reduce((acc, s) => acc + (dealsByStatus[s] ?? 0), 0);
    const matchRate = totalDeals > 0 ? Math.round((successfulMatches / totalDeals) * 100) : 0;

    // Month-over-month growth: this-month additions as % of end-of-last-month total
    const usersBaseline = totalUsers - newUsersThisMonth;
    const dealsBaseline = totalDeals - newDealsThisMonth;
    const usersMoM = usersBaseline > 0 ? (newUsersThisMonth / usersBaseline) * 100 : (newUsersThisMonth > 0 ? 100 : 0);
    const dealsMoM = dealsBaseline > 0 ? (newDealsThisMonth / dealsBaseline) * 100 : (newDealsThisMonth > 0 ? 100 : 0);

    // Fetch all deals from past 12 months for in-memory aggregation
    const ago12m = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const recentDeals = await prisma.deal.findMany({
      where: { createdAt: { gte: ago12m } },
      select: { createdAt: true, price: true, status: true, packageSize: true, toCountry: true },
    });

    // Revenue monthly (GMV, excluding cancelled)
    const revenueMonthly: { month: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const revenue = recentDeals
        .filter(r => r.createdAt >= d && r.createdAt < end && r.status !== 'CANCELLED')
        .reduce((acc, r) => acc + r.price, 0);
      revenueMonthly.push({ month: MONTHS[d.getMonth()], revenue: Math.round(revenue) });
    }

    // User growth (monthly registrations, last 12 months)
    const recentUsers = await prisma.user.findMany({
      where: { createdAt: { gte: ago12m } },
      select: { createdAt: true },
    });
    const userGrowth: { month: string; registrations: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const count = recentUsers.filter(u => u.createdAt >= d && u.createdAt < end).length;
      userGrowth.push({ month: MONTHS[d.getMonth()], registrations: count });
    }

    // Top routes (all time)
    const routeGroups = await prisma.deal.groupBy({
      by: ['fromCity', 'toCity'],
      _count: { _all: true },
      orderBy: { _count: { fromCity: 'desc' } },
      take: 5,
    });
    const topRoutes = routeGroups.map(r => ({
      route: `${r.fromCity} → ${r.toCity}`,
      count: r._count._all,
    }));

    // Deals by category (packageSize distribution)
    const catGroups = await prisma.deal.groupBy({ by: ['packageSize'], _count: { _all: true } });
    const catColors: Record<string, string> = {
      SMALL: '#3B82F6', MEDIUM: '#10B981', LARGE: '#F59E0B', EXTRA_LARGE: '#EF4444',
    };
    const totalCats = catGroups.reduce((acc, g) => acc + g._count._all, 0) || 1;
    const dealsByCategory = catGroups.map(g => ({
      name: g.packageSize,
      value: Math.round((g._count._all / totalCats) * 100),
      color: catColors[g.packageSize] ?? '#6B7280',
    }));

    // Revenue by country (top 6 destination countries)
    const countryMap: Record<string, { revenue: number; deals: number }> = {};
    for (const d of recentDeals) {
      if (!d.toCountry) continue;
      if (!countryMap[d.toCountry]) countryMap[d.toCountry] = { revenue: 0, deals: 0 };
      countryMap[d.toCountry].deals += 1;
      if (d.status !== 'CANCELLED') countryMap[d.toCountry].revenue += d.price;
    }
    // Return all destinations ranked by deal volume; frontend slices top/bottom.
    const revenueByCountry = Object.entries(countryMap)
      .map(([country, v]) => ({ country, revenue: Math.round(v.revenue), deals: v.deals }))
      .sort((a, b) => b.deals - a.deals);

    res.json({
      kpis: {
        totalUsers, totalDeals, matchRate,
        usersMoM: Math.round(usersMoM * 10) / 10,
        dealsMoM: Math.round(dealsMoM * 10) / 10,
        newUsersThisMonth, newDealsThisMonth,
      },
      revenueMonthly, topRoutes, dealsByCategory, userGrowth, revenueByCountry,
    });
  } catch (err) { next(err); }
});

// ── Content Moderation ────────────────────────────────────────────────────────

/** GET /admin/moderation — flagged review queue + recent audit log */
router.get('/moderation', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [flaggedReviews, rawAudit] = await Promise.all([
      prisma.review.findMany({
        where: { OR: [{ flagged: true }, { status: 'pending_moderation' }] },
        include: { author: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.auditLog.findMany({
        orderBy: { recordedAt: 'desc' },
        take: 20,
        include: { user: { select: { name: true, phone: true } } },
      }),
    ]);

    const queue = flaggedReviews.map(r => {
      const score = r.fraudScore ?? 0;
      const mlCategory = score > 0.7 ? 'FRAUD'
        : r.sentiment === 'negative' ? 'TOXIC'
        : score > 0.4 ? 'SPAM'
        : null;
      const severity = score > 0.7 || r.status === 'pending_moderation' ? 'CRITICAL'
        : r.flagged ? 'WARNING'
        : null;
      return {
        id: r.id,
        type: 'REVIEW',
        reporter: r.author?.name ?? r.author?.phone ?? 'Unknown',
        reporterId: r.authorId,
        content: r.comment ?? '',
        reason: r.sentiment ? `Sentiment: ${r.sentiment}` : 'Manually flagged',
        severity,
        mlCategory,
        mlScore: r.fraudScore != null ? Math.round(r.fraudScore * 100) : 0,
        time: r.createdAt.toISOString(),
      };
    });

    const audit = rawAudit.map(a => {
      const modName = a.user?.name ?? a.user?.phone ?? 'Admin';
      return {
        id: a.id,
        mod: modName,
        modInit: modName.slice(0, 2).toUpperCase(),
        action: a.action,
        target: `${a.entityType}:${a.entityId ?? '—'}`,
        time: a.recordedAt.toISOString(),
      };
    });

    res.json({ queue, audit });
  } catch (err) { next(err); }
});

/** PATCH /admin/reviews/:id/dismiss — un-flag a review */
router.patch('/reviews/:id/dismiss', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: { flagged: false, status: 'approved' },
    });
    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.id,
        entityId: review.id,
        entityType: 'REVIEW',
        action: 'DISMISS',
        ipAddress: req.ip,
        metadata: JSON.stringify({ action: req.body.action ?? 'hide' }),
      },
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Admin Disputes List ───────────────────────────────────────────────────────

/**
 * GET /admin/disputes?page=1&limit=15&status=ADMIN_REVIEWING
 * `status` accepts a single value or a comma-separated list
 * (e.g. status=OPENED,EVIDENCE_SUBMITTED) — paginated dispute list for admins
 */
router.get('/disputes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (req.query.status) {
      const parts = String(req.query.status).split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length === 1) where.status = parts[0];
      else if (parts.length > 1) where.status = { in: parts };
    }
    if (req.query.since) {
      const since = new Date(String(req.query.since));
      if (!isNaN(since.getTime())) where.updatedAt = { gte: since };
    }

    const [disputes, total] = await prisma.$transaction([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          deal:     { select: { id: true, fromCity: true, toCity: true, price: true, status: true } },
          filer:    { select: { id: true, name: true, avatar: true, phone: true } },
          against:  { select: { id: true, name: true, avatar: true, phone: true } },
          evidences: { orderBy: { createdAt: 'asc' } },
          _count:   { select: { messages: true, timeline: true, evidences: true } },
        },
      }),
      prisma.dispute.count({ where }),
    ]);

    // Attach matching open AdminTask id to each dispute
    const disputeIds = disputes.map(d => d.id);
    const adminTasks = disputeIds.length > 0
      ? await prisma.adminTask.findMany({
          where: { type: 'DISPUTE_REVIEW', referenceId: { in: disputeIds }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
          select: { id: true, referenceId: true, assignedTo: true },
        })
      : [];
    const taskByDisputeId: Record<string, { id: string; assignedTo: string | null }> =
      Object.fromEntries(adminTasks.map(t => [t.referenceId, { id: t.id, assignedTo: t.assignedTo }]));

    // Resolve admin names for assignedTo and resolvedById
    const adminIds = Array.from(new Set([
      ...adminTasks.map(t => t.assignedTo).filter(Boolean) as string[],
      ...disputes.map(d => d.resolvedById).filter(Boolean) as string[],
    ]));
    const adminUsers = adminIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true },
        })
      : [];
    const adminById: Record<string, { id: string; name: string | null }> =
      Object.fromEntries(adminUsers.map(u => [u.id, u]));

    const items = disputes.map(d => ({
      ...d,
      adminTaskId:    taskByDisputeId[d.id]?.id ?? null,
      assignedTo:     taskByDisputeId[d.id]?.assignedTo ?? null,
      assignedAdmin:  taskByDisputeId[d.id]?.assignedTo ? adminById[taskByDisputeId[d.id]!.assignedTo!] ?? null : null,
      resolvedBy:     d.resolvedById ? adminById[d.resolvedById] ?? null : null,
    }));

    res.json({ items, total, page, limit, hasMore: skip + limit < total });
  } catch (err) { next(err); }
});

// ── User Moderation ───────────────────────────────────────────────────────────

/**
 * GET /admin/users?page=1&limit=50&banned=&flagged=&kycStatus=&search=
 * Returns paginated user list with moderation-relevant fields.
 */
router.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (req.query.banned  !== undefined) where.banned  = req.query.banned  === 'true';
    if (req.query.flagged !== undefined) where.flagged = req.query.flagged === 'true';
    if (req.query.kycStatus) where.kycStatus = String(req.query.kycStatus);
    if (req.query.search) {
      const q = String(req.query.search);
      where.OR = [
        { phone: { contains: q } },
        { name:  { contains: q, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, phone: true, name: true, avatar: true,
          isAdmin: true, flagged: true, banned: true, reasonForBan: true,
          lastLoginAt: true, kycStatus: true, faceVerificationStatus: true,
          walletBalance: true, rating: true, totalDeals: true,
          createdAt: true, updatedAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ items, total, page, limit, hasMore: skip + limit < total });
  } catch (err) { next(err); }
});

/**
 * POST /admin/users
 * Administrative onboarding — creates a brand-new user account already
 * provisioned with isAdmin=true. Login is handled via the existing WhatsApp
 * OTP flow at /auth/admin/otp/* against the registered phone number, so no
 * password is collected here.
 *
 * Body: { firstName, lastName, phone, email }
 */
router.post('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firstName, lastName, phone: rawPhone, email } = req.body || {};

    if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
      return res.status(400).json({ error: 'First name is required' });
    }
    if (!lastName || typeof lastName !== 'string' || !lastName.trim()) {
      return res.status(400).json({ error: 'Last name is required' });
    }
    if (!rawPhone) {
      return res.status(400).json({ error: 'WhatsApp-linked phone number is required' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    let phone: string;
    try { phone = normalizePhone(String(rawPhone)); }
    catch { return res.status(400).json({ error: 'Invalid phone number format' }); }

    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      return res.status(409).json({ error: 'A user with this phone number already exists' });
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const user = await prisma.user.create({
      data: {
        phone,
        name: fullName,
        email: email.trim().toLowerCase(),
        isAdmin: true,
      } as any,
      select: {
        id: true, phone: true, name: true, email: true, isAdmin: true,
        kycStatus: true, banned: true, createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.id,
        entityId: user.id,
        entityType: 'USER',
        action: 'ADMIN_ONBOARD',
        ipAddress: req.ip,
        metadata: JSON.stringify({ firstName, lastName, email }),
      },
    }).catch(() => {});

    logger.info(`[Admin] Onboarded new admin ${user.id} (${phone.slice(-4)}) by ${(req as any).user?.id}`);
    res.status(201).json(user);
  } catch (err) { next(err); }
});

/**
 * PATCH /admin/users/:id/ban   — { reason?: string }
 * PATCH /admin/users/:id/unban
 */
router.patch('/users/:id/ban', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { banned: true, reasonForBan: reason || null } as any,
      select: { id: true, phone: true, banned: true, reasonForBan: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.id,
        entityId: user.id,
        entityType: 'USER',
        action: 'BAN',
        ipAddress: req.ip,
        metadata: JSON.stringify({ reason: reason || null }),
      },
    }).catch(() => {});

    logger.info(`[Admin] User ${user.id} banned by ${(req as any).user?.id}`);
    res.json(user);
  } catch (err) { next(err); }
});

router.patch('/users/:id/unban', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { banned: false, reasonForBan: null } as any,
      select: { id: true, phone: true, banned: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.id,
        entityId: user.id,
        entityType: 'USER',
        action: 'UNBAN',
        ipAddress: req.ip,
      },
    }).catch(() => {});

    logger.info(`[Admin] User ${user.id} unbanned by ${(req as any).user?.id}`);
    res.json(user);
  } catch (err) { next(err); }
});

/**
 * PATCH /admin/users/:id/flag
 * PATCH /admin/users/:id/unflag
 */
router.patch('/users/:id/flag', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { flagged: true } as any,
      select: { id: true, phone: true, flagged: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.id,
        entityId: user.id,
        entityType: 'USER',
        action: 'FLAG',
        ipAddress: req.ip,
      },
    }).catch(() => {});

    res.json(user);
  } catch (err) { next(err); }
});

router.patch('/users/:id/unflag', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { flagged: false } as any,
      select: { id: true, phone: true, flagged: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.id,
        entityId: user.id,
        entityType: 'USER',
        action: 'UNFLAG',
        ipAddress: req.ip,
      },
    }).catch(() => {});

    res.json(user);
  } catch (err) { next(err); }
});

/**
 * PATCH /admin/users/:id/promote   — grant administrative privileges
 * PATCH /admin/users/:id/demote    — revoke administrative privileges
 *
 * Distinct from /ban and /flag — these endpoints only toggle the isAdmin
 * boolean and write a USER PROMOTE/DEMOTE entry to the audit log, so the
 * admin UI can clearly separate role elevation from user creation flows.
 */
router.patch('/users/:id/promote', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, isAdmin: true, banned: true },
    });
    if (!target)         return res.status(404).json({ error: 'User not found' });
    if (target.isAdmin)  return res.status(409).json({ error: 'User is already an administrator' });
    if (target.banned)   return res.status(409).json({ error: 'Cannot promote a banned user' });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data:  { isAdmin: true } as any,
      select: { id: true, name: true, phone: true, email: true, isAdmin: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.id,
        entityId: user.id,
        entityType: 'USER',
        action: 'PROMOTE',
        ipAddress: req.ip,
      },
    }).catch(() => {});

    logger.info(`[Admin] User ${user.id} promoted to admin by ${(req as any).user?.id}`);
    res.json(user);
  } catch (err) { next(err); }
});

router.patch('/users/:id/demote', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorId = (req as any).user?.id;
    if (actorId && actorId === req.params.id) {
      return res.status(409).json({ error: 'You cannot demote yourself' });
    }
    const target = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, isAdmin: true },
    });
    if (!target)          return res.status(404).json({ error: 'User not found' });
    if (!target.isAdmin)  return res.status(409).json({ error: 'User is not an administrator' });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data:  { isAdmin: false } as any,
      select: { id: true, name: true, phone: true, email: true, isAdmin: true },
    });

    await prisma.auditLog.create({
      data: {
        userId: actorId,
        entityId: user.id,
        entityType: 'USER',
        action: 'DEMOTE',
        ipAddress: req.ip,
      },
    }).catch(() => {});

    logger.info(`[Admin] User ${user.id} demoted from admin by ${actorId}`);
    res.json(user);
  } catch (err) { next(err); }
});

/**
 * GET /admin/users/:id/activity
 * Aggregates a unified activity timeline for a single user, including:
 *  - Deals sent / traveled (with status transitions)
 *  - Trip postings
 *  - Reviews authored / received
 *  - Wallet transactions
 *  - Disputes filed / against
 *  - System audit logs (login, ban, flag, KYC actions, etc.)
 *
 * Query params: ?limit=200 (max 500), ?type=DEAL|TRIP|REVIEW|TRANSACTION|DISPUTE|SYSTEM
 */
router.get('/users/:id/activity', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.id;
    const limit  = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const typeFilter = req.query.type ? String(req.query.type).toUpperCase() : null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, phone: true, email: true, avatar: true,
        kycStatus: true, banned: true, flagged: true, isAdmin: true,
        createdAt: true, lastLoginAt: true, totalDeals: true, rating: true,
        completionRate: true, walletBalance: true, faceVerificationStatus: true,
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const want = (t: string) => !typeFilter || typeFilter === t;

    const [sentDeals, traveledDeals, trips, reviewsGiven, reviewsReceived,
           transactions, disputesFiled, disputesAgainst, auditLogs] = await Promise.all([
      want('DEAL') ? prisma.deal.findMany({
        where: { senderId: userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true, title: true, status: true, fromCity: true, toCity: true,
          price: true, currency: true, createdAt: true, updatedAt: true,
          cancelledAt: true, cancelReason: true,
        },
      }) : Promise.resolve([]),
      want('DEAL') ? prisma.deal.findMany({
        where: { travelerId: userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true, title: true, status: true, fromCity: true, toCity: true,
          price: true, currency: true, createdAt: true, updatedAt: true,
          cancelledAt: true, cancelReason: true,
        },
      }) : Promise.resolve([]),
      want('TRIP') ? prisma.trip.findMany({
        where: { travelerId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, fromCity: true, toCity: true, status: true,
          departureDate: true, transportType: true, price: true, currency: true,
          createdAt: true, updatedAt: true,
        },
      }) : Promise.resolve([]),
      want('REVIEW') ? prisma.review.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, rating: true, comment: true, dealId: true,
          targetId: true, target: { select: { name: true, phone: true } },
          createdAt: true, sentiment: true, flagged: true,
        },
      }) : Promise.resolve([]),
      want('REVIEW') ? prisma.review.findMany({
        where: { targetId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, rating: true, comment: true, dealId: true,
          authorId: true, author: { select: { name: true, phone: true } },
          createdAt: true, sentiment: true, flagged: true,
        },
      }) : Promise.resolve([]),
      want('TRANSACTION') ? prisma.transaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, type: true, amount: true, currency: true, status: true,
          dealId: true, createdAt: true,
        },
      }) : Promise.resolve([]),
      want('DISPUTE') ? prisma.dispute.findMany({
        where: { filerId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, status: true, reason: true, dealId: true, createdAt: true, updatedAt: true },
      }).catch(() => []) : Promise.resolve([]),
      want('DISPUTE') ? prisma.dispute.findMany({
        where: { againstId: userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, status: true, reason: true, dealId: true, createdAt: true, updatedAt: true },
      }).catch(() => []) : Promise.resolve([]),
      want('SYSTEM') ? prisma.auditLog.findMany({
        where: { OR: [{ userId }, { entityId: userId, entityType: 'USER' }] },
        orderBy: { recordedAt: 'desc' },
        take: limit,
      }) : Promise.resolve([]),
    ]);

    type Event = {
      id: string;
      category: 'DEAL' | 'TRIP' | 'REVIEW' | 'TRANSACTION' | 'DISPUTE' | 'SYSTEM';
      action: string;
      timestamp: string;
      title: string;
      description?: string;
      meta?: Record<string, any>;
    };

    const events: Event[] = [];

    for (const d of sentDeals) {
      events.push({
        id: `deal-sent-${d.id}`,
        category: 'DEAL',
        action: `DEAL_${d.status}`,
        timestamp: (d.updatedAt || d.createdAt).toISOString(),
        title: `Sent package: ${d.title}`,
        description: `${d.fromCity} → ${d.toCity} • ${d.currency} ${d.price.toFixed(2)}`,
        meta: { dealId: d.id, status: d.status, role: 'SENDER', cancelReason: d.cancelReason },
      });
    }
    for (const d of traveledDeals) {
      events.push({
        id: `deal-traveled-${d.id}`,
        category: 'DEAL',
        action: `DEAL_${d.status}`,
        timestamp: (d.updatedAt || d.createdAt).toISOString(),
        title: `Carried package: ${d.title}`,
        description: `${d.fromCity} → ${d.toCity} • ${d.currency} ${d.price.toFixed(2)}`,
        meta: { dealId: d.id, status: d.status, role: 'TRAVELER', cancelReason: d.cancelReason },
      });
    }
    for (const t of trips) {
      events.push({
        id: `trip-${t.id}`,
        category: 'TRIP',
        action: `TRIP_${t.status}`,
        timestamp: (t.updatedAt || t.createdAt).toISOString(),
        title: `Posted trip: ${t.fromCity} → ${t.toCity}`,
        description: `${t.transportType} • ${t.currency} ${t.price.toFixed(2)}${t.departureDate ? ` • departs ${t.departureDate.toISOString().slice(0, 10)}` : ''}`,
        meta: { tripId: t.id, status: t.status, transportType: t.transportType },
      });
    }
    for (const r of reviewsGiven) {
      events.push({
        id: `review-given-${r.id}`,
        category: 'REVIEW',
        action: 'REVIEW_AUTHORED',
        timestamp: r.createdAt.toISOString(),
        title: `Left a ${r.rating}★ review${r.target?.name ? ` for ${r.target.name}` : ''}`,
        description: r.comment || undefined,
        meta: { reviewId: r.id, dealId: r.dealId, rating: r.rating, sentiment: r.sentiment, flagged: r.flagged, role: 'AUTHOR' },
      });
    }
    for (const r of reviewsReceived) {
      events.push({
        id: `review-received-${r.id}`,
        category: 'REVIEW',
        action: 'REVIEW_RECEIVED',
        timestamp: r.createdAt.toISOString(),
        title: `Received a ${r.rating}★ review${r.author?.name ? ` from ${r.author.name}` : ''}`,
        description: r.comment || undefined,
        meta: { reviewId: r.id, dealId: r.dealId, rating: r.rating, sentiment: r.sentiment, flagged: r.flagged, role: 'TARGET' },
      });
    }
    for (const tx of transactions) {
      events.push({
        id: `tx-${tx.id}`,
        category: 'TRANSACTION',
        action: `TX_${tx.type}`,
        timestamp: tx.createdAt.toISOString(),
        title: `${tx.type.replace(/_/g, ' ')} • ${tx.currency} ${tx.amount.toFixed(2)}`,
        description: `Status: ${tx.status}${tx.dealId ? ` • deal ${tx.dealId}` : ''}`,
        meta: { txId: tx.id, type: tx.type, status: tx.status, dealId: tx.dealId, amount: tx.amount, currency: tx.currency },
      });
    }
    for (const d of disputesFiled) {
      events.push({
        id: `dispute-filed-${d.id}`,
        category: 'DISPUTE',
        action: `DISPUTE_${d.status}`,
        timestamp: (d.updatedAt || d.createdAt).toISOString(),
        title: `Filed dispute on deal ${d.dealId}`,
        description: d.reason || undefined,
        meta: { disputeId: d.id, dealId: d.dealId, status: d.status, role: 'FILER' },
      });
    }
    for (const d of disputesAgainst) {
      events.push({
        id: `dispute-against-${d.id}`,
        category: 'DISPUTE',
        action: `DISPUTE_${d.status}`,
        timestamp: (d.updatedAt || d.createdAt).toISOString(),
        title: `Dispute filed against this user on deal ${d.dealId}`,
        description: d.reason || undefined,
        meta: { disputeId: d.id, dealId: d.dealId, status: d.status, role: 'AGAINST' },
      });
    }
    for (const a of auditLogs) {
      let metadata: any = null;
      try { metadata = a.metadata ? JSON.parse(a.metadata) : null; } catch { metadata = a.metadata; }
      events.push({
        id: `audit-${a.id}`,
        category: 'SYSTEM',
        action: a.action,
        timestamp: a.recordedAt.toISOString(),
        title: `${a.action} on ${a.entityType}`,
        description: a.ipAddress ? `from ${a.ipAddress}` : undefined,
        meta: { entityId: a.entityId, entityType: a.entityType, ipAddress: a.ipAddress, metadata },
      });
    }

    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const trimmed = events.slice(0, limit);

    const counts = {
      total: events.length,
      DEAL: events.filter(e => e.category === 'DEAL').length,
      TRIP: events.filter(e => e.category === 'TRIP').length,
      REVIEW: events.filter(e => e.category === 'REVIEW').length,
      TRANSACTION: events.filter(e => e.category === 'TRANSACTION').length,
      DISPUTE: events.filter(e => e.category === 'DISPUTE').length,
      SYSTEM: events.filter(e => e.category === 'SYSTEM').length,
    };

    res.json({ user, events: trimmed, counts });
  } catch (err) { next(err); }
});

export default router;
