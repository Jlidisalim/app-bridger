import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  RefreshControl,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { notificationsApi } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import { ArrowLeft, Bell, Package, MessageSquare, CreditCard, CheckCheck } from 'lucide-react-native';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'deal' | 'message' | 'payment' | 'system';
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 4) return `${diffWeek}w ago`;
  return date.toLocaleDateString();
}

export const NotificationsScreen: React.FC = () => {
  const navigation = useNavigation();
  const { setUnreadNotificationCount } = useAppStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      setError(null);
      const response = await notificationsApi.getHistory({ page: 1, limit: 50 });
      if (response.success && response.data) {
        const items = (response.data.items || []) as Notification[];
        setNotifications(items);
        // Sync the global unread badge
        setUnreadNotificationCount(items.filter(n => !n.read).length);
      } else {
        setNotifications([]);
        setUnreadNotificationCount(0);
      }
    } catch (err: any) {
      setError('Could not load notifications. Pull to retry.');
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchNotifications();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchNotifications();
  };

  const handleMarkAllRead = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      await notificationsApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadNotificationCount(0);
    } catch {
      // non-critical — local state already reflects intent
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.read) {
      await notificationsApi.markAsRead(notification.id);
      setNotifications(prev =>
        prev.map(n => (n.id === notification.id ? { ...n, read: true } : n))
      );
      setUnreadNotificationCount(
        notifications.filter(n => !n.read && n.id !== notification.id).length
      );
    }

    const data = notification.data || {};

    if (data.dealId) {
      (navigation as any).navigate('DealDetails', {
        dealId: data.dealId as string,
        type: (data.dealType as string) || 'deal',
      });
    } else if (data.conversationId) {
      (navigation as any).navigate('ChatDetail', {
        user: {
          name: (data.senderName as string) || 'User',
          avatar: data.senderAvatar as string | undefined,
        },
        conversationId: data.conversationId as string,
      });
    } else if (data.userName) {
      (navigation as any).navigate('ChatDetail', {
        user: { name: data.userName as string },
      });
    }
  };

  const hasUnread = notifications.some(n => !n.read);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'deal':
        return <Package size={20} color={COLORS.primary} />;
      case 'message':
        return <MessageSquare size={20} color={COLORS.primary} />;
      case 'payment':
        return <CreditCard size={20} color={COLORS.primary} />;
      default:
        return <Bell size={20} color={COLORS.primary} />;
    }
  };

  const renderNotification = ({ item }: { item: Notification }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.read && styles.unread]}
      onPress={() => handleNotificationPress(item)}
    >
      <View style={styles.iconContainer}>
        {getNotificationIcon(item.type)}
      </View>
      <View style={styles.content}>
        <Typography size="sm" weight="bold">{item.title}</Typography>
        <Typography size="xs" color="#666" style={styles.bodyText}>{item.body}</Typography>
        <Typography size="xs" color="#999" style={styles.timeText}>
          {formatRelativeTime(item.createdAt)}
        </Typography>
      </View>
      {!item.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography size="lg" weight="bold">Notifications</Typography>
        {hasUnread ? (
          <TouchableOpacity
            onPress={handleMarkAllRead}
            style={styles.markAllButton}
            disabled={markingAll}
          >
            {markingAll ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <CheckCheck size={20} color={COLORS.primary} />
            )}
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Bell size={48} color="#ccc" />
              <Typography size="md" color="#999" style={{ marginTop: 16 }}>
                {error || 'No notifications'}
              </Typography>
            </View>
          }
          removeClippedSubviews={true}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  markAllButton: {
    padding: 4,
    width: 40,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    padding: SPACING.md,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  unread: {
    backgroundColor: '#f0f7ff',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  content: {
    flex: 1,
  },
  bodyText: {
    marginTop: 2,
  },
  timeText: {
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
});

export default NotificationsScreen;
