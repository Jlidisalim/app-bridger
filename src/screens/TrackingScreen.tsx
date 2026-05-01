import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Dimensions,
    Modal,
    Alert,
    TextInput,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { QRCodeGenerator } from '../components/QRCodeGenerator';
import {
    ArrowLeft,
    Check,
    Wallet,
    Truck,
    Clock,
    MapPin,
    QrCode,
    CheckCircle2,
    Plane,
    ExternalLink,
    Info,
    FileText,
    User,
    X,
    MessageCircle,
    Scan,
    Star,
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { useSocket } from '../hooks/useSocket';
import { useUserCurrency } from '../utils/currency';
import { CancelDialog } from '../components/CancelDialog';
import { RatingModal } from '../components/RatingModal';
import { reviewsApi } from '../services/api';

const { width } = Dimensions.get('window');

interface TrackingScreenProps {
    deal: any;
    currentUserId?: string;
    isSender?: boolean;
    onBack: () => void;
    onGenerateQR: () => void;
    onScanQR?: () => void;
    onCancel: () => void;
    onDispute: () => void;
    onReceiverCode?: () => void;
    onChat?: () => void;
    onLiveTracking?: () => void;
}

export const TrackingScreen: React.FC<TrackingScreenProps> = ({ deal, currentUserId, isSender, onBack, onGenerateQR, onScanQR, onCancel, onDispute, onReceiverCode, onChat, onLiveTracking }) => {
    const currency = useUserCurrency();
    const [showQRModal, setShowQRModal] = useState(false);
    const [showPickupModal, setShowPickupModal] = useState(false);
    const [showDeliveryOptionsModal, setShowDeliveryOptionsModal] = useState(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    // Reuse the same scanner modal for two purposes: pickup (traveler) and delivery (sender-as-receiver)
    const [scanPurpose, setScanPurpose] = useState<'pickup' | 'delivery'>('pickup');
    const [isProcessing, setIsProcessing] = useState(false);
    const updateDealStatus = useAppStore((s) => s.updateDealStatus);
    const refreshDeal = useAppStore((s) => s.refreshDeal);
    const mergeDealUpdate = useAppStore((s) => s.mergeDealUpdate);
    const { socket } = useSocket();
    const dealId = deal?.id || 'DEAL-001';
    const fromCity = deal?.fromCity || 'LHR';
    const toCity = deal?.toCity || 'JFK';
    const routeString = `${fromCity} → ${toCity}`;
    
    const currentUser = useAppStore((s) => s.currentUser);
    const dealStatus = deal?.status || 'MATCHED';
    const isTraveler = currentUserId === deal?.travelerId;
    const isSenderUser = currentUserId === deal?.senderId;
    const isPickupStage = dealStatus === 'ESCROW_PAID' || dealStatus === 'escrow_paid' || dealStatus === 'MATCHED';
    const isInTransit = dealStatus === 'IN_TRANSIT' || dealStatus === 'in_transit';
    
    // Detect sender-is-receiver: sender entered their own phone as the receiver.
    // When true, no need to share a receiver code — sender scans the traveler's QR directly.
    const receiverPhoneFromDeal = deal?.senderReceiver?.phone || deal?.receiverPhone || '';
    const currentUserPhone = currentUser?.phone || '';
    const receiverNormalized = receiverPhoneFromDeal.replace(/\D/g, '');
    const userNormalized = currentUserPhone.replace(/\D/g, '');
    const isSenderReceiver = isSenderUser && receiverNormalized !== '' && receiverNormalized === userNormalized;

    // Pull the authoritative deal (with persisted trackingEvents) on mount,
    // and keep it in sync via socket events broadcast by the backend whenever
    // either party updates the status (scan, confirm, cancel, etc.).
    useEffect(() => {
        if (!dealId || dealId === 'DEAL-001') return;
        refreshDeal(dealId);

        if (!socket) return;
        const onDealUpdate = (payload: any) => {
            // Server may send the full deal or just an id — handle both.
            if (payload?.id === dealId) {
                mergeDealUpdate(payload);
            } else if (payload === dealId || payload?.dealId === dealId) {
                refreshDeal(dealId);
            }
        };
        socket.on('deal_updated', onDealUpdate);
        socket.on('deal_status_changed', onDealUpdate);
        socket.on('tracking_event', onDealUpdate);
        return () => {
            socket.off('deal_updated', onDealUpdate);
            socket.off('deal_status_changed', onDealUpdate);
            socket.off('tracking_event', onDealUpdate);
        };
    }, [dealId, socket, refreshDeal, mergeDealUpdate]);
    const qrValue = JSON.stringify({
        dealId,
        receiverCode: deal?.receiverCode || null,
        type: 'delivery_confirmation',
        route: routeString,
        timestamp: new Date().toISOString(),
    });

    const trackingEvents = deal?.trackingEvents || [];
    const getStatusFromEvents = (step: string) => {
        const statusMap: Record<string, string[]> = {
            'Accepted': ['MATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'],
            'Escrow Paid': ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'],
            'Pickup': ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'],
            'In Transit': ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'],
            'Arrived': ['DELIVERED', 'COMPLETED'],
            'QR Confirmed': ['COMPLETED'],
            'Completed': ['COMPLETED'],
        };
        const dealStatus = deal?.status || 'MATCHED';
        const validStatuses = statusMap[step] || [];
        if (validStatuses.includes(dealStatus)) return 'completed';
        // Check if the current step is the "active" one
        const allSteps = ['Accepted', 'Escrow Paid', 'Pickup', 'In Transit', 'Arrived', 'QR Confirmed', 'Completed'];
        const stepIndex = allSteps.indexOf(step);
        const statusOrder = ['MATCHED', 'MATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'COMPLETED'];
        if (statusOrder[stepIndex] === dealStatus) return 'active';
        return 'pending';
    };

    const timelineData = [
        { title: 'Accepted', sub: getStatusFromEvents('Accepted') === 'completed' ? 'Completed' : '', status: getStatusFromEvents('Accepted'), Icon: Check },
        { title: 'Escrow Paid', sub: getStatusFromEvents('Escrow Paid') === 'completed' ? 'Securely held' : '', status: getStatusFromEvents('Escrow Paid'), Icon: Wallet },
        { title: 'Pickup', sub: getStatusFromEvents('Pickup') === 'active' ? 'Active now' : '', status: getStatusFromEvents('Pickup'), Icon: Truck },
        { title: 'In Transit', sub: deal?.deliveryDate ? `Estimated ${new Date(deal.deliveryDate).toLocaleDateString()}` : '', status: getStatusFromEvents('In Transit'), Icon: Clock },
        { title: 'Arrived', sub: '', status: getStatusFromEvents('Arrived'), Icon: MapPin },
        { title: 'QR Confirmed', sub: '', status: getStatusFromEvents('QR Confirmed'), Icon: QrCode },
        { title: 'Completed', sub: '', status: getStatusFromEvents('Completed'), Icon: CheckCircle2 },
    ];

    const handleGenerateQR = () => {
        setShowQRModal(true);
    };

    const handleConfirmDelivery = () => {
        // When sender generates QR, traveler scanning it confirms pickup
        // Status auto-updates in backend when traveler scans the QR code
        setShowQRModal(false);
    };

    const handlePickupScan = () => {
        setScanPurpose('pickup');
        setShowPickupModal(true);
    };

    const handleReceiverScan = () => {
        setScanPurpose('delivery');
        setShowPickupModal(true);
    };

    const handleConfirmDeliveryOption = (option: string) => {
        setShowDeliveryOptionsModal(false);

        switch (option) {
            case 'reserve':
                Alert.alert('Reserve', 'Reservation confirmed. The package will be held for pickup.');
                break;
            case 'confirm':
                handleConfirmDelivery();
                break;
            case 'delete':
                Alert.alert('Delete Confirmation', 'Are you sure you want to delete this confirmation?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => {
                        updateDealStatus(dealId, 'CANCELLED');
                        Alert.alert('Deleted', 'Confirmation has been removed.');
                    }},
                ]);
                break;
            case 'keep':
                Alert.alert('Kept', 'Reservation kept. You can confirm later.');
                break;
        }
    };

    const [scanLocked, setScanLocked] = useState(false);
    const [scannedData, setScannedData] = useState<any>(null);
    const [permission, requestPermission] = useCameraPermissions();
    const scannedRef = useRef(false);

    // Rating state — shown automatically when deal reaches COMPLETED
    const [showRatingModal, setShowRatingModal] = useState(false);
    const [ratingDismissed, setRatingDismissed] = useState(false);
    const [alreadyReviewed, setAlreadyReviewed] = useState(false);
    const ratingShownRef = useRef(false);

    // Check whether the current user has already submitted a review for this deal
    useEffect(() => {
        if (!dealId || dealId === 'DEAL-001') return;
        if (dealStatus !== 'COMPLETED') return;
        reviewsApi.getDealReviews(dealId).then((res) => {
            if (res.success && Array.isArray(res.data)) {
                const reviewed = res.data.some((r: any) => r.authorId === currentUserId);
                setAlreadyReviewed(reviewed);
                if (!reviewed && !ratingShownRef.current && !ratingDismissed) {
                    ratingShownRef.current = true;
                    setShowRatingModal(true);
                }
            }
        }).catch(() => { /* non-blocking */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dealStatus]);

    // Rating target: sender rates traveler, traveler rates sender
    const ratingTarget = isSenderUser
        ? { id: deal?.travelerId || '', name: deal?.traveler?.name || 'Traveler', avatar: deal?.traveler?.avatar, profilePhoto: deal?.traveler?.profilePhoto, role: 'traveler' as const }
        : { id: deal?.senderId || '', name: deal?.sender?.name || 'Sender', avatar: deal?.sender?.avatar, profilePhoto: deal?.sender?.profilePhoto, role: 'sender' as const };

    const handleBarCodeScanned = (result: BarcodeScanningResult) => {
        if (scannedRef.current || scanLocked) return;
        scannedRef.current = true;
        setScanLocked(true);
        
        try {
            const data = JSON.parse(result.data);
            if (data.dealId === dealId) {
                setScannedData(data);
            } else {
                Alert.alert('Invalid QR Code', 'This QR code does not match this deal.');
                setScanLocked(false);
                scannedRef.current = false;
            }
        } catch {
            Alert.alert('Invalid QR Code', 'Could not read QR code. Please try again.');
            setScanLocked(false);
            scannedRef.current = false;
        }
    };

    const handleConfirmPickup = () => {
        const newStatus = scanPurpose === 'delivery' ? 'DELIVERED' : 'PICKED_UP';
        const successMsg = scanPurpose === 'delivery'
            ? 'Delivery confirmed! Funds will be released from escrow.'
            : 'Package pickup confirmed! The package is now ready for transport.';

        setIsProcessing(true);
        setTimeout(() => {
            updateDealStatus(dealId, newStatus);
            setIsProcessing(false);
            setShowPickupModal(false);
            setScannedData(null);
            setScanLocked(false);
            scannedRef.current = false;
            Alert.alert('Success', successMsg);
        }, 1500);
    };

    const resetScanner = () => {
        setScannedData(null);
        setScanLocked(false);
        scannedRef.current = false;
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.primary} size={24} />
                </TouchableOpacity>
                <Typography weight="bold" size="lg" style={styles.headerTitle}>Deal Summary</Typography>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Tracking Timeline */}
                <View style={styles.section}>
                    <Typography weight="bold" size="xs" color={COLORS.background.slate[400]} style={styles.sectionLabel}>
                        TRACKING TIMELINE
                    </Typography>

                    <View style={styles.timelineContainer}>
                        {timelineData.map((item, index) => (
                            <View key={index} style={styles.timelineItem}>
                                <View style={styles.timelineLeft}>
                                    <View style={[
                                        styles.timelineIconContainer,
                                        item.status === 'completed' ? styles.iconCompleted :
                                            item.status === 'active' ? styles.iconActive : styles.iconPending
                                    ]}>
                                        <item.Icon
                                            size={18}
                                            color={item.status === 'pending' ? COLORS.background.slate[300] : item.status === 'active' ? COLORS.primary : COLORS.white}
                                            strokeWidth={item.status === 'active' ? 2.5 : 2}
                                        />
                                    </View>
                                    {index < timelineData.length - 1 && (
                                        <View style={[
                                            styles.timelineConnector,
                                            item.status === 'completed' ? styles.connectorCompleted : styles.connectorPending
                                        ]} />
                                    )}
                                </View>
                                <View style={styles.timelineRight}>
                                    <Typography
                                        weight="bold"
                                        color={item.status === 'pending' ? COLORS.background.slate[300] : COLORS.background.slate[900]}
                                    >
                                        {item.title}
                                    </Typography>
                                    {item.sub !== '' && (
                                        <Typography size="xs" color={COLORS.background.slate[400]}>
                                            {item.sub}
                                        </Typography>
                                    )}
                                </View>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Shipment Overview */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Typography weight="bold" size="xs" color={COLORS.background.slate[400]} style={styles.sectionLabel}>
                            SHIPMENT OVERVIEW
                        </Typography>
                        <View style={styles.tag}>
                            <Typography size="xs" weight="bold" color={COLORS.primary}>STANDARD</Typography>
                        </View>
                    </View>

                    <View style={styles.routeContainer}>
                        <View style={styles.routePoint}>
                            <Typography weight="bold" size="xl">{fromCity}</Typography>
                            <Typography size="xs" color={COLORS.background.slate[400]}>{deal?.fromCountry || ''}</Typography>
                        </View>

                        <View style={styles.routeAnimation}>
                            <View style={styles.routeLine} />
                            <Plane size={20} color={COLORS.background.slate[300]} style={styles.planeIcon} />
                        </View>

                        <View style={styles.routePoint}>
                            <Typography weight="bold" size="xl" style={{ textAlign: 'right' }}>{toCity}</Typography>
                            <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'right' }}>{deal?.toCountry || ''}</Typography>
                        </View>
                    </View>

                    <View style={styles.detailsGrid}>
                        <View style={styles.detailItem}>
                            <Typography size="xs" color={COLORS.background.slate[400]}>Item Type</Typography>
                            <View style={styles.detailRow}>
                                <FileText size={14} color={COLORS.background.slate[600]} />
                                <Typography weight="bold" size="sm" style={{ marginLeft: 6 }}>{deal?.title || 'Documents'}</Typography>
                            </View>
                        </View>
                        <View style={styles.detailItem}>
                            <Typography size="xs" color={COLORS.background.slate[400]}>Traveler</Typography>
                            <View style={styles.detailRow}>
                                <User size={14} color={COLORS.background.slate[600]} />
                                <Typography weight="bold" size="sm" style={{ marginLeft: 6 }}>{(deal as any)?.traveler?.name || 'Assigned'}</Typography>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Payment Status */}
                <View style={styles.section}>
                    <Typography weight="bold" size="xs" color={COLORS.background.slate[400]} style={styles.sectionLabel}>
                        PAYMENT STATUS
                    </Typography>

                    <View style={styles.paymentCard}>
                        <View style={styles.paymentHeader}>
                            <View>
                                <Typography size="xs" color={COLORS.background.slate[400]}>Total Amount</Typography>
                                <Typography weight="bold" size="2xl" color={COLORS.primary}>{currency.symbol}{deal?.price?.toFixed(2) || '0.00'}</Typography>
                            </View>
                            <TouchableOpacity style={styles.receiptButton}>
                                <Typography size="xs" weight="bold" color={COLORS.primary}>View Receipt</Typography>
                                <ExternalLink size={14} color={COLORS.primary} style={{ marginLeft: 4 }} />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.escrowBanner}>
                            <CheckCircle2 size={18} color="#10B981" />
                            <View style={{ marginLeft: 12 }}>
                                <Typography weight="bold" size="sm" color="#065F46">Securely held in Escrow</Typography>
                                <Typography size="xs" color="#065F46">Funds will be released upon QR confirmation.</Typography>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Info Message */}
                <View style={styles.infoBox}>
                    <Info size={20} color={COLORS.primary} />
                    <Typography size="xs" color={COLORS.background.slate[600]} style={styles.infoText}>
                        The traveler will provide a QR code at the point of delivery. Scanning this code confirms the successful handover and triggers the release of funds from escrow.
                    </Typography>
                </View>

                {/* ==================== ACTIONS SECTION ==================== */}
                {/* Live Tracking — visible to both parties once matched */}
                {onLiveTracking && (
                    <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#0F172A', marginBottom: 10 }]} onPress={onLiveTracking}>
                        <MapPin size={20} color={COLORS.white} />
                        <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>View Live Map</Typography>
                    </TouchableOpacity>
                )}

                {/* SENDER ACTIONS — always visible once a deal is matched */}
                {isSenderUser && (
                    <>
                        {/* Share QR Code — for the traveler to scan and confirm pickup */}
                        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#3B82F6', marginBottom: 10 }]} onPress={handleGenerateQR}>
                            <QrCode size={20} color={COLORS.white} />
                            <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Share QR Code</Typography>
                        </TouchableOpacity>

                        {/* If sender = receiver (same phone): scan traveler's delivery QR directly.
                            Otherwise: share a delivery code with the receiver. */}
                        {isSenderReceiver ? (
                            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#7C3AED', marginBottom: 10 }]} onPress={handleReceiverScan}>
                                <Scan size={20} color={COLORS.white} />
                                <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Scan Receiver QR</Typography>
                            </TouchableOpacity>
                        ) : (
                            onReceiverCode && (
                                <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#10B981', marginBottom: 10 }]} onPress={onReceiverCode}>
                                    <QrCode size={20} color={COLORS.white} />
                                    <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Share Receiver Code</Typography>
                                </TouchableOpacity>
                            )
                        )}

                        {/* Conversation — always visible */}
                        {onChat && (
                            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#1976D2', marginBottom: 10 }]} onPress={onChat}>
                                <MessageCircle size={20} color={COLORS.white} />
                                <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Conversation</Typography>
                            </TouchableOpacity>
                        )}
                    </>
                )}

                {/* TRAVELER ACTIONS */}
                {isTraveler && (
                    <>
                        {/* Scan Package QR - for pickup confirmation */}
                        {isPickupStage && (
                            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#7C3AED', marginBottom: 10 }]} onPress={handlePickupScan}>
                                <Scan size={20} color={COLORS.white} />
                                <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Scan Package QR</Typography>
                            </TouchableOpacity>
                        )}
                        
                        {/* Share QR Code for the receiver — available right after pickup is confirmed */}
                        {(dealStatus === 'PICKED_UP' || dealStatus === 'IN_TRANSIT' || dealStatus === 'arrived') && (
                            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#3B82F6', marginBottom: 10 }]} onPress={handleGenerateQR}>
                                <QrCode size={20} color={COLORS.white} />
                                <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Share QR Code for Receiver</Typography>
                            </TouchableOpacity>
                        )}
                        
                        {/* Conversation button - only if sender exists */}
                        {deal?.sender && onChat && (
                            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: '#1976D2', marginBottom: 10 }]} onPress={onChat}>
                                <MessageCircle size={20} color={COLORS.white} />
                                <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Conversation</Typography>
                            </TouchableOpacity>
                        )}
                    </>
                )}

                {/* RATE EXPERIENCE — visible to both parties once deal is COMPLETED */}
                {dealStatus === 'COMPLETED' && !alreadyReviewed && ratingTarget.id !== '' && (
                    <TouchableOpacity
                        style={[styles.primaryButton, { backgroundColor: '#f59e0b', marginBottom: 10 }]}
                        onPress={() => setShowRatingModal(true)}
                    >
                        <Star size={20} color={COLORS.white} fill={COLORS.white} />
                        <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>
                            Rate your {ratingTarget.role === 'traveler' ? 'Traveler' : 'Sender'}
                        </Typography>
                    </TouchableOpacity>
                )}

                {dealStatus === 'COMPLETED' && alreadyReviewed && (
                    <View style={styles.reviewedBadge}>
                        <CheckCircle2 size={16} color={COLORS.success} />
                        <Typography size="sm" weight="bold" color={COLORS.success} style={{ marginLeft: 6 }}>
                            Review submitted
                        </Typography>
                    </View>
                )}

                <View style={styles.secondaryActions}>
                    <TouchableOpacity style={styles.cancelButton} onPress={onDispute}>
                        <Typography weight="bold" color={COLORS.background.slate[500]}>File Dispute</Typography>
                    </TouchableOpacity>
                    <View style={styles.dividerDot} />
                    <TouchableOpacity style={styles.cancelButton} onPress={() => setShowCancelDialog(true)}>
                        <Typography weight="bold" color="#EF4444">Cancel Deal</Typography>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* QR Code Modal */}
            <Modal
                visible={showQRModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowQRModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Typography weight="bold" size="lg">{isSenderUser ? 'Your QR Code' : 'Delivery QR Code'}</Typography>
                            <TouchableOpacity onPress={() => setShowQRModal(false)}>
                                <X size={24} color={COLORS.background.slate[600]} />
                            </TouchableOpacity>
                        </View>

                        <QRCodeGenerator
                            value={qrValue}
                            size={220}
                            title=""
                            subtitle={isSenderUser
                                ? "Share this QR code with the traveler. They'll scan it to confirm pickup."
                                : "Share this QR code with the receiver. They'll scan it to confirm delivery and release escrow funds."}
                        />

                        <View style={styles.qrDealInfo}>
                            <Typography size="sm" color={COLORS.background.slate[500]}>Deal ID: {dealId}</Typography>
                            <Typography size="sm" color={COLORS.background.slate[500]}>Route: {routeString}</Typography>
                            {isSenderUser && <Typography size="xs" color="#059669" style={{marginTop: 4}}>Traveler will scan to confirm pickup</Typography>}
                        </View>

                        {isSenderUser && (
                            <View style={{alignItems: 'center', paddingVertical: 10}}>
                                <Typography size="sm" color={COLORS.background.slate[500]}>
                                    Status will auto-update to "In Transit" when scanned
                                </Typography>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Pickup Scan Modal (for Traveler) */}
            <Modal
                visible={showPickupModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => {
                    setShowPickupModal(false);
                    resetScanner();
                }}
            >
                <View style={styles.pickupModalOverlay}>
                    <View style={styles.pickupModalContent}>
                        <View style={styles.modalHeader}>
                            <Typography weight="bold" size="lg">
                                {scanPurpose === 'delivery' ? "Scan Traveler's QR" : 'Scan Package QR'}
                            </Typography>
                            <TouchableOpacity onPress={() => {
                                setShowPickupModal(false);
                                resetScanner();
                            }}>
                                <X size={24} color={COLORS.background.slate[600]} />
                            </TouchableOpacity>
                        </View>

                        {!permission?.granted ? (
                            <View style={styles.permissionContainer}>
                                <Scan size={64} color={COLORS.primary} />
                                <Typography size="lg" weight="bold" style={{ marginTop: 16, textAlign: 'center' }}>
                                    Camera Permission Required
                                </Typography>
                                <Typography size="sm" color={COLORS.background.slate[500]} style={{ marginTop: 8, textAlign: 'center' }}>
                                    {scanPurpose === 'delivery'
                                        ? "We need camera access to scan the traveler's QR code"
                                        : "We need camera access to scan the sender's QR code"}
                                </Typography>
                                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                                    <Typography weight="bold" color={COLORS.white}>Grant Permission</Typography>
                                </TouchableOpacity>
                            </View>
                        ) : scannedData ? (
                            <View style={styles.scannedContainer}>
                                <View style={[styles.resultCircle, { backgroundColor: '#F0FDF4' }]}>
                                    <CheckCircle2 size={48} color={COLORS.success} />
                                </View>
                                <Typography size="lg" weight="bold" style={{ marginTop: 16, textAlign: 'center' }}>
                                    QR Code Scanned!
                                </Typography>
                                <Typography size="sm" color={COLORS.background.slate[500]} style={{ marginTop: 8, textAlign: 'center' }}>
                                    Deal: {scannedData?.dealId}
                                </Typography>
                                <Typography size="sm" color={COLORS.background.slate[500]} style={{ marginTop: 4, textAlign: 'center' }}>
                                    Route: {scannedData?.route}
                                </Typography>
                                
                                {isProcessing ? (
                                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                        <ActivityIndicator size="large" color={COLORS.primary} />
                                        <Typography size="sm" style={{ marginTop: 12 }}>
                                            {scanPurpose === 'delivery' ? 'Confirming delivery...' : 'Confirming pickup...'}
                                        </Typography>
                                    </View>
                                ) : (
                                    <TouchableOpacity
                                        style={[styles.confirmDeliveryButton, { backgroundColor: '#7C3AED', marginTop: 24 }]}
                                        onPress={handleConfirmPickup}
                                    >
                                        <CheckCircle2 size={20} color={COLORS.white} />
                                        <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 8 }}>
                                            {scanPurpose === 'delivery' ? 'Confirm Delivery' : 'Confirm Pickup'}
                                        </Typography>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : (
                            <View style={styles.cameraContainer}>
                                <CameraView
                                    style={StyleSheet.absoluteFillObject}
                                    facing="back"
                                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                                    onBarcodeScanned={scanLocked ? undefined : handleBarCodeScanned}
                                />
                                <View style={styles.scanOverlay}>
                                    <View style={styles.scanFrame}>
                                        <View style={[styles.corner, styles.cornerTL]} />
                                        <View style={[styles.corner, styles.cornerTR]} />
                                        <View style={[styles.corner, styles.cornerBL]} />
                                        <View style={[styles.corner, styles.cornerBR]} />
                                    </View>
                                </View>
                                <View style={styles.scanHint}>
                                    <Typography size="base" color={COLORS.white} align="center">
                                        {scanPurpose === 'delivery'
                                            ? "Point camera at traveler's QR code"
                                            : "Point camera at sender's QR code"}
                                    </Typography>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Delivery Options Modal */}
            <Modal
                visible={showDeliveryOptionsModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowDeliveryOptionsModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Typography weight="bold" size="lg">Delivery Options</Typography>
                            <TouchableOpacity onPress={() => setShowDeliveryOptionsModal(false)}>
                                <X size={24} color={COLORS.background.slate[600]} />
                            </TouchableOpacity>
                        </View>

                        <Typography size="sm" color={COLORS.background.slate[500]} style={{ marginBottom: 24, textAlign: 'center' }}>
                            Choose an action for this delivery
                        </Typography>

                        <TouchableOpacity 
                            style={[styles.optionButton, { backgroundColor: '#3B82F6' }]} 
                            onPress={() => handleConfirmDeliveryOption('reserve')}
                        >
                            <Typography weight="bold" color={COLORS.white}>Reserve</Typography>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.optionButton, { backgroundColor: '#10B981' }]} 
                            onPress={() => handleConfirmDeliveryOption('confirm')}
                        >
                            <Typography weight="bold" color={COLORS.white}>Confirm Delivery</Typography>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.optionButton, { backgroundColor: '#EF4444' }]} 
                            onPress={() => handleConfirmDeliveryOption('delete')}
                        >
                            <Typography weight="bold" color={COLORS.white}>Delete Confirmation</Typography>
                        </TouchableOpacity>

                        <TouchableOpacity 
                            style={[styles.optionButton, { backgroundColor: '#6B7280' }]} 
                            onPress={() => handleConfirmDeliveryOption('keep')}
                        >
                            <Typography weight="bold" color={COLORS.white}>Keep Reservation</Typography>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <CancelDialog
                visible={showCancelDialog}
                entityType="deal"
                entityId={dealId}
                onClose={() => setShowCancelDialog(false)}
                onConfirmed={() => {
                    setShowCancelDialog(false);
                    onCancel();
                }}
            />

            {/* Rating Modal — triggered automatically on COMPLETED, or manually via button */}
            {ratingTarget.id !== '' && (
                <RatingModal
                    visible={showRatingModal}
                    dealId={dealId}
                    target={ratingTarget}
                    onSubmitted={() => {
                        setShowRatingModal(false);
                        setAlreadyReviewed(true);
                    }}
                    onDismiss={() => {
                        setShowRatingModal(false);
                        setRatingDismissed(true);
                    }}
                />
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.lg,
        paddingVertical: SPACING.md,
        backgroundColor: COLORS.white,
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        color: COLORS.background.slate[900],
    },
    scrollContent: {
        padding: SPACING.lg,
        gap: SPACING.lg,
    },
    section: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.xl,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
    },
    sectionLabel: {
        letterSpacing: 1,
        marginBottom: 16,
    },
    timelineContainer: {
        paddingLeft: 8,
    },
    timelineItem: {
        flexDirection: 'row',
        gap: 16,
    },
    timelineLeft: {
        alignItems: 'center',
        width: 32,
    },
    timelineIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    iconCompleted: {
        backgroundColor: COLORS.primary,
    },
    iconActive: {
        backgroundColor: COLORS.white,
        borderWidth: 2,
        borderColor: COLORS.primary,
    },
    iconPending: {
        backgroundColor: '#F1F5F9',
    },
    timelineConnector: {
        width: 2,
        height: 30,
        marginVertical: 4,
    },
    connectorCompleted: {
        backgroundColor: COLORS.primary,
    },
    connectorPending: {
        backgroundColor: '#E2E8F0',
    },
    timelineRight: {
        paddingTop: 4,
        paddingBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    tag: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    routeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    routePoint: {
        flex: 1,
    },
    routeAnimation: {
        flex: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    routeLine: {
        width: '100%',
        height: 1,
        backgroundColor: '#E2E8F0',
        position: 'absolute',
    },
    planeIcon: {
        backgroundColor: COLORS.white,
        paddingHorizontal: 8,
    },
    detailsGrid: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingTop: 16,
    },
    detailItem: {
        flex: 1,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    paymentCard: {
        gap: 16,
    },
    paymentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    receiptButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingBottom: 4,
    },
    escrowBanner: {
        backgroundColor: '#F0FDF4',
        borderRadius: RADIUS.lg,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#DCFCE7',
    },
    infoBox: {
        backgroundColor: '#F1F5F9',
        borderRadius: RADIUS.lg,
        padding: 16,
        flexDirection: 'row',
        gap: 12,
    },
    infoText: {
        flex: 1,
        lineHeight: 18,
    },
    primaryButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        paddingVertical: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 10,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    cancelButton: {
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryActions: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    dividerDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.background.slate[300],
        marginHorizontal: 16,
    },
    // QR Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: SPACING.xl,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.lg,
    },
    qrDealInfo: {
        alignItems: 'center',
        gap: 4,
        marginBottom: SPACING.xl,
    },
    confirmDeliveryButton: {
        backgroundColor: COLORS.success,
        borderRadius: RADIUS.xl,
        paddingVertical: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.success,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    optionButton: {
        borderRadius: RADIUS.xl,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
    },
    // Pickup Scanner Styles
    pickupModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'flex-end',
    },
    pickupModalContent: {
        backgroundColor: COLORS.white,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: SPACING.xl,
        paddingBottom: 40,
        height: '85%',
    },
    permissionContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    permissionButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        paddingVertical: 16,
        paddingHorizontal: 32,
        marginTop: 24,
    },
    cameraContainer: {
        flex: 1,
        borderRadius: RADIUS.xl,
        overflow: 'hidden',
        marginVertical: 16,
    },
    scanOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scanFrame: {
        width: 220,
        height: 220,
        position: 'relative',
    },
    corner: {
        position: 'absolute',
        width: 32,
        height: 32,
        borderColor: COLORS.white,
    },
    cornerTL: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
    },
    cornerTR: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
    },
    cornerBL: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
    },
    cornerBR: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
    },
    scanHint: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    scannedContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    resultCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    reviewedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${COLORS.success}12`,
        borderRadius: RADIUS.xl,
        paddingVertical: SPACING.md,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: `${COLORS.success}30`,
    },
});
