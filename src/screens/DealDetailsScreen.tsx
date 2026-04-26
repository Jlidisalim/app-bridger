import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Dimensions,
    Alert,
    Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Avatar } from '../components/Avatar';
import {
    ChevronLeft,
    MapPin,
    Calendar,
    Weight,
    ShieldCheck,
    Star,
    MessageSquare,
    Info,
    ArrowRight,
    Circle,
    User,
    CheckCircle2,
    Trash2,
} from 'lucide-react-native';
import { useUserCurrency } from '../utils/currency';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../navigation/types';
import { CancelDialog } from '../components/CancelDialog';
import { InsufficientBalanceAlert } from '../components/InsufficientBalanceAlert';
import { useBalanceCheck } from '../hooks/useBalanceCheck';

// Maps packageSize from DB enum to human-readable tags shown on the detail card.
function packageTags(category?: string): string[] {
    switch ((category || '').toUpperCase()) {
        case 'SMALL':       return ['Documents', 'Cosmetics', 'Jewelry'];
        case 'MEDIUM':      return ['Gadgets', 'Clothes', 'Accessories'];
        case 'LARGE':       return ['Electronics', 'Shoes', 'Sports Gear'];
        case 'EXTRA_LARGE': return ['Luggage', 'Furniture', 'Appliances'];
        default:            return category ? [category] : ['Package'];
    }
}

interface DealDetailsScreenProps {
    deal: {
        id: string;
        title?: string;
        name: string;
        price: number;
        negotiable: boolean;
        route: any;
        verified?: boolean;
        status?: string;
        avatar?: string;
        profilePhoto?: string;
        rating?: number;
        totalDeals?: number;
        sender?: { id?: string; name?: string; avatar?: string; profilePhoto?: string; verified?: boolean; rating?: number; totalDeals?: number };
        traveler?: { id?: string; name?: string; avatar?: string; profilePhoto?: string; verified?: boolean };
        package?: { category?: string; description?: string; weight?: number };
        images?: string[];
    };
    isOwner?: boolean;
    isAccepting?: boolean;
    isDeleting?: boolean;
    entityType?: 'deal' | 'trip';
    onBack: () => void;
    onAccept: (price: number) => void;
    onChat: (user: { name: string; verified?: boolean; avatar?: string; profilePhoto?: string }) => void;
    onDelete?: () => Promise<void> | void;
}

