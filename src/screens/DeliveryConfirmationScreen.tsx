import React from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Dimensions,
    Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import {
    ArrowLeft,
    Box,
    User,
    CheckCircle2,
    Plane,
    MapPin,
    QrCode,
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface DeliveryConfirmationScreenProps {
    deal: any;
    onBack: () => void;
    onConfirm: () => void;
    onDecline: () => void;
    onReserve?: () => void;
}

export const DeliveryConfirmationScreen: React.FC<DeliveryConfirmationScreenProps> = ({ deal, onBack, onConfirm, onDecline, onReserve }) => {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography weight="bold" size="lg" style={styles.headerTitle}>Delivery Confirmation</Typography>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <Typography weight="bold" size="2xl" style={styles.title}>Confirm Delivery</Typography>
                <Typography color={COLORS.background.slate[400]} style={styles.subtitle}>
                    Please verify the shipment details before completing the delivery.
                </Typography>

                {/* Map Card */}
                <View style={styles.card}>
                    <View style={styles.mapContainer}>
                        <Image
                            source={require('../../assets/map_placeholder.png')}
                            style={styles.mapImage}
                        />
                        <View style={styles.routePill}>
                            <Plane size={16} color={COLORS.primary} />
                            <Typography weight="bold" color={COLORS.primary} style={{ marginLeft: 8 }}>{deal.route?.from || deal.routeString || 'N/A'}   →   {deal.route?.to || ''}</Typography>
                        </View>
                    </View>

                    <View style={styles.cardContent}>
                        <View style={styles.infoRow}>
                            <View>
                                <Typography size="xs" weight="bold" color={COLORS.background.slate[400]}>ROUTE</Typography>
                                <Typography weight="bold" size="lg">{deal.route?.from || 'N/A'} → {deal.route?.to || 'N/A'}</Typography>
                            </View>
                            <View style={styles.priorityTag}>
                                <Typography size="xs" weight="bold" color={COLORS.primary}>Priority</Typography>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        <View style={styles.detailItem}>
                            <View style={styles.iconBox}>
                                <Box size={24} color={COLORS.primary} fill={`${COLORS.primary}1A`} />
                            </View>
                            <View style={styles.detailTexts}>
                                <Typography size="xs" weight="bold" color={COLORS.background.slate[400]}>ITEM</Typography>
                                <Typography weight="bold" size="md">{deal.package?.category || deal.name || 'Package'}</Typography>
                            </View>
                        </View>

                        <View style={styles.detailItem}>
                            <View style={styles.iconBox}>
                                <User size={24} color={COLORS.primary} fill={`${COLORS.primary}1A`} />
                            </View>
                            <View style={styles.detailTexts}>
                                <Typography size="xs" weight="bold" color={COLORS.background.slate[400]}>RECEIVER</Typography>
                                <Typography weight="bold" size="md">{deal.senderName || 'Receiver'}</Typography>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    {onReserve && (
                        <TouchableOpacity style={[styles.confirmButton, { backgroundColor: '#059669', marginBottom: 12 }]} onPress={onReserve}>
                            <QrCode size={20} color={COLORS.white} />
                            <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Reserve (Scan Traveler QR)</Typography>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity style={styles.confirmButton} onPress={onConfirm}>
                        <CheckCircle2 size={20} color={COLORS.white} />
                        <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>Confirm Delivery</Typography>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.declineButton} onPress={onDecline}>
                        <Typography weight="bold" color="#EF4444">Decline</Typography>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Simulated navigation bar placeholder */}
            <View style={styles.navBar}>
                <View style={styles.navItem}><Typography size="xs">Home</Typography></View>
                <View style={styles.navItem}><Typography size="xs" weight="bold" color={COLORS.primary}>Deliveries</Typography></View>
                <View style={styles.navItem}><Typography size="xs">Scan</Typography></View>
                <View style={styles.navItem}><Typography size="xs">Profile</Typography></View>
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
    },
    title: {
        marginTop: 20,
        marginBottom: 8,
    },
    subtitle: {
        marginBottom: 30,
    },
    card: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS['2xl'],
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 15,
        elevation: 3,
    },
    mapContainer: {
        height: 180,
        backgroundColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    routePill: {
        position: 'absolute',
        backgroundColor: COLORS.white,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 30,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 4,
    },
    cardContent: {
        padding: 24,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    priorityTag: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    divider: {
        height: 1,
        backgroundColor: '#F1F5F9',
        marginVertical: 20,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#F0F7FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailTexts: {
        marginLeft: 16,
    },
    actions: {
        marginTop: 40,
        gap: 12,
    },
    confirmButton: {
        backgroundColor: COLORS.primary,
        borderRadius: RADIUS.xl,
        paddingVertical: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    declineButton: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.xl,
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#FEE2E2',
    },
    navBar: {
        flexDirection: 'row',
        height: 80,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        paddingBottom: 20,
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
