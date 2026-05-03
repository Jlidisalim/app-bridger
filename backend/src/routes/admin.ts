/**
 * Admin CRUD routes — all protected by authenticate + requireAdmin.
 * Provides management access to AuditLog, AdminTask, and PricingDataPoint.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
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
      kycManualReview,
      openTasks,
      recentDeals,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.deal.count(),
      prisma.deal.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.dispute.count({ where: { status: { in: ['OPENED', 'EVIDENCE_SUBMITTED', 'ADMIN_REVIEWING'] } } }),
      prisma.user.count({ where: { kycStatus: 'PENDING' } }),
      prisma.user.count({ where: { kycStatus: 'MANUAL_REVIEW' } }),
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
      kpis: { totalUsers, totalDeals, successfulMatches, matchRate, openDisputes, kycPending, kycManualReview, openTasks },
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
        include: { user: { select: { id: true, name: true, phone: true } } },
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
    const [totalUsers, totalDeals, dealStatusGroups] = await Promise.all([
      prisma.user.count(),
      prisma.deal.count(),
      prisma.deal.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const dealsByStatus: Record<string, number> = {};
    for (const g of dealStatusGroups) dealsByStatus[g.status] = g._count._all;
    const successfulMatches = ['MATCHED','PICKED_UP','IN_TRANSIT','DELIVERED','COMPLETED']
      .reduce((acc, s) => acc + (dealsByStatus[s] ?? 0), 0);
    const matchRate = totalDeals > 0 ? Math.round((successfulMatches / totalDeals) * 100) : 0;

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
    const revenueByCountry = Object.entries(countryMap)
      .map(([country, v]) => ({ country, revenue: Math.round(v.revenue), deals: v.deals }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    res.json({ kpis: { totalUsers, totalDeals, matchRate }, revenueMonthly, topRoutes, dealsByCategory, userGrowth, revenueByCountry });
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

/** GET /admin/disputes?page=1&limit=15&status=ADMIN_REVIEWING — paginated dispute list for admins */
router.get('/disputes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page  = Math.max(1, Number(req.query.page)  || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (req.query.status) where.status = String(req.query.status);

    const [disputes, total] = await prisma.$transaction([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          deal:     { select: { id: true, fromCity: true, toCity: true, price: true } },
          filer:    { select: { id: true, name: true, avatar: true } },
          against:  { select: { id: true, name: true, avatar: true } },
          evidences: { orderBy: { createdAt: 'asc' } },
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

    const items = disputes.map(d => ({
      ...d,
      adminTaskId: taskByDisputeId[d.id]?.id ?? null,
      assignedTo:  taskByDisputeId[d.id]?.assignedTo ?? null,
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
 * GET /admin/users/:id/kyc-documents
 * Returns the user profile and all KYC documents on file.
 * Shape consumed by espace-admin's UserKycPreview page:
 *   { user: {...full profile...}, documents: [{ id, documentType, frontUrl, backUrl, status, createdAt }, ...] }
 */
router.get('/users/:id/kyc-documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, phone: true, name: true, avatar: true, email: true,
        idDocumentNumber: true, kycStatus: true,
        faceVerificationStatus: true, faceConfidenceScore: true, faceVerifiedAt: true,
        banned: true, flagged: true, reasonForBan: true,
        isAdmin: true, walletBalance: true, rating: true, totalDeals: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const documents = await prisma.kycDocument.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, documentType: true, frontUrl: true, backUrl: true,
        status: true, createdAt: true, updatedAt: true,
      },
    });

    res.json({ user, documents });
  } catch (err) { next(err); }
});

/**
 * PATCH /admin/users/:id/kyc — { status: 'APPROVED' | 'REJECTED', documentId?: string }
 * - With documentId: updates that one KycDocument's status.
 * - Without documentId: applies the decision to every document for the user
 *   AND updates User.kycStatus so the user's overall verification state moves.
 */
router.patch('/users/:id/kyc', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, documentId } = req.body || {};
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'status must be APPROVED or REJECTED' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (documentId) {
      const doc = await prisma.kycDocument.update({
        where: { id: documentId },
        data: { status },
      });

      await prisma.auditLog.create({
        data: {
          userId: (req as any).user?.id,
          entityId: doc.id,
          entityType: 'USER',
          action: status === 'APPROVED' ? 'KYC_DOC_APPROVE' : 'KYC_DOC_REJECT',
          ipAddress: req.ip,
          metadata: JSON.stringify({ targetUserId: user.id, documentId }),
        },
      }).catch(() => {});

      return res.json({ document: doc });
    }

    // Admin finalizing a manual-review case clears the auto-set `flagged`
    // bit so the user no longer appears in the moderation queue.
    const [, updatedUser] = await prisma.$transaction([
      prisma.kycDocument.updateMany({
        where: { userId: user.id },
        data: { status },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          kycStatus: status,
          flagged: false,
          faceVerificationStatus: status === 'APPROVED' ? 'VERIFIED' : 'FAILED',
          faceVerifiedAt: status === 'APPROVED' ? new Date() : null,
        } as any,
        select: { id: true, kycStatus: true, flagged: true, faceVerificationStatus: true },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        userId: (req as any).user?.id,
        entityId: user.id,
        entityType: 'USER',
        action: status === 'APPROVED' ? 'KYC_APPROVE' : 'KYC_REJECT',
        ipAddress: req.ip,
      },
    }).catch(() => {});

    logger.info(`[Admin] KYC ${status} for user ${user.id} by ${(req as any).user?.id}`);
    res.json({ user: updatedUser });
  } catch (err) { next(err); }
});

export default router;
