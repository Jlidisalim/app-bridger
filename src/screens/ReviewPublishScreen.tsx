import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { StepIndicator } from '../components/StepIndicator';
import {
    ArrowLeft,
    MapPin,
    Package,
    User,
    CreditCard,
    Calendar,
    CheckCircle2,
    Lock,
    ChevronRight
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { useUserCurrency } from '../utils/currency';
import { calculateFees } from '../utils/feeEngine';

interface ReviewPublishScreenProps {
    onPublish: () => void;
    onBack: () => void;
    onEditPackage?: () => void;
    onEditRoute?: () => void;
    onEditReceiver?: () => void;
}

export const ReviewPublishScreen: React.FC<ReviewPublishScreenProps> = ({ onPublish, onBack, onEditPackage, onEditRoute, onEditReceiver }) => {
    const currency = useUserCurrency();
    // FIX 15B: Loading state to prevent double-submission
    const [isPublishing, setIsPublishing] = useState(false);

    const handlePublish = async () => {
        if (isPublishing) return;
        setIsPublishing(true);
        try {
            await onPublish();
        } finally {
            setIsPublishing(false);
        }
    };

    const senderPackage = useAppStore((s) => s.senderPackage);
    const senderRoute = useAppStore((s) => s.senderRoute);
    const senderReceiver = useAppStore((s) => s.senderReceiver);
    const senderPricing = useAppStore((s) => s.senderPricing);

    const packageLabel = senderPackage ? `${senderPackage.category} • ${senderPackage.weight} kg` : 'No package set';
    const routeFrom = senderRoute?.from || 'Origin';
    const routeTo = senderRoute?.to || 'Destination';
    const routeDate = senderRoute?.departureDate || 'Flexible';
    const receiverName = senderReceiver?.name || 'Not set';
    const receiverPhone = senderReceiver?.phone || '';
    const serviceFee = senderPricing?.amount ?? 0;
    const { senderFlatFee: commission, senderTotalCost: total } = calculateFees(serviceFee);
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                    </TouchableOpacity>
                    <Typography size="lg" weight="bold" style={styles.headerTitle}>
                        Review & Publish
                    </Typography>
                </View>
                <StepIndicator currentStep={5} totalSteps={5} label="Final Review" />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Typography size="2xl" weight="bold" style={styles.title}>Double check details</Typography>

                {/* Package Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardIconBox}>
                            <Package color={COLORS.primary} size={20} />
                        </View>
                        <Typography weight="bold" style={styles.flex1}>Package Details</Typography>
                        <TouchableOpacity onPress={onEditPackage}><Typography size="xs" weight="bold" color={COLORS.primary}>Edit</Typography></TouchableOpacity>
                    </View>
                    <View style={styles.cardContent}>
                        <Typography size="sm" color={COLORS.background.slate[600]}>{packageLabel}</Typography>
                        <Typography size="xs" color={COLORS.background.slate[400]} italic style={styles.itemDesc}>
                            {senderPackage?.description || `Item: ${senderPackage?.category || 'Package'}`}
                        </Typography>
                    </View>
                </View>

                {/* Route Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardIconBox}>
                            <MapPin color={COLORS.primary} size={20} />
                        </View>
                        <Typography weight="bold" style={styles.flex1}>Route & Date</Typography>
                        <TouchableOpacity onPress={onEditRoute}><Typography size="xs" weight="bold" color={COLORS.primary}>Edit</Typography></TouchableOpacity>
                    </View>
                    <View style={styles.cardContent}>
                        <View style={styles.routeRow}>
                            <Typography size="sm" weight="semibold">{routeFrom}</Typography>
                            <ChevronRight color={COLORS.background.slate[300]} size={16} />
                            <Typography size="sm" weight="semibold">{routeTo}</Typography>
                        </View>
                        <Typography size="xs" color={COLORS.background.slate[500]} style={styles.marginTop}>
                            Departure: {routeDate}
                        </Typography>
                    </View>
                </View>

                {/* Recipient Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardIconBox}>
                            <User color={COLORS.primary} size={20} />
                        </View>
                        <Typography weight="bold" style={styles.flex1}>Receiver</Typography>
                        <TouchableOpacity onPress={onEditReceiver}><Typography size="xs" weight="bold" color={COLORS.primary}>Edit</Typography></TouchableOpacity>
                    </View>
                    <View style={styles.cardContent}>
                        <Typography size="sm" weight="semibold">{receiverName}</Typography>
                        <Typography size="xs" color={COLORS.background.slate[500]}>{receiverPhone}</Typography>
                    </View>
                </View>

                {/* Pricing Summary */}
                <View style={styles.pricingCard}>
                    <Typography weight="bold" style={styles.cardTitle}>Payment Summary</Typography>
                    <View style={styles.priceRow}>
                        <Typography size="sm" color={COLORS.background.slate[600]}>Service Fee</Typography>
                        <Typography size="sm" weight="bold" color={COLORS.background.slate[900]}>{currency.symbol}{serviceFee.toFixed(2)}</Typography>
                    </View>
                    <View style={styles.priceRow}>
                        <Typography size="sm" color={COLORS.background.slate[600]}>Platform Commission (5%)</Typography>
                        <Typography size="sm" weight="bold" color={COLORS.background.slate[900]}>{currency.symbol}{commission.toFixed(2)}</Typography>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.priceRow}>
                        <Typography size="base" weight="bold">Total Amount</Typography>
                        <Typography size="lg" weight="bold" color={COLORS.primary}>{currency.symbol}{total.toFixed(2)}</Typography>
                    </View>
                    <View style={styles.lockBox}>
                        <Lock color={COLORS.primary} size={14} />
                        <Typography size="xs" weight="semibold" color={COLORS.primary} uppercase tracking={0.5}>
                            100% Secure Escrow Payment
                        </Typography>
                    </View>
                </View>

                <View style={styles.bottomSpacer} />
            </ScrollView>

            <View style={styles.footer}>
                <Button
                    label={isPublishing ? 'Publishing...' : 'Publish Shipment'}
                    onPress={handlePublish}
                    disabled={isPublishing}
                    icon={isPublishing
                        ? <ActivityIndicator size="small" color={COLORS.white} />
                        : <CheckCircle2 color={COLORS.white} size={20} />}
                />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.light,
    },
    header: {
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    scrollContent: {
        padding: SPACING.xl,
    },
    title: {
        marginBottom: SPACING.xl,
    },
    card: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: SPACING.lg,
        marginBottom: SPACING.md,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    cardIconBox: {
        width: 36,
        height: 36,
        borderRadius: 8,
        backgroundColor: `${COLORS.primary}0D`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    flex1: {
        flex: 1,
    },
    cardContent: {
        paddingLeft: 48,
    },
    itemDesc: {
        marginTop: 4,
    },
    routeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    marginTop: {
        marginTop: 6,
    },
    pricingCard: {
        backgroundColor: `${COLORS.primary}08`,
        borderRadius: RADIUS.xl,
        padding: SPACING.xl,
        marginTop: SPACING.lg,
        borderWidth: 1,
        borderColor: `${COLORS.primary}1A`,
    },
    cardTitle: {
        marginBottom: SPACING.lg,
    },
    priceRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    divider: {
        height: 1,
        backgroundColor: `${COLORS.primary}1A`,
        marginVertical: 12,
    },
    lockBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: SPACING.lg,
        paddingVertical: 8,
        backgroundColor: `${COLORS.primary}0D`,
        borderRadius: 8,
    },
    footer: {
        padding: SPACING.xl,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.background.slate[100],
    },
    bottomSpacer: {
        height: 40,
    },
});
