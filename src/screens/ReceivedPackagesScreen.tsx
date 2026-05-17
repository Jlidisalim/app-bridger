import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ArrowLeft,
  Package,
  ChevronRight,
  ShieldCheck,
  Plane,
  Inbox,
  User as UserIcon,
} from 'lucide-react-native';

import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { useAppStore } from '../store/useAppStore';
import { AppStackParamList } from '../navigation/types';

// Maps backend status → human label + color.
const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  OPEN:         { label: 'Awaiting traveler', color: '#0369a1', bg: '#e0f2fe' },
  MATCHED:      { label: 'Matched',           color: '#1d4ed8', bg: '#dbeafe' },
  ESCROW_PAID:  { label: 'Paid',              color: '#1d4ed8', bg: '#dbeafe' },
  PICKED_UP:    { label: 'Picked up',         color: '#7c3aed', bg: '#ede9fe' },
  IN_TRANSIT:   { label: 'In transit',        color: '#7c3aed', bg: '#ede9fe' },
  DELIVERED:    { label: 'Arrived',           color: '#065f46', bg: '#d1fae5' },
  COMPLETED:    { label: 'Completed',         color: '#065f46', bg: '#d1fae5' },
  CANCELLED:    { label: 'Cancelled',         color: '#991b1b', bg: '#fee2e2' },
  DISPUTED:     { label: 'Disputed',          color: '#b45309', bg: '#fef3c7' },
};

function statusBadge(status?: string) {
  return STATUS_LABEL[status || ''] || { label: status || 'Pending', color: '#475569', bg: '#e2e8f0' };
}

export const ReceivedPackagesScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const items = useAppStore((s) => s.receivedPackages);
  const loading = useAppStore((s) => s.receivedPackagesLoading);
  const fetchReceivedPackages = useAppStore((s) => s.fetchReceivedPackages);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchReceivedPackages();
    }, [fetchReceivedPackages])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchReceivedPackages();
    } finally {
      setRefreshing(false);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const sender = item.sender || {};
    const badge = statusBadge(item.status);
    const route = `${item.fromCity || '—'} → ${item.toCity || '—'}`;
    const pickup = item.pickupDate ? new Date(item.pickupDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null;
    const avatar = sender.profilePhoto || sender.avatar;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('Tracking', { dealId: item.id })}
        activeOpacity={0.8}
      >
        {/* Sender row — answers "who put me as receiver" */}
        <View style={styles.senderRow}>
          <View style={styles.avatarWrap}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <UserIcon size={18} color={COLORS.primary} />
              </View>
            )}
            {sender.verified && (
              <View style={styles.verifiedBadge}>
                <ShieldCheck size={10} color={COLORS.white} />
              </View>
            )}
          </View>
          <View style={styles.flex1}>
            <Typography size="xs" color={COLORS.background.slate[400]}>Sent by</Typography>
            <Typography weight="bold" size="sm" numberOfLines={1}>
              {sender.name || item.senderName || 'Unknown sender'}
            </Typography>
          </View>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Typography size="xs" weight="bold" color={badge.color}>{badge.label}</Typography>
          </View>
        </View>

        {/* Route + meta */}
        <View style={styles.routeRow}>
          <Plane size={16} color={COLORS.background.slate[500]} />
          <Typography size="sm" weight="semibold" color={COLORS.background.slate[700]} style={styles.routeText}>
            {route}
          </Typography>
          {pickup && (
            <Typography size="xs" color={COLORS.background.slate[400]}>{pickup}</Typography>
          )}
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Package size={14} color={COLORS.background.slate[500]} />
            <Typography size="xs" color={COLORS.background.slate[600]} style={styles.metaText}>
              {item.packageSize || item.title || 'Package'}
              {item.weight ? ` · ${item.weight}kg` : ''}
            </Typography>
          </View>
          <View style={styles.trackCta}>
            <Typography size="xs" weight="bold" color={COLORS.primary}>Track</Typography>
            <ChevronRight size={14} color={COLORS.primary} />
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
          <ArrowLeft size={22} color={COLORS.background.slate[700]} />
        </TouchableOpacity>
        <View style={styles.flex1}>
          <Typography size="lg" weight="bold">Packages for me</Typography>
          <Typography size="xs" color={COLORS.background.slate[500]}>
            Shipments where you're the receiver
          </Typography>
        </View>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Inbox size={36} color={COLORS.primary} />
              </View>
              <Typography weight="bold" size="md" style={styles.emptyTitle}>
                No packages addressed to you yet
              </Typography>
              <Typography size="sm" color={COLORS.background.slate[500]} align="center" style={styles.emptyHint}>
                When a sender enters your phone number as the receiver, the shipment will appear here automatically.
              </Typography>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background.light },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.lg,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: COLORS.white,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background.slate[100],
  },
  flex1: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: {
    padding: SPACING.xl,
    paddingBottom: 120,
    gap: 12,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: `${COLORS.primary}10`,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  senderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPlaceholder: {
    backgroundColor: `${COLORS.primary}0D`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeText: { flex: 1 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  metaText: { flex: 1 },
  trackCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${COLORS.primary}10`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { marginBottom: 8 },
  emptyHint: { lineHeight: 20 },
});
