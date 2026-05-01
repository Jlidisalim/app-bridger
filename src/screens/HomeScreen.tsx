import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    FlatList,
    RefreshControl,
    StatusBar,
    Image,
    TextInput,
    ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import {
    Home,
    Search as ExploreIcon,
    Plus,
    MessageSquare,
    User,
    Bell,
    Sparkles,
    MapPin,
    ArrowRight,
    Star,
    ShieldCheck,
    ChevronDown,
    Search,
    UserCircle,
    MessageCircle,
    Package,
    Plane,
    Layers,
    XCircle,
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { useSocket } from '../hooks/useSocket';
import { useUserCurrency } from '../utils/currency';
import pushNotificationService from '../services/notifications/pushNotificationService';

interface HomeScreenProps {
    mode: 'sender' | 'traveler';
    onToggleMode: (mode: 'sender' | 'traveler') => void;
    onHome: () => void;
    onExplore: () => void;
    onSendMessage: () => void;
    onProfile: () => void;
    onCreate: () => void;
    onChatWithUser: (user: { name: string; verified?: boolean; userId?: string; avatar?: string; profilePhoto?: string; conversationId?: string; dealId?: string; tripId?: string }) => void;
    onViewDeal: (deal: any) => void;
    onAcceptDeal: (deal: any) => void;
    onNotifications: () => void;
    /** Navigate to the first active deal's tracking, or to CreateSelection if none. */
    onViewMatch: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
    mode,
    onToggleMode,
    onHome,
    onExplore,
    onSendMessage,
    onProfile,
    onCreate,
    onChatWithUser,
    onViewDeal,
    onAcceptDeal,
    onNotifications,
    onViewMatch,
}) => {
    const currency = useUserCurrency();
    const [activeTab, setActiveTab] = useState('shipments');
    const [searchQuery, setSearchQuery] = useState('');
    const [verifiedOnly, setVerifiedOnly] = useState(false);
    const [sortBy, setSortBy] = useState<'date' | 'price' | 'rating' | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const {
        deals, dealsPage, dealsHasMore, fetchDeals,
        trips, tripsPage, tripsHasMore, fetchTrips,
        isLoading, error, currentUser, unreadNotificationCount,
        incrementUnreadNotificationCount,
    } = useAppStore();
    const { socket } = useSocket();
    const lastFetchedAt = useRef<number>(0);

    const loadAll = useCallback(async () => {
        await Promise.all([fetchDeals(1, false), fetchTrips(1, false)]);
        lastFetchedAt.current = Date.now();
    }, [fetchDeals, fetchTrips]);

    const loadMore = useCallback(async () => {
        if (loadingMore) return;
        setLoadingMore(true);
        if (activeTab === 'shipments' && dealsHasMore) {
            await fetchDeals(dealsPage + 1, true);
        } else if (activeTab === 'trips' && tripsHasMore) {
            await fetchTrips(tripsPage + 1, true);
        }
        setLoadingMore(false);
    }, [loadingMore, activeTab, dealsHasMore, dealsPage, fetchDeals, tripsHasMore, tripsPage, fetchTrips]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAll();
        setRefreshing(false);
    }, [loadAll]);

    const handleScrollNearEnd = useCallback(({ nativeEvent }: { nativeEvent: any }) => {
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const nearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 300;
        if (nearBottom && !loadingMore) loadMore();
    }, [loadingMore, loadMore]);

    useEffect(() => {
        loadAll();
        pushNotificationService.initialize().then((granted) => {
            if (granted) pushNotificationService.registerPushToken();
        });
    }, [loadAll]);

    // Refetch on screen focus if data is stale (> 30 seconds)
    useFocusEffect(
        useCallback(() => {
            if (Date.now() - lastFetchedAt.current > 30_000) {
                loadAll();
            }
        }, [loadAll])
    );

    // Socket-triggered refresh and real-time notification badge
    useEffect(() => {
        if (!socket) return;
        const refresh = () => loadAll();
        const onNewNotification = () => incrementUnreadNotificationCount();
        socket.on('new_deal_posted',   refresh);
        socket.on('new_trip_posted',   refresh);
        socket.on('deal_updated',      refresh);
        socket.on('deal_cancelled',    refresh);
        socket.on('new_notification',  onNewNotification);
        return () => {
            socket.off('new_deal_posted',  refresh);
            socket.off('new_trip_posted',  refresh);
            socket.off('deal_updated',     refresh);
            socket.off('deal_cancelled',   refresh);
            socket.off('new_notification', onNewNotification);
        };
    }, [socket, loadAll, incrementUnreadNotificationCount]);

    const normDeal = (deal: any) => ({
        ...deal,
        price: deal.price ?? deal.pricing?.amount ?? 0,
        fromCity: deal.fromCity || deal.route?.from || '',
        toCity: deal.toCity || deal.route?.to || '',
    });

    const normTrip = (trip: any) => ({
        ...trip,
        price: trip.price ?? 0,
        fromCity: trip.fromCity || '',
        toCity: trip.toCity || '',
        // show who posted
        sender: trip.traveler,
        senderId: trip.travelerId,
    });

    // Disputed deals stay in the active strip — the shipment is still in flight,
    // just with an open case attached.
    const isActiveStatus = (s: string | undefined) =>
        ['MATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DISPUTED'].includes(s ?? '');

    const isMyDeal = (item: any) =>
        currentUser?.id &&
        (item.senderId === currentUser.id || item.sender?.id === currentUser.id ||
         item.travelerId === currentUser.id || item.traveler?.id === currentUser.id);

    // Other people's OPEN deals (excluding own posts)
    const filteredDeals = deals.map(normDeal).filter((deal: any) => {
        if (deal.status !== 'OPEN') return false;
        if (isMyDeal(deal)) return false; // own posts go to My Posts tab
        if (searchQuery) {
            const haystack = `${deal.fromCity} ${deal.toCity}`.toLowerCase();
            if (!haystack.includes(searchQuery.toLowerCase())) return false;
        }
        if (verifiedOnly && !deal.verified) return false;
        return true;
    }).sort((a: any, b: any) => {
        if (sortBy === 'date') return new Date(b.pickupDate || b.createdAt || 0).getTime() - new Date(a.pickupDate || a.createdAt || 0).getTime();
        if (sortBy === 'price') return (a.price ?? 0) - (b.price ?? 0);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    // Other people's OPEN trips (excluding own posts)
    const filteredTrips = trips.map(normTrip).filter((trip: any) => {
        if (trip.status && trip.status !== 'OPEN') return false;
        if (isMyDeal(trip)) return false; // own posts go to My Posts tab
        if (searchQuery) {
            const haystack = `${trip.fromCity} ${trip.toCity}`.toLowerCase();
            if (!haystack.includes(searchQuery.toLowerCase())) return false;
        }
        return true;
    }).sort((a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    // My Posts — my deals + trips, excluding cancelled items (soft-deleted)
    const myDeals = deals.map(normDeal)
        .filter((d: any) => isMyDeal(d) && d.status !== 'CANCELLED')
        .map((d: any) => ({ ...d, _type: 'shipment' }));
    const myTrips = trips.map(normTrip)
        .filter((t: any) => isMyDeal(t) && t.status !== 'CANCELLED')
        .map((t: any) => ({ ...t, _type: 'trip' }));
    const myPosts = [...myDeals, ...myTrips].sort((a: any, b: any) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    // My active deals (MATCHED / IN_TRANSIT) for the active bookings strip
    const activeDeals = deals.map(normDeal).filter((d: any) =>
        isActiveStatus(d.status) && isMyDeal(d)
    );

    // Current tab's list
    const currentList = activeTab === 'shipments' ? filteredDeals : activeTab === 'trips' ? filteredTrips : myPosts;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Premium Header */}
            <View style={styles.header}>
                <View style={styles.logoRow}>
                    <View style={styles.logoContainer}>
                        <View style={styles.logoIcon}>
                            <Plus color={COLORS.white} size={20} />
                        </View>
                        <Typography weight="bold" size="xl" color={COLORS.primary} style={{ marginLeft: 8 }}>Bridger</Typography>
                    </View>
                    <TouchableOpacity style={styles.notificationButton} onPress={onNotifications}>
                        <Bell color={COLORS.background.slate[700]} size={24} />
                        {unreadNotificationCount > 0 && <View style={styles.notificationDot} />}
                    </TouchableOpacity>
                </View>

                {/* Main Tabs */}
                <View style={styles.mainTabsContainer}>
                    <View style={styles.mainTabsWrapper}>
                        <TouchableOpacity
                            style={[styles.mainTab, activeTab === 'shipments' && styles.activeMainTab]}
                            onPress={() => setActiveTab('shipments')}
                        >
                            <Typography weight="bold" size="sm" color={activeTab === 'shipments' ? COLORS.primary : COLORS.background.slate[400]}>
                                Shipments
                            </Typography>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.mainTab, activeTab === 'trips' && styles.activeMainTab]}
                            onPress={() => setActiveTab('trips')}
                        >
                            <Typography weight="bold" size="sm" color={activeTab === 'trips' ? COLORS.primary : COLORS.background.slate[400]}>
                                Trips
                            </Typography>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.mainTab, activeTab === 'myposts' && styles.activeMainTab]}
                            onPress={() => setActiveTab('myposts')}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Typography weight="bold" size="sm" color={activeTab === 'myposts' ? COLORS.primary : COLORS.background.slate[400]}>
                                    My Posts
                                </Typography>
                                {myPosts.length > 0 && (
                                    <View style={styles.myPostsBadge}>
                                        <Typography size="xs" weight="bold" color={COLORS.white}>{myPosts.length}</Typography>
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* New Search Design */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchWrapper}>
                        <Search size={20} color={COLORS.background.slate[400]} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="JFK → LHR"
                            placeholderTextColor={COLORS.background.slate[400]}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                </View>

                {/* Refined Filter Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                    <TouchableOpacity style={[styles.filterChip, sortBy === 'date' && styles.filterChipActive]} onPress={() => setSortBy(sortBy === 'date' ? null : 'date')}>
                        <Typography size="xs" weight="bold" color={sortBy === 'date' ? COLORS.primary : COLORS.background.slate[700]}>Date</Typography>
                        <ChevronDown size={14} color={sortBy === 'date' ? COLORS.primary : COLORS.background.slate[700]} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.filterChip, sortBy === 'price' && styles.filterChipActive]} onPress={() => setSortBy(sortBy === 'price' ? null : 'price')}>
                        <Typography size="xs" weight="bold" color={sortBy === 'price' ? COLORS.primary : COLORS.background.slate[700]}>Price</Typography>
                        <ChevronDown size={14} color={sortBy === 'price' ? COLORS.primary : COLORS.background.slate[700]} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.filterChip, verifiedOnly && styles.filterChipActive]} onPress={() => setVerifiedOnly(!verifiedOnly)}>
                        <Typography size="xs" weight="bold" color={verifiedOnly ? COLORS.primary : COLORS.background.slate[700]}>Verified Only</Typography>
                        <ShieldCheck size={14} color={verifiedOnly ? COLORS.primary : COLORS.background.slate[700]} fill={verifiedOnly ? `${COLORS.primary}20` : 'transparent'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.filterChip, sortBy === 'rating' && styles.filterChipActive]} onPress={() => setSortBy(sortBy === 'rating' ? null : 'rating')}>
                        <Typography size="xs" weight="bold" color={sortBy === 'rating' ? COLORS.primary : COLORS.background.slate[700]}>Rating</Typography>
                        <ChevronDown size={14} color={sortBy === 'rating' ? COLORS.primary : COLORS.background.slate[700]} />
                    </TouchableOpacity>
                </ScrollView>
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScroll={handleScrollNearEnd}
                scrollEventThrottle={400}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.primary}
                        colors={[COLORS.primary]}
                    />
                }
            >
                {/* Smart Match Banner */}
                <View style={styles.smartMatchBanner}>
                    <View style={styles.smartMatchHeader}>
                        <Sparkles color={COLORS.white} size={18} />
                        <Typography weight="bold" color={COLORS.white} size="xs" style={{ marginLeft: 8, letterSpacing: 1 }}>SMART MATCH</Typography>
                    </View>
                    <Typography weight="bold" size="lg" color={COLORS.white} style={styles.smartMatchTitle}>
                        {activeDeals.length > 0
                            ? `Track your ${activeDeals[0].fromCity} → ${activeDeals[0].toCity} shipment`
                            : 'Post a shipment and get matched with a traveler!'}
                    </Typography>
                    <TouchableOpacity style={styles.smartMatchButton} onPress={onViewMatch}>
                        <Typography weight="bold" color={COLORS.primary} size="sm">View Match</Typography>
                    </TouchableOpacity>
                    <View style={styles.smartMatchPattern}>
                        <View style={[styles.patternCircle, { right: -20, top: -10 }]} />
                        <View style={[styles.patternCircle, { right: 20, bottom: -20, width: 60, height: 60, opacity: 0.1 }]} />
                    </View>
                </View>

                {/* Active Bookings Section */}
                <View style={styles.sectionHeader}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1}>
                        {activeTab === 'shipments' ? 'ACTIVE SHIPMENTS' : 'ACTIVE TRIPS'}
                    </Typography>
                </View>

                {activeDeals.length > 0 ? activeDeals.map((deal) => (
                    <TouchableOpacity
                        key={deal.id}
                        style={styles.activeCard}
                        onPress={() => onAcceptDeal(deal)}
                    >
                        <View style={styles.activeCardLeft}>
                            <View style={styles.statusDot} />
                            <View>
                                <Typography weight="bold" size="lg" color={COLORS.primary}>{deal.fromCity} → {deal.toCity}</Typography>
                                <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 2 }}>
                                    {deal.title || 'Package delivery'}
                                </Typography>
                            </View>
                        </View>
                        <View style={styles.activeCardRight}>
                            <View style={styles.activeBadge}>
                                <Typography size="xs" weight="bold" color="#1E3A8A">{deal.status?.replace('_', ' ')}</Typography>
                            </View>
                            <ArrowRight size={18} color={COLORS.background.slate[400]} />
                        </View>
                    </TouchableOpacity>
                )) : (
                    <TouchableOpacity
                        style={styles.activeCard}
                        onPress={onCreate}
                    >
                        <View style={styles.activeCardLeft}>
                            <View style={styles.statusDot} />
                            <View>
                                <Typography weight="bold" size="lg" color={COLORS.primary}>No active {activeTab}</Typography>
                                <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 2 }}>Tap to create one</Typography>
                            </View>
                        </View>
                        <ArrowRight size={18} color={COLORS.background.slate[400]} />
                    </TouchableOpacity>
                )}

                {/* Section Title */}
                <View style={[styles.sectionHeader, { marginTop: 16 }]}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={1}>
                        {activeTab === 'myposts' ? 'YOUR POSTS' : 'NEARBY TRAVELERS'}
                    </Typography>
                </View>

                {isLoading && currentList.length === 0 ? (
                    <View style={[styles.dealCard, { alignItems: 'center', paddingVertical: 32 }]}>
                        <ActivityIndicator color={COLORS.primary} />
                        <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 8 }}>Loading...</Typography>
                    </View>
                ) : error && currentList.length === 0 ? (
                    <View style={[styles.dealCard, { alignItems: 'center', paddingVertical: 32 }]}>
                        <Typography weight="bold" color={COLORS.background.slate[400]}>Connection error</Typography>
                        <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4 }}>{error}</Typography>
                    </View>
                ) : currentList.length === 0 ? (
                    <View style={[styles.dealCard, { alignItems: 'center', paddingVertical: 40 }]}>
                        {activeTab === 'myposts' ? (
                            <>
                                <Layers size={40} color={COLORS.background.slate[300]} />
                                <Typography weight="bold" color={COLORS.background.slate[400]} style={{ marginTop: 12 }}>No posts yet</Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
                                    Tap + to post a shipment or trip
                                </Typography>
                                <TouchableOpacity style={styles.createPostButton} onPress={onCreate}>
                                    <Plus size={16} color={COLORS.white} />
                                    <Typography weight="bold" color={COLORS.white} size="sm" style={{ marginLeft: 6 }}>Create Post</Typography>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Typography weight="bold" color={COLORS.background.slate[400]}>
                                    {activeTab === 'shipments' ? 'No shipments yet' : 'No trips yet'}
                                </Typography>
                                <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 4 }}>
                                    {activeTab === 'shipments' ? 'Be the first to post a shipment!' : 'No travelers posted trips yet'}
                                </Typography>
                            </>
                        )}
                    </View>
                ) : currentList.map((deal) => {
                    const isMyPost = activeTab === 'myposts';
                    const postType = deal._type || (activeTab === 'trips' ? 'trip' : 'shipment');
                    const statusColor: Record<string, string> = {
                        OPEN: '#22c55e', MATCHED: '#3b82f6', PICKED_UP: '#f59e0b',
                        IN_TRANSIT: '#8b5cf6', DELIVERED: '#10b981', COMPLETED: '#10b981',
                        CANCELLED: '#ef4444', DISPUTED: '#ef4444',
                    };
                    const statusLabel = deal.status ? deal.status.replace(/_/g, ' ') : 'OPEN';
                    const color = statusColor[deal.status] || '#64748b';

                    return (
                    <View key={deal.id} style={[styles.dealCard, isMyPost && styles.myPostCard]}>
                        {isMyPost && (
                            <View style={styles.myPostHeader}>
                                <View style={[styles.postTypePill, postType === 'trip' ? styles.tripPill : styles.shipmentPill]}>
                                    {postType === 'trip'
                                        ? <Plane size={12} color="#8b5cf6" />
                                        : <Package size={12} color={COLORS.primary} />}
                                    <Typography size="xs" weight="bold" color={postType === 'trip' ? '#8b5cf6' : COLORS.primary} style={{ marginLeft: 4 }}>
                                        {postType === 'trip' ? 'Trip' : 'Shipment'}
                                    </Typography>
                                </View>
                                <View style={[styles.statusPill, { borderColor: color }]}>
                                    <View style={[styles.statusDotSmall, { backgroundColor: color }]} />
                                    <Typography size="xs" weight="bold" color={color}>{statusLabel}</Typography>
                                </View>
                            </View>
                        )}

                        {!isMyPost && (
                        <View style={styles.cardTop}>
                            <View style={styles.cardUser}>
                                <TouchableOpacity onPress={() => onViewDeal(deal)}>
                                <View style={styles.avatarWrapper}>
                                    {(deal.sender?.avatar || deal.sender?.profilePhoto || deal.traveler?.avatar || deal.traveler?.profilePhoto) ? (
                                        <Image
                                            source={{ uri: deal.sender?.profilePhoto || deal.sender?.avatar || deal.traveler?.profilePhoto || deal.traveler?.avatar }}
                                            style={styles.cardAvatar}
                                        />
                                    ) : (
                                        <View style={[styles.cardAvatar, styles.cardAvatarPlaceholder]}>
                                            <User color={COLORS.primary} size={18} />
                                        </View>
                                    )}
                                    <View style={styles.verifiedBadge}>
                                        <ShieldCheck color={COLORS.white} size={8} />
                                    </View>
                                </View>
                                </TouchableOpacity>
                                <View style={{ marginLeft: 12 }}>
                                    <View style={styles.nameRow}>
                                        <Typography weight="bold">
                                            {deal.sender?.name || deal.traveler?.name || deal.senderName || 'Unknown user'}
                                        </Typography>
                                    </View>
                                    <View style={styles.statsRow}>
                                        <Star size={12} color="#FBBF24" fill="#FBBF24" />
                                        <Typography weight="bold" size="xs" color="#FBBF24" style={{ marginLeft: 2 }}>
                                            {(deal.sender?.rating ?? deal.traveler?.rating) != null
                                                ? (deal.sender?.rating ?? deal.traveler?.rating).toFixed(1)
                                                : 'New'}
                                        </Typography>
                                        <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginLeft: 8 }}>
                                            {activeTab === 'shipments' ? 'Sender' : 'Traveler'}
                                        </Typography>
                                    </View>
                                </View>
                            </View>
                            <View style={styles.cardPrice}>
                                <Typography weight="bold" size="xl" color={COLORS.primary}>{currency.symbol}{deal.price}</Typography>
                                <Typography size="xs" weight="bold" color={COLORS.background.slate[400]}>SERVICE FEE</Typography>
                            </View>
                        </View>
                        )}

                        {isMyPost && (
                            <View style={styles.cardTop}>
                                <View style={styles.cardUser}>
                                    <View style={styles.avatarWrapper}>
                                        {(deal.sender?.avatar || deal.sender?.profilePhoto || deal.traveler?.avatar || deal.traveler?.profilePhoto) ? (
                                            <Image
                                                source={{ uri: deal.sender?.profilePhoto || deal.sender?.avatar || deal.traveler?.profilePhoto || deal.traveler?.avatar }}
                                                style={styles.cardAvatar}
                                            />
                                        ) : (
                                            <View style={[styles.cardAvatar, styles.cardAvatarPlaceholder]}>
                                                <User color={COLORS.primary} size={18} />
                                            </View>
                                        )}
                                    </View>
                                    <View style={{ marginLeft: 12 }}>
                                        <View style={styles.nameRow}>
                                            <Typography weight="bold">You</Typography>
                                        </View>
                                        <View style={styles.statsRow}>
                                            <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginLeft: 0 }}>
                                                {activeTab === 'shipments' ? 'Sender' : 'Traveler'}
                                            </Typography>
                                        </View>
                                    </View>
                                </View>
                                <View style={styles.cardPrice}>
                                    <Typography weight="bold" size="xl" color={COLORS.primary}>{currency.symbol}{deal.price}</Typography>
                                    <Typography size="xs" weight="bold" color={COLORS.background.slate[400]}>SERVICE FEE</Typography>
                                </View>
                            </View>
                        )}

                        <View style={styles.routeContainer}>
                            <View style={styles.routeItem}>
                                <Typography size="xs" weight="bold" color={COLORS.background.slate[400]}>ROUTE</Typography>
                                <Typography weight="bold" size="lg">{deal.fromCity}  →  {deal.toCity}</Typography>
                            </View>
                            <View style={styles.routeItem}>
                                <Typography size="xs" weight="bold" color={COLORS.background.slate[400]}>DEPARTURE</Typography>
                                <Typography weight="bold" size="sm">
                                    {(deal.pickupDate || deal.departureDate)
                                        ? new Date(deal.pickupDate || deal.departureDate).toLocaleDateString()
                                        : 'Flexible'}
                                </Typography>
                            </View>
                        </View>

                        <View style={styles.cardActions}>
                            {isMyPost ? (
                                <TouchableOpacity
                                    style={styles.manageButton}
                                    onPress={() => onViewDeal(deal)}
                                >
                                    <Typography weight="bold" color={COLORS.white}>Manage</Typography>
                                </TouchableOpacity>
                            ) : (
                                <>
                                    <TouchableOpacity
                                        style={styles.messageButton}
                                        onPress={() => {
                                            const otherUser = activeTab === 'trips'
                                                ? deal.traveler
                                                : deal.sender;
                                            onChatWithUser({
                                                name: otherUser?.name || 'User',
                                                verified: deal.verified,
                                                userId: otherUser?.id,
                                                avatar: otherUser?.profilePhoto || otherUser?.avatar,
                                                profilePhoto: otherUser?.profilePhoto || otherUser?.avatar,
                                                dealId: activeTab === 'trips' ? undefined : deal.id,
                                                tripId: activeTab === 'trips' ? deal.id : undefined,
                                            });
                                        }}
                                    >
                                        <MessageCircle size={18} color={COLORS.primary} />
                                        <Typography weight="bold" color={COLORS.primary} style={{ marginLeft: 8 }}>Message</Typography>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.bookButton}
                                        onPress={() => onViewDeal(deal)}
                                    >
                                        <Typography weight="bold" color={COLORS.white}>
                                            {activeTab === 'shipments' ? 'View Deal' : 'Book Traveler'}
                                        </Typography>
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                    );
                })}

                {loadingMore && (
                    <View style={styles.loadingMoreContainer}>
                        <ActivityIndicator size="small" color={COLORS.primary} />
                    </View>
                )}

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Bottom Tab Bar */}
            <View style={styles.tabBar}>
                <TouchableOpacity onPress={onHome} style={styles.tabItem}>
                    <Home size={24} color={COLORS.primary} />
                    <Typography size="xs" color={COLORS.primary} weight="bold">Home</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={onExplore} style={styles.tabItem}>
                    <ExploreIcon size={24} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]}>Explore</Typography>
                </TouchableOpacity>
                <View style={styles.tabItem}>
                    <TouchableOpacity onPress={onCreate} style={styles.createPulseButton}>
                        <Plus size={28} color={COLORS.white} />
                    </TouchableOpacity>
                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 32 }}>Create</Typography>
                </View>
                <TouchableOpacity onPress={onSendMessage} style={styles.tabItem}>
                    <MessageCircle size={24} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]}>Messages</Typography>
                </TouchableOpacity>
                <TouchableOpacity onPress={onProfile} style={styles.tabItem}>
                    <UserCircle size={24} color={COLORS.background.slate[400]} />
                    <Typography size="xs" color={COLORS.background.slate[400]}>Profile</Typography>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FB',
    },
    header: {
        backgroundColor: COLORS.white,
        paddingBottom: 16,
    },
    logoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    notificationButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#F8F9FB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    notificationDot: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#3B82F6',
        borderWidth: 2,
        borderColor: COLORS.white,
    },
    mainTabsContainer: {
        paddingHorizontal: 20,
        marginVertical: 12,
    },
    mainTabsWrapper: {
        flexDirection: 'row',
        backgroundColor: '#F1F5F9',
        borderRadius: RADIUS.xl,
        padding: 4,
    },
    mainTab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: RADIUS.lg,
    },
    activeMainTab: {
        backgroundColor: COLORS.white,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    searchContainer: {
        paddingHorizontal: 20,
        marginBottom: 16,
    },
    searchWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8F9FB',
        borderRadius: RADIUS.lg,
        paddingHorizontal: 16,
        height: 50,
        borderWidth: 1,
        borderColor: '#EDF2F7',
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.background.slate[900],
    },
    filterRow: {
        paddingHorizontal: 20,
        gap: 12,
    },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#EDF2F7',
        backgroundColor: COLORS.white,
    },
    filterChipActive: {
        borderColor: COLORS.primary,
        backgroundColor: '#EEF2FF',
    },
    scrollContent: {
        padding: 20,
    },
    smartMatchBanner: {
        backgroundColor: '#1E3A8A', // Dark blue
        borderRadius: RADIUS['2xl'],
        padding: 24,
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
    },
    smartMatchHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    smartMatchTitle: {
        maxWidth: '80%',
        lineHeight: 24,
        marginBottom: 20,
    },
    smartMatchButton: {
        backgroundColor: COLORS.white,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
        alignSelf: 'flex-start',
    },
    smartMatchPattern: {
        ...StyleSheet.absoluteFillObject,
        zIndex: -1,
    },
    patternCircle: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: COLORS.white,
        opacity: 0.05,
    },
    sectionHeader: {
        marginBottom: 16,
    },
    activeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.xl,
        padding: 16,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    activeCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#1E3A8A', // Bridger blue to indicate active
    },
    activeCardRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    activeBadge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    dealCard: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS['2xl'],
        padding: 20,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    cardTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cardUser: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarWrapper: {
        position: 'relative',
    },
    cardAvatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        overflow: 'hidden',
    },
    cardAvatarPlaceholder: {
        backgroundColor: `${COLORS.primary}15`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: COLORS.primary,
        borderWidth: 2,
        borderColor: COLORS.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    negotiablePill: {
        backgroundColor: '#F0FDF4',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    cardPrice: {
        alignItems: 'flex-end',
    },
    routeContainer: {
        flexDirection: 'row',
        backgroundColor: '#F8F9FB',
        borderRadius: RADIUS.xl,
        padding: 16,
        marginTop: 20,
        marginBottom: 20,
    },
    routeItem: {
        flex: 1,
        gap: 6,
    },
    cardActions: {
        flexDirection: 'row',
        gap: 12,
    },
    messageButton: {
        flex: 1,
        flexDirection: 'row',
        height: 52,
        borderRadius: RADIUS.xl,
        borderWidth: 1.5,
        borderColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bookButton: {
        flex: 1,
        height: 52,
        borderRadius: RADIUS.xl,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewTripButton: {
        width: '100%',
        height: 52,
        borderRadius: RADIUS.xl,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabBar: {
        position: 'absolute',
        bottom: 0,
        width: '100%',
        height: 90,
        backgroundColor: COLORS.white,
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 10,
        paddingBottom: 25,
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingMoreContainer: {
        alignItems: 'center',
        paddingVertical: 16,
        marginBottom: 8,
    },
    createPulseButton: {
        position: 'absolute',
        top: -30,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 5,
        borderColor: COLORS.white,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 8,
    },
    myPostsBadge: {
        backgroundColor: COLORS.primary,
        borderRadius: 10,
        paddingHorizontal: 5,
        paddingVertical: 1,
        minWidth: 18,
        alignItems: 'center',
    },
    myPostCard: {
        borderColor: `${COLORS.primary}20`,
        borderWidth: 1.5,
    },
    myPostHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    postTypePill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    shipmentPill: {
        backgroundColor: `${COLORS.primary}12`,
    },
    tripPill: {
        backgroundColor: '#f3e8ff',
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        borderWidth: 1,
        backgroundColor: COLORS.white,
    },
    statusDotSmall: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    myPostPriceRow: {
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    manageButton: {
        flex: 1,
        height: 52,
        borderRadius: RADIUS.xl,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    createPostButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
    },
});
