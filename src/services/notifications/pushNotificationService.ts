// Bridger Push Notifications Service
// Handles push notifications for deals, messages, payments

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { apiClient } from '../api/client';
import { avatarCache } from '../avatar/avatarCache';

// Remote push notifications require a development build in SDK 53+.
// Detect Expo Go so we can skip any API calls that would throw or warn.
const isExpoGo = Constants.appOwnership === 'expo';

// Configure notification behavior — only in dev/prod builds, not Expo Go
if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// Notification types
export type NotificationType = 
  | 'deal_accepted'
  | 'deal_cancelled'
  | 'payment_received'
  | 'payment_released'
  | 'new_message'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'delivery_reminder'
  | 'escrow_received';

interface BridgerNotification {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

// Push Notification Service
export const pushNotificationService = {
  // Initialize push notifications
  initialize: async (): Promise<boolean> => {
    try {
      if (!Device.isDevice) return false;

      // expo-notifications remote push is not supported in Expo Go (SDK 53+)
      if (isExpoGo) return false;

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted');
        return false;
      }

      // Set up Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1E3B8A',
        });

        await Notifications.setNotificationChannelAsync('deals', {
          name: 'Deals',
          importance: Notifications.AndroidImportance.HIGH,
          description: 'Notifications about deal updates',
        });

        await Notifications.setNotificationChannelAsync('messages', {
          name: 'Messages',
          importance: Notifications.AndroidImportance.HIGH,
          description: 'New message notifications',
        });

