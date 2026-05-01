import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    Image,
    Platform,
    ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { ArrowLeft, ArrowRight, Calendar, Clock, Weight, Package, Info, Rocket } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { useUserCurrency } from '../utils/currency';

interface TravelerReviewScreenProps {
    onPublish: () => void;
    onBack: () => void;
}

export const TravelerReviewScreen: React.FC<TravelerReviewScreenProps> = ({ onPublish, onBack }) => {
    const currency = useUserCurrency();
    // FIX 15C: Loading state to prevent double-submission
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

    const travelerRoute = useAppStore((s) => s.travelerRoute);
    const travelerFlight = useAppStore((s) => s.travelerFlight);
    const travelerCapacity = useAppStore((s) => s.travelerCapacity);
    const travelerPricing = useAppStore((s) => s.travelerPricing);
    const travelerPackageTypes = useAppStore((s) => s.travelerPackageTypes);

    const routeFrom = travelerRoute?.from || 'Origin';
    const routeTo = travelerRoute?.to || 'Destination';
    const price = travelerPricing?.amount ?? 0;
    const departureDate = travelerFlight?.date || 'Flexible';
    const departureTime = travelerFlight?.time || 'Flexible';
    const capacity = travelerCapacity || 1;
    const packageType = travelerPackageTypes.length > 0 ? travelerPackageTypes.join(', ') : 'All types';
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold" style={styles.headerTitle}>
                    Final Review
                </Typography>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Step Info */}
                <View style={styles.stepInfoContainer}>
                    <View style={styles.stepHeaderRow}>
                        <Typography size="base" weight="medium" color="#0F172A">
                            Review & Publish
                        </Typography>
                        <Typography size="sm" weight="bold" color="#1E3B8A">Step 5 of 5</Typography>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBarFill, { width: '100%' }]} />
                    </View>
                </View>

                {/* Title Section */}
                <View style={styles.titleSection}>
                    <Typography size="3xl" weight="bold" color="#0F172A">
                        Final Review
                    </Typography>
                </View>

                {/* Main Card */}
                <View style={styles.mainCard}>
                    <Image
                        source={{ uri: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1000&auto=format&fit=crop' }}
                        style={styles.heroImage}
                        resizeMode="cover"
                    />

                    <View style={styles.cardContent}>
                        {/* Route Header */}
                        <View style={styles.routeHeader}>
                            <View style={{ flex: 1 }}>
                                <Typography size="xs" weight="bold" color="#1E3B8A" style={{ letterSpacing: 1, marginBottom: 8 }}>
                                    TRIP ROUTE
                                </Typography>
                                <View style={styles.routeRow}>
                                    <Typography size="2xl" weight="bold" color="#0F172A">{routeFrom}</Typography>
                                    <ArrowRight color={COLORS.background.slate[400]} size={20} style={{ marginHorizontal: 8 }} />
                                    <Typography size="2xl" weight="bold" color="#0F172A">{routeTo}</Typography>
                                </View>
                            </View>
                            <View style={styles.pricePill}>
                                <Typography size="sm" weight="bold" color="#1E3B8A">{currency.symbol}{price.toFixed(2)}</Typography>
                            </View>
                        </View>

                        <View style={styles.cardDivider} />

                        {/* Details Grid */}
                        <View style={styles.detailsGrid}>
                            <View style={styles.detailItem}>
                                <Calendar color={COLORS.background.slate[400]} size={20} />
                                <View style={styles.detailText}>
                                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]}>DEPARTURE</Typography>
                                    <Typography size="sm" weight="medium" color="#0F172A">{departureDate}</Typography>
                                </View>
                            </View>

                            <View style={styles.detailItem}>
                                <Clock color={COLORS.background.slate[400]} size={20} />
                                <View style={styles.detailText}>
                                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]}>TIME</Typography>
                                    <Typography size="sm" weight="medium" color="#0F172A">{departureTime}</Typography>
                                </View>
                            </View>

                            <View style={[styles.detailItem, { marginTop: 24 }]}>
                                <Weight color={COLORS.background.slate[400]} size={20} />
                                <View style={styles.detailText}>
                                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]}>CAPACITY</Typography>
                                    <Typography size="sm" weight="medium" color="#0F172A">{capacity}kg available</Typography>
                                </View>
                            </View>

                            <View style={[styles.detailItem, { marginTop: 24 }]}>
                                <Package color={COLORS.background.slate[400]} size={20} />
                                <View style={styles.detailText}>
                                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]}>TYPE</Typography>
                                    <Typography size="sm" weight="medium" color="#0F172A">{packageType}</Typography>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Rules Card */}
                <View style={styles.rulesCard}>
                    <View style={styles.rulesIcon}>
                        <Info color="#1E3B8A" size={16} fill="#1E3B8A" stroke={COLORS.white} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Typography size="sm" weight="bold" color="#1E3B8A">
                            Platform Rules
                        </Typography>
                        <Typography size="xs" color={COLORS.background.slate[600]} style={{ marginTop: 6, lineHeight: 18 }}>
                            By publishing this trip, you agree to our Terms of Service. You confirm that you will inspect items before transport and adhere to international aviation security standards.
                        </Typography>
                    </View>
                </View>

            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.footer}>
                <Button
                    label={isPublishing ? 'Publishing...' : 'Publish Trip'}
                    onPress={handlePublish}
                    disabled={isPublishing}
                    style={styles.publishBtn}
                    icon={isPublishing
                        ? <ActivityIndicator size="small" color={COLORS.white} />
                        : <Rocket color={COLORS.white} size={20} />}
                    iconPosition="right"
                />
                <Button
                    label="Back to Edit"
                    variant="outline"
                    onPress={onBack}
                    style={styles.backEditBtn}
                    textStyle={{ color: '#0F172A', fontWeight: 'bold' }}
                />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.xl,
        paddingVertical: 16,
        backgroundColor: '#F8FAFC',
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    headerTitle: {
        color: COLORS.background.slate[900],
        fontSize: 18,
    },
    scrollContent: {
        paddingTop: SPACING.md,
        paddingBottom: 40,
    },
    stepInfoContainer: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    stepHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    progressBarContainer: {
        height: 6,
        backgroundColor: '#E2E8F0',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#1E3B8A',
        borderRadius: 3,
    },
    titleSection: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    mainCard: {
        backgroundColor: COLORS.white,
        borderRadius: 24,
        marginHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.03,
        shadowRadius: 10,
        elevation: 2,
    },
    heroImage: {
        width: '100%',
        height: 160,
    },
    cardContent: {
        padding: 24,
    },
    routeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    routeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    pricePill: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    cardDivider: {
        height: 1,
        backgroundColor: COLORS.background.slate[100],
        marginVertical: 24,
    },
    detailsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    detailItem: {
        width: '50%',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    detailText: {
        flex: 1,
        gap: 4,
    },
    rulesCard: {
        flexDirection: 'row',
        marginHorizontal: SPACING.xl,
        backgroundColor: '#E2E8F0', // Light grey/slate
        padding: 20,
        borderRadius: 16,
        marginBottom: SPACING.xxl,
    },
    rulesIcon: {
        marginTop: 2,
        marginRight: 12,
    },
    footer: {
        padding: SPACING.xl,
        backgroundColor: '#F8FAFC',
        paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xl,
        gap: 12,
    },
    publishBtn: {
        backgroundColor: '#1E3B8A',
        height: 56,
        borderRadius: 28,
        width: '100%',
    },
    backEditBtn: {
        backgroundColor: '#E2E8F0', // Slate-200
        height: 56,
        borderRadius: 28,
        width: '100%',
        borderWidth: 0, // removed outline border
    },
});