export const DealDetailsScreen: React.FC<DealDetailsScreenProps> = ({
    deal,
    isOwner = false,
    isDeleting = false,
    entityType = 'deal',
    onBack,
    onAccept,
    onChat,
    onDelete,
}) => {
    const currency = useUserCurrency();
    const { isInsufficient, walletBalance } = useBalanceCheck();
    const [isNegotiateModalVisible, setIsNegotiateModalVisible] = useState(false);
    const [offerPrice, setOfferPrice] = useState(deal.price.toString());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loading, setLoading] = useState(false);
    const [failedImageIndexes, setFailedImageIndexes] = useState<Set<number>>(new Set());
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showInsufficientAlert, setShowInsufficientAlert] = useState(false);
    const [pendingPrice, setPendingPrice] = useState(deal.price);
    const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
    const [showSummary, setShowSummary] = useState(false);

    const handleImageError = (index: number) => {
        setFailedImageIndexes(prev => {
            const next = new Set(prev);
            next.add(index);
            return next;
        });
    };

    const handleAccept = async () => {
        if (isSubmitting) return;
        if (deal.negotiable) {
            setIsNegotiateModalVisible(true);
        } else {
            if (isInsufficient(deal.price)) {
                setPendingPrice(deal.price);
                setShowInsufficientAlert(true);
                return;
            }
            setIsSubmitting(true);
            try {
                await onAccept(deal.price);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const confirmDelete = () => {
        if (!onDelete || isDeleting) return;
        setShowCancelDialog(true);
    };

    const submitOffer = async () => {
        if (isSubmitting) return;
        const price = parseFloat(offerPrice);
        if (isInsufficient(price)) {
            setPendingPrice(price);
            setIsNegotiateModalVisible(false);
            setShowInsufficientAlert(true);
            return;
        }
        setIsSubmitting(true);
        try {
            await onAccept(price);
            setIsNegotiateModalVisible(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#1E3B8A" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <ChevronLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography weight="bold">{isOwner ? 'My Post' : 'Deal Details'}</Typography>
                {isOwner ? (
                    <View style={styles.ownerHeaderRight}>
                        <View style={styles.myPostBadge}>
                            <Typography size="xs" weight="bold" color={COLORS.primary}>YOURS</Typography>
                        </View>
                        {onDelete && (
                            <TouchableOpacity
                                style={styles.deleteIconBtn}
                                onPress={confirmDelete}
                                disabled={isDeleting}
                                accessibilityLabel="Delete post"
                            >
                                {isDeleting ? (
                                    <ActivityIndicator size="small" color="#ef4444" />
                                ) : (
                                    <Trash2 color="#ef4444" size={20} />
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <TouchableOpacity
                        style={styles.chatButton}
                        onPress={() => {
                            const otherUser = deal.sender;
                            onChat({ 
                                name: deal.name, 
                                verified: deal.verified, 
                                avatar: otherUser?.profilePhoto || otherUser?.avatar, 
                                profilePhoto: otherUser?.profilePhoto || otherUser?.avatar 
                            });
                        }}
                    >
                        <MessageSquare color={COLORS.primary} size={22} />
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                 {/* Package photo gallery — full-width horizontal carousel.
                     Falls back to a bundled test photo so the gallery is always
                     visible (makes cross-account image rendering verifiable). */}
                 {(() => {
                     const uploaded = (deal.images || []).filter(
                         (uri): uri is string => typeof uri === 'string' && uri.trim().length > 0,
                     );
                     const fallback = require('../../assets/map_placeholder.png');
                     const hasUploads = uploaded.length > 0;
                     return (
                         <View style={styles.galleryWrap}>
                             <ScrollView
                                 horizontal
                                 pagingEnabled
                                 showsHorizontalScrollIndicator={false}
                                 style={styles.gallery}
                             >
                                 {hasUploads
                                     ? uploaded.map((uri, index) =>
                                         failedImageIndexes.has(index) ? (
                                             <View key={index} style={[styles.galleryImage, styles.imageError]}>
                                                 <Typography size="xs" color={COLORS.background.slate[500]} style={{ textAlign: 'center' }}>
                                                     Image unavailable
                                                 </Typography>
                                             </View>
                                         ) : (
                                             <Image
                                                 key={index}
                                                 source={{ uri: uri.trim() }}
                                                 style={styles.galleryImage}
                                                 resizeMode="cover"
                                                 onError={() => handleImageError(index)}
                                             />
                                         ),
                                     )
                                     : (
                                         <Image
                                             key="fallback"
                                             source={fallback}
                                             style={styles.galleryImage}
                                             resizeMode="cover"
                                         />
                                     )}
                             </ScrollView>
                             {hasUploads && uploaded.length > 1 && (
                                 <View style={styles.galleryCount}>
                                     <Typography size="xs" weight="bold" color={COLORS.white}>
                                         {uploaded.length} photos
                                     </Typography>
                                 </View>
                             )}
                             {!hasUploads && (
                                 <View style={styles.galleryCount}>
                                     <Typography size="xs" weight="bold" color={COLORS.white}>
                                         Sample photo
                                     </Typography>
                                 </View>
                             )}
                         </View>
                     );
                 })()}

                 {/* Action Buttons */}
                 <View style={styles.actionButtons}>
                     <TouchableOpacity style={styles.actionButton} onPress={() => setShowSummary(!showSummary)}>
                         <Info size={20} color={COLORS.primary} />
                         <Typography size="sm" weight="bold" style={styles.actionButtonText}>
                             {showSummary ? 'Show Details' : 'Deal Summary'}
                         </Typography>
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('ReceiverCode', { dealId: deal.id })}>
                         <User size={20} color={COLORS.primary} />
                         <Typography size="sm" weight="bold" style={styles.actionButtonText}>
                             Receiver
                         </Typography>
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Tracking', { dealId: deal.id })}>
                         <MapPin size={20} color={COLORS.primary} />
                         <Typography size="sm" weight="bold" style={styles.actionButtonText}>
                             Tracking
                         </Typography>
                     </TouchableOpacity>
                 </View>

                 {/* Deal title */}
                {deal.title && (
                    <View style={styles.titleSection}>
                        <Typography size="2xl" weight="bold">{deal.title}</Typography>
                    </View>
                )}

                {/* Sender Info Card */}
                <View style={styles.userCard}>
                    <View style={styles.avatarContainer}>
                        <Avatar
                            userId={deal.sender?.id}
                            uri={deal.profilePhoto || deal.avatar || null}
                            name={deal.name}
                            size={64}
                            style={styles.avatar}
                        />
                        {deal.verified && (
                            <View style={styles.verifiedBadge}>
                                <ShieldCheck color={COLORS.white} size={10} />
                            </View>
                        )}
                    </View>
                    <View style={styles.userMainInfo}>
                        <Typography size="xs" color={COLORS.background.slate[500]} weight="bold" uppercase tracking={1}>
                            Posted by
                        </Typography>
                        <Typography size="lg" weight="bold">{deal.name}</Typography>
                        <View style={styles.ratingRow}>
                            <Star color="#f59e0b" size={14} fill="#f59e0b" />
                            <Typography size="sm" weight="bold" color="#f59e0b">
                                {typeof deal.rating === 'number' ? deal.rating.toFixed(1) : deal.verified ? '5.0' : '4.5'}
                            </Typography>
                            <Typography size="sm" color={COLORS.background.slate[400]}>
                                {' • '}
                                {typeof deal.totalDeals === 'number' ? `${deal.totalDeals} deals` : deal.verified ? 'Verified' : 'Member'}
                            </Typography>
                        </View>
                    </View>
                </View>

                {/* Route Section */}
                <View style={styles.section}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={2}>Route & Schedule</Typography>
                    <View style={styles.routeContainer}>
                        <View style={styles.routeVisual}>
                            <Circle color={COLORS.primary} size={12} fill={COLORS.primary} />
                            <View style={styles.routeLine} />
                            <Circle color={COLORS.primary} size={12} fill={COLORS.primary} />
                        </View>
                        <View style={styles.routeDetails}>
                            <View style={styles.routePoint}>
                                <Typography weight="bold">{typeof deal.route === 'object' ? deal.route.from : 'Origin'}</Typography>
                            </View>
                            <View style={styles.routePoint}>
                                <Typography weight="bold">{typeof deal.route === 'object' ? deal.route.to : 'Destination'}</Typography>
                            </View>
                        </View>
                    </View>

                    <View style={styles.infoGrid}>
                        <View style={styles.infoBox}>
                            <Calendar color={COLORS.background.slate[400]} size={20} />
                            <View>
                                <Typography size="xs" color={COLORS.background.slate[500]}>Departure</Typography>
                                <Typography size="sm" weight="bold">{(typeof deal.route === 'object' && deal.route.departureDate) || 'Flexible'}</Typography>
                            </View>
                        </View>
                        <View style={styles.infoBox}>
                            <Weight color={COLORS.background.slate[400]} size={20} />
                            <View>
                                <Typography size="xs" color={COLORS.background.slate[500]}>Capacity</Typography>
                                <Typography size="sm" weight="bold">
                                    {deal.package?.weight ? `${deal.package.weight} kg` : deal.package?.category ? deal.package.category : 'N/A'}
                                </Typography>
                            </View>
                        </View>
                    </View>
                </View>

                {!showSummary && (
                    <>
                        {/* Description */}
                        <View style={styles.section}>
                            <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} uppercase tracking={2}>About this Trip</Typography>
                            <Typography style={styles.description}>
                                {deal.package?.description || 'Traveler is available to carry your package on this route. Contact them for more details about available space and delivery timeline.'}
                            </Typography>
                            <View style={styles.tagRow}>
                                {packageTags(deal.package?.category).map((tag) => (
                                    <View key={tag} style={styles.tag}>
                                        <Typography size="xs" weight="bold" color={COLORS.primary}>{tag}</Typography>
                                    </View>
                                ))}
                            </View>
                        </View>

                        {/* Safety section */}
                        <View style={styles.safetyCard}>
                            <ShieldCheck color={COLORS.primary} size={24} />
                            <View style={styles.safetyText}>
                                <Typography weight="bold">Secure with Bridger Escrow</Typography>
                                <Typography size="xs" color={COLORS.background.slate[500]}>
                                    Your payment is held securely and only released after the package is verified by both parties.
                                </Typography>
                            </View>
                        </View>
                    </>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={styles.footer}>
                <View style={styles.priceContainer}>
                    <Typography size="2xl" weight="bold" color={COLORS.primary}>{currency.symbol}{deal.price}</Typography>
                    <Typography size="xs" color={COLORS.background.slate[400]}>Total Fee {deal.negotiable ? '(Negotiable)' : '(Fixed)'}</Typography>
                </View>
                {isOwner ? (
                    <View style={styles.statusBadgeLarge}>
                        <View style={[styles.statusDot, { backgroundColor: deal.status === 'OPEN' ? '#22c55e' : deal.status === 'CANCELLED' ? '#ef4444' : '#3b82f6' }]} />
                        <Typography size="md" weight="bold" color={COLORS.background.slate[700]}>
                            {(deal.status || 'OPEN').replace(/_/g, ' ')}
                        </Typography>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
                        <Typography size="lg" weight="bold" color={COLORS.white}>
                            {deal.negotiable ? 'Give a Price' : 'Accept Quest'}
                        </Typography>
                    </TouchableOpacity>
                )}
            </View>

            {/* Negotiation Modal */}
            <Modal
                visible={isNegotiateModalVisible}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setIsNegotiateModalVisible(false)}
            >
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalOverlay}
                >
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Typography size="xl" weight="bold">Make an Offer</Typography>
                            <TouchableOpacity onPress={() => setIsNegotiateModalVisible(false)}>
                                <ChevronLeft color={COLORS.background.slate[900]} size={24} style={{ transform: [{ rotate: '-90deg' }] }} />
                            </TouchableOpacity>
                        </View>

                        <Typography color={COLORS.background.slate[500]} style={styles.modalSubtitle}>
                            The original price is {currency.symbol}{deal.price}. What is your counter-offer?
                        </Typography>

                        <View style={styles.inputWrapper}>
                            <Typography size="xl" weight="bold" color={COLORS.primary}>{currency.symbol}</Typography>
                            <TextInput
                                style={styles.priceInput}
                                value={offerPrice}
                                onChangeText={setOfferPrice}
                                keyboardType="numeric"
                                autoFocus
                            />
                        </View>

                        <TouchableOpacity style={styles.submitBtn} onPress={submitOffer}>
                            <Typography size="lg" weight="bold" color={COLORS.white}>Send Offer</Typography>
                        </TouchableOpacity>

                        <Typography size="xs" color={COLORS.background.slate[400]} style={styles.modalFooterText}>
                            The traveler will receive your offer and can choose to accept or decline.
                        </Typography>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            <CancelDialog
                visible={showCancelDialog}
                entityType={entityType}
                entityId={deal.id}
                onClose={() => setShowCancelDialog(false)}
                onConfirmed={() => {
                    setShowCancelDialog(false);
                    onDelete?.();
                }}
            />

            <InsufficientBalanceAlert
                visible={showInsufficientAlert}
                price={pendingPrice}
                walletBalance={walletBalance}
                onClose={() => setShowInsufficientAlert(false)}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.white,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.lg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[50],
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.background.light,
        alignItems: 'center',
        justifyContent: 'center',
    },
    myPostBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: `${COLORS.primary}12`,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: `${COLORS.primary}30`,
    },
    ownerHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    deleteIconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fee2e2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusBadgeLarge: {
        flex: 1.5,
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: COLORS.background.light,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    chatButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: `${COLORS.primary}0D`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        paddingTop: SPACING.lg,
    },
    galleryWrap: {
        position: 'relative',
        marginBottom: SPACING.xl,
    },
    gallery: {
        width: '100%',
        height: 240,
    },
    galleryImage: {
        width: Dimensions.get('window').width,
        height: 240,
    },
    galleryCount: {
        position: 'absolute',
        right: 16,
        bottom: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    imageError: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: COLORS.background.slate[100],
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleSection: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.lg,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: SPACING.xl,
        padding: SPACING.lg,
        backgroundColor: COLORS.background.light,
        borderRadius: RADIUS.xl,
        marginBottom: SPACING.xxl,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 16,
    },
    avatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: COLORS.primary,
    },
    avatarPlaceholder: {
        backgroundColor: COLORS.white,
        alignItems: 'center',
        justifyContent: 'center',
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        backgroundColor: COLORS.primary,
        width: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: COLORS.white,
    },
    userMainInfo: {
        flex: 1,
    },
    ratingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    section: {
        paddingHorizontal: SPACING.xl,
        marginBottom: 32,
    },
    routeContainer: {
        flexDirection: 'row',
        marginTop: 16,
        gap: 16,
    },
    routeVisual: {
        alignItems: 'center',
        paddingVertical: 4,
    },
    routeLine: {
        width: 2,
        flex: 1,
        backgroundColor: `${COLORS.primary}33`,
        marginVertical: 4,
    },
    routeDetails: {
        flex: 1,
        gap: 24,
    },
    routePoint: {
        gap: 2,
    },
    infoGrid: {
        flexDirection: 'row',
        marginTop: 32,
        gap: 16,
    },
    infoBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.background.light,
        padding: 16,
        borderRadius: RADIUS.lg,
        gap: 12,
    },
    description: {
        marginTop: 12,
        lineHeight: 24,
        color: COLORS.background.slate[600],
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 16,
    },
    tag: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: `${COLORS.primary}0D`,
        borderRadius: RADIUS.full,
    },
    safetyCard: {
        marginHorizontal: SPACING.xl,
        flexDirection: 'row',
        backgroundColor: '#f0fdf4',
        padding: 16,
        borderRadius: RADIUS.lg,
        alignItems: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: '#dcfce7',
    },
    safetyText: {
        flex: 1,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: COLORS.white,
        paddingHorizontal: SPACING.xl,
        paddingBottom: 34,
        paddingTop: 16,
        flexDirection: 'row',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: COLORS.background.slate[50],
    },
    priceContainer: {
        flex: 1,
    },
    acceptBtn: {
        flex: 1.5,
        height: 56,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.white,
        borderTopLeftRadius: RADIUS['3xl'],
        borderTopRightRadius: RADIUS['3xl'],
        padding: SPACING.xl,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalSubtitle: {
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 32,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.background.light,
        borderRadius: RADIUS.xl,
        paddingHorizontal: 24,
        height: 72,
        gap: 12,
        marginBottom: 32,
        borderWidth: 2,
        borderColor: COLORS.primary,
    },
    priceInput: {
        flex: 1,
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    submitBtn: {
        height: 64,
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    modalFooterText: {
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: COLORS.white,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
        marginBottom: 8,
    },
    actionButton: {
        alignItems: 'center',
    },
    actionButtonText: {
        marginTop: 4,
        color: COLORS.primary,
    }
});