        await Notifications.setNotificationChannelAsync('payments', {
          name: 'Payments',
          importance: Notifications.AndroidImportance.MAX,
          description: 'Payment and transaction notifications',
        });
      }

      console.log('Push notifications initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize push notifications:', error);
      return false;
    }
  },

  // Get and register push token
  registerPushToken: async (): Promise<string | null> => {
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      // Skip push token in Expo Go — requires a development build with a valid EAS projectId
      if (!projectId || !/^[0-9a-f-]{36}$/.test(projectId)) {
        console.log('Push token skipped — no valid EAS projectId (use a dev build for push)');
        return null;
      }

      const pushToken = await Notifications.getExpoPushTokenAsync({ projectId });

      console.log('Push token:', pushToken.data);

      // Register token with backend (authenticated)
      try {
        await apiClient.patch('/users/me/push-token', { pushToken: pushToken.data });
      } catch (e) {
        console.log('Could not register push token with backend');
      }

      return pushToken.data;
    } catch (error) {
      console.error('Failed to get push token:', error);
      return null;
    }
  },

  // Add notification listeners
  addListeners: (handlers: {
    onNotificationReceived?: (notification: Notifications.Notification) => void;
    onNotificationResponseReceived?: (response: Notifications.NotificationResponse) => void;
  }): Array<Notifications.EventSubscription> => {
    const subscriptions: Array<Notifications.EventSubscription> = [];

    if (handlers.onNotificationReceived) {
      const subscription = Notifications.addNotificationReceivedListener(
        (notification) => {
          // Seed avatar cache from any incoming push that carries an avatar URL
          const data = notification.request.content.data as Record<string, unknown>;
          const userId = data?.senderUserId as string | undefined;
          const avatarUrl = data?.senderAvatarUrl as string | undefined;
          if (userId && avatarUrl) {
            avatarCache.register(userId, avatarUrl);
          }
          handlers.onNotificationReceived?.(notification);
        }
      );
      subscriptions.push(subscription);
    }

    if (handlers.onNotificationResponseReceived) {
      const subscription = Notifications.addNotificationResponseReceivedListener(
        handlers.onNotificationResponseReceived
      );
      subscriptions.push(subscription);
    }

    return subscriptions;
  },

  // Remove all listeners
  removeListeners: (subscriptions: Array<Notifications.EventSubscription>): void => {
    subscriptions.forEach(sub => sub.remove());
  },

  // Schedule local notification
  scheduleNotification: async (
    notification: BridgerNotification,
    delaySeconds = 0
  ): Promise<string | null> => {
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data,
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: delaySeconds,
        },
      });

      return id;
    } catch (error) {
      console.error('Failed to schedule notification:', error);
      return null;
    }
  },

  // Send immediate local notification
  sendNotification: async (
    notification: BridgerNotification
  ): Promise<void> => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data,
          sound: true,
        },
        trigger: null, // Immediate
      });
    } catch (error) {
      console.error('Failed to send notification:', error);
    }
  },

  /**
   * Schedule a new-message local notification with the sender's avatar.
   *
   * iOS:  The avatar URL is passed as a notification attachment so it appears
   *       as a thumbnail on the lock screen and in the notification banner.
   *       expo-notifications supports this via `content.attachments`.
   *
   * Android: The avatar URL is stored in `data.senderAvatarUrl`. The
   *          foreground handler (addListeners → onNotificationReceived) can
   *          use this to update the in-app cache; the OS-level large icon
   *          would require a downloaded local file which is handled by the
   *          backend's push payload (see Expo push server docs).
   *
   * No duplicate threads: the conversationId is embedded in `data` so the
   * tap handler routes back to the existing chat room, never creating a new one.
   */
  sendMessageNotification: async (params: {
    senderName: string;
    senderUserId?: string;
    senderAvatarUrl?: string;
    messagePreview: string;
    conversationId: string;
  }): Promise<void> => {
    const { senderName, senderUserId, senderAvatarUrl, messagePreview, conversationId } = params;

    // Seed the avatar cache so the chat screen renders instantly on tap
    if (senderUserId && senderAvatarUrl) {
      avatarCache.register(senderUserId, senderAvatarUrl);
    }

    // Validate avatar URL — only HTTPS is safe to attach
    const safeAvatarUrl =
      senderAvatarUrl?.startsWith('https://') ? senderAvatarUrl : undefined;

    try {
      const content: Notifications.NotificationContentInput = {
        title: senderName,
        body: messagePreview,
        sound: true,
        data: {
          type: 'new_message',
          conversationId,
          senderUserId: senderUserId ?? null,
          senderAvatarUrl: safeAvatarUrl ?? null,
        },
        ...(Platform.OS === 'ios' && safeAvatarUrl
          ? { attachments: [{ url: safeAvatarUrl, identifier: senderUserId ?? 'avatar', type: 'image' }] }
          : {}),
      };

      await Notifications.scheduleNotificationAsync({ content, trigger: null });
    } catch (error) {
      console.error('Failed to send message notification:', error);
    }
  },

  // Cancel all scheduled notifications
  cancelAllNotifications: async (): Promise<void> => {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  // Get badge count
  getBadgeCount: async (): Promise<number> => {
    return await Notifications.getBadgeCountAsync();
  },

  // Set badge count
  setBadgeCount: async (count: number): Promise<void> => {
    await Notifications.setBadgeCountAsync(count);
  },

  // Handle notification tap - navigate to appropriate screen
  handleNotificationTap: (data: Record<string, unknown>): {
    screen: string;
    params?: Record<string, unknown>;
  } | null => {
    const type = data.type as string;
    const dealId = data.dealId as string;
    const conversationId = data.conversationId as string;

    switch (type) {
      case 'deal_accepted':
      case 'deal_cancelled':
      case 'delivery_reminder':
        return {
          screen: 'DealDetails',
          params: { dealId },
        };

      case 'new_message':
        return {
          screen: 'ChatDetail',
          params: { conversationId },
        };

      case 'payment_received':
      case 'payment_released':
      case 'escrow_received':
        return {
          screen: 'Wallet',
          params: {},
        };

      case 'kyc_approved':
      case 'kyc_rejected':
        return {
          screen: 'KYCStatus',
          params: {},
        };

      default:
        return {
          screen: 'Home',
          params: {},
        };
    }
  },
};

/**
 * Set up automatic push token refresh whenever the app comes to the foreground.
 * Expo tokens can rotate; without this, push notifications silently fail after
 * the user's token expires.
 *
 * Call this once from your root App component or app bootstrap.
 * Returns a cleanup function to remove the listener.
 */
export function setupPushTokenRefresh(): () => void {
  // Remote push tokens are unavailable in Expo Go — return a no-op cleanup
  if (isExpoGo) return () => {};

  const handleAppStateChange = async (nextState: AppStateStatus) => {
    if (nextState !== 'active') return;

    try {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;

      const pushToken = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId || 'bridger-app',
      });

      // Upsert token on backend (idempotent — only writes if changed)
      await apiClient.patch('/users/me/push-token', { pushToken: pushToken.data });
    } catch {
      // Non-critical — silently ignore
    }
  };

  const subscription = AppState.addEventListener('change', handleAppStateChange);
  return () => subscription.remove();
}

// Export notification types for easier use
export const NotificationTypes = {
  DEAL_ACCEPTED: 'deal_accepted',
  DEAL_CANCELLED: 'deal_cancelled',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_RELEASED: 'payment_released',
  NEW_MESSAGE: 'new_message',
  KYC_APPROVED: 'kyc_approved',
  KYC_REJECTED: 'kyc_rejected',
  DELIVERY_REMINDER: 'delivery_reminder',
  ESCROW_RECEIVED: 'escrow_received',
} as const;

export default pushNotificationService;
