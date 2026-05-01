import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { prisma } from '../config/db';
import config from '../config/env';
import logger from '../utils/logger';
import { getIO } from './websocket';

const expo = new Expo({
  accessToken: config.expo.accessToken,
});

interface PushNotificationData {
  type: string;
  [key: string]: any;
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: PushNotificationData
): Promise<void> {
  // Get user's push token
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushToken: true },
  });

  if (!user?.pushToken) {
    logger.debug(`No push token for user ${userId}`);
    return;
  }

  // Validate push token
  if (!Expo.isExpoPushToken(user.pushToken)) {
    logger.debug(`Invalid push token for user ${userId}`);
    return;
  }

  const messages: ExpoPushMessage[] = [
    {
      to: user.pushToken,
      sound: 'default',
      title,
      body,
      data: data || { type: 'general' },
    },
  ];

  try {
    const chunks = expo.chunkPushNotifications(messages);
    
    for (const chunk of chunks) {
      try {
        const receipts = await expo.sendPushNotificationsAsync(chunk);
        logger.debug('Push notification sent');
      } catch (error) {
        logger.error('Error sending push notification chunk', { error: String(error) });
      }
    }

    // Create notification record in database
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        body,
        type: data?.type || 'general',
        data: data ? JSON.stringify(data) : null,
      },
    });

    // Real-time alert: emit to the user's personal socket room so the
    // frontend badge increments without waiting for a pull refresh.
    try {
      getIO()?.to(`user:${userId}`).emit('new_notification', {
        id: notification.id,
        title,
        body,
        type: notification.type,
        data: data ?? null,
      });
    } catch {}
  } catch (error) {
    logger.error('Error sending push notifications', { error: String(error) });
  }
}

export async function sendPushToMultiple(
  userIds: string[],
  title: string,
  body: string,
  data?: PushNotificationData
): Promise<void> {
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, pushToken: true },
  });

  const validTokens = users
    .filter((u) => u.pushToken && Expo.isExpoPushToken(u.pushToken))
    .map((u) => u.pushToken!);

  if (validTokens.length === 0) {
    return;
  }

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: data || { type: 'general' },
  }));

  try {
    const chunks = expo.chunkPushNotifications(messages);
    
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        logger.error('Error sending push notification chunk', { error: String(error) });
      }
    }

    // Create notification records
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        title,
        body,
        type: data?.type || 'general',
        data: data ? JSON.stringify(data) : null,
      })),
    });

    // Real-time alerts via socket for each recipient
    try {
      const io = getIO();
      if (io) {
        for (const uid of userIds) {
          io.to(`user:${uid}`).emit('new_notification', {
            title,
            body,
            type: data?.type || 'general',
            data: data ?? null,
          });
        }
      }
    } catch {}
  } catch (error) {
    logger.error('Error sending push notifications', { error: String(error) });
  }
}
