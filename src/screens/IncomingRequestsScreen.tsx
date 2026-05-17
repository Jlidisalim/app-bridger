import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check, X, Star, ShieldCheck, Inbox } from 'lucide-react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Typography } from '../components/Typography';
import { Avatar } from '../components/Avatar';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { dealsAPI } from '../services/api';
import { useUserCurrency } from '../utils/currency';
import type { AppStackParamList } from '../navigation/types';

type Mode = 'deal' | 'trip';

type RequestItem = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  proposedPrice: number;
  message?: string | null;
  createdAt: string;
  requester: {
    id: string;
    name?: string;
    avatar?: string;
    profilePhoto?: string;
    rating?: number;
    verified?: boolean;
    totalDeals?: number;
  };
};

interface Props {
  mode: Mode;
  id: string;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

export const IncomingRequestsScreen: React.FC<Props> = ({ mode, id }) => {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const currency = useUserCurrency();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = mode === 'deal'
      ? await dealsAPI.listDealRequests(id)
      : await dealsAPI.listTripRequests(id);
    if (res.success) setItems((res.items as RequestItem[]) || []);
    return res.success;
  }, [mode, id]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const onAccept = (req: RequestItem) => {
    if (actingId) return;
    Alert.alert(
      'Accept this request?',
      `${req.requester.name || 'This user'} will be matched at ${currency.symbol}${req.proposedPrice}. Other pending requests on this listing will be declined.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            setActingId(req.id);
            try {
              const res = mode === 'deal'
                ? await dealsAPI.acceptDealRequest(id, req.id)
                : await dealsAPI.acceptTripRequest(id, req.id);
              if (res.success) {
                Alert.alert('Matched', `You are now matched with ${req.requester.name || 'this user'}.`, [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              } else {
                Alert.alert('Could not accept', res.error || 'Please try again.');
                await load();
              }
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  };

  const onReject = (req: RequestItem) => {
    if (actingId) return;
    Alert.alert(
      'Decline this request?',
      `${req.requester.name || 'This user'} will be notified.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            setActingId(req.id);
            try {
              const res = mode === 'deal'
                ? await dealsAPI.rejectDealRequest(id, req.id)
                : await dealsAPI.rejectTripRequest(id, req.id);
              if (!res.success) Alert.alert('Could not decline', res.error || 'Please try again.');
              await load();
            } finally {
              setActingId(null);
            }
          },
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: RequestItem }) => {
    const isPending = item.status === 'PENDING';
    const isAccepted = item.status === 'ACCEPTED';
    const isRejected = item.status === 'REJECTED';
    const statusColor = isAccepted ? '#34C759' : isRejected ? '#FF3B30' : '#8E8E93';
    const statusLabel = isAccepted ? 'Accepted' : isRejected ? 'Declined' : 'Withdrawn';

    return (
      <View style={[styles.card, !isPending && styles.cardDecided]}>
        <View style={styles.row}>
          <Avatar
            userId={item.requester.id}
            uri={item.requester.profilePhoto || item.requester.avatar}
            name={item.requester.name}
            size={48}
          />
          <View style={styles.identity}>
            <View style={styles.nameRow}>
              <Typography size="md" weight="bold">{item.requester.name || 'User'}</Typography>
              {item.requester.verified && <ShieldCheck color={COLORS.primary} size={14} />}
            </View>
            <View style={styles.metaRow}>
              <Star color="#f59e0b" size={12} fill="#f59e0b" />
              <Typography size="xs" color="#666">
                {typeof item.requester.rating === 'number' ? item.requester.rating.toFixed(1) : '—'}
                {typeof item.requester.totalDeals === 'number' ? ` · ${item.requester.totalDeals} deals` : ''}
                {' · '}{formatRelativeTime(item.createdAt)}
              </Typography>
            </View>
          </View>
          <View style={styles.priceCol}>
            <Typography size="lg" weight="bold" color={COLORS.primary}>
              {currency.symbol}{item.proposedPrice}
            </Typography>
          </View>
        </View>

        {item.message ? (
          <Typography size="sm" color="#666" style={styles.message}>
            "{item.message}"
          </Typography>
        ) : null}

        {isPending ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.btnReject]}
              onPress={() => onReject(item)}
              disabled={actingId === item.id}
              activeOpacity={0.7}
            >
              <X color="#FF3B30" size={18} />
              <Typography size="sm" weight="bold" color="#FF3B30">Decline</Typography>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnAccept]}
              onPress={() => onAccept(item)}
              disabled={actingId === item.id}
              activeOpacity={0.7}
            >
              {actingId === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Check color="#fff" size={18} />
                  <Typography size="sm" weight="bold" color="#fff">Accept</Typography>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.statusFooter}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Typography size="xs" weight="bold" color={statusColor}>{statusLabel}</Typography>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography size="lg" weight="bold">Requests</Typography>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Inbox size={48} color="#ccc" />
              <Typography size="md" color="#999" style={{ marginTop: 16 }}>
                No requests yet
              </Typography>
              <Typography size="xs" color="#bbb" style={styles.emptyHint}>
                {mode === 'deal'
                  ? "When a traveler asks to carry your package, it will appear here."
                  : "When a sender asks to ship on your trip, it will appear here."}
              </Typography>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

export const DealRequestsScreen: React.FC = () => {
  const route = useRoute<RouteProp<AppStackParamList, 'DealRequests'>>();
  return <IncomingRequestsScreen mode="deal" id={route.params.dealId} />;
};

export const TripRequestsScreen: React.FC = () => {
  const route = useRoute<RouteProp<AppStackParamList, 'TripRequests'>>();
  return <IncomingRequestsScreen mode="trip" id={route.params.tripId} />;
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
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
  backButton: { padding: 4, width: 40, alignItems: 'flex-start' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: SPACING.md },
  card: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardDecided: { opacity: 0.7 },
  row: { flexDirection: 'row', alignItems: 'center' },
  identity: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  message: {
    marginTop: 10,
    paddingLeft: 60,
    fontStyle: 'italic',
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  btnReject: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#FF3B30' },
  btnAccept: { backgroundColor: COLORS.primary },
  statusFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: SPACING.xl,
  },
  emptyHint: { marginTop: 8, textAlign: 'center' },
});

export default IncomingRequestsScreen;
