// Notifications Routes
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updateNotificationSettingsSchema } from '../validators/auth';
import { prisma } from '../config/db';

const router = Router();

// GET /notifications - List notifications
router.get('/', authenticate, async (req: any, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.id },
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.notification.count({ where: { userId: req.user.id } }),
      prisma.notification.count({ where: { userId: req.user.id, read: false } })
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + take < total,
      unreadCount
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /notifications/:id/read - Mark as read
router.patch('/:id/read', authenticate, async (req: any, res, next) => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id }
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (notification.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.notification.update({
      where: { id: req.params.id },
      data: { read: true }
    });

    res.json({ message: 'Marked as read' });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/read-all - Mark all as read
router.post('/read-all', authenticate, async (req: any, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true }
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
});

// GET /notifications/settings - Get notification settings
router.get('/settings', authenticate, async (req: any, res, next) => {
  try {
    let settings = await prisma.notificationSettings.findUnique({
      where: { userId: req.user.id },
    });

    if (!settings) {
      settings = await prisma.notificationSettings.create({
        data: { userId: req.user.id },
      });
    }

    res.json({
      deals: settings.deals,
      messages: settings.messages,
      payments: settings.payments,
      promotions: settings.promotions,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /notifications/settings - Update notification settings
router.patch('/settings', authenticate, validate(updateNotificationSettingsSchema), async (req: any, res, next) => {
  try {
    const data = req.validated || req.body;

    const settings = await prisma.notificationSettings.upsert({
      where: { userId: req.user.id },
      update: data,
      create: { userId: req.user.id, ...data },
    });

    res.json({
      deals: settings.deals,
      messages: settings.messages,
      payments: settings.payments,
      promotions: settings.promotions,
    });
  } catch (error) {
    next(error);
  }
});

// POST /notifications/push-token - Register push token
router.post('/push-token', authenticate, async (req: any, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Push token is required' });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { pushToken: token },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
