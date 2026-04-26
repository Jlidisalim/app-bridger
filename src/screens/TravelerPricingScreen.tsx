import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    TextInput,
    Switch,
    Platform,
    ActivityIndicator,
    Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { ArrowLeft, Brain, Sparkles, ArrowRight } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { pricingAPI } from '../services/api';
import { useUserCurrency } from '../utils/currency';
import { calculateFees } from '../utils/feeEngine';

interface TravelerPricingScreenProps {
    onNext: (pricing: any) => void;
    onBack: () => void;
}

export const TravelerPricingScreen: React.FC<TravelerPricingScreenProps> = ({ onNext, onBack }) => {
    const travelerPricing = useAppStore((s) => s.travelerPricing);
    const travelerRoute = useAppStore((s) => s.travelerRoute);
    const currency = useUserCurrency();
    const [fee, setFee] = useState(travelerPricing?.amount ? travelerPricing.amount.toFixed(2) : '0.00');
    const [negotiable, setNegotiable] = useState(travelerPricing?.negotiable ?? true);

    const [aiSuggestion, setAiSuggestion] = useState<{ min: number; max: number; median: number; confidence: number; distanceKm?: number } | null>(null);
    const [loadingAI, setLoadingAI] = useState(false);

    const earnings = parseFloat(fee) || 0;
    const { travelerServiceFee: commission, travelerNetPayout: total } = calculateFees(earnings);

    useEffect(() => {
        const fetchSuggestion = async () => {
            if (!travelerRoute?.from || !travelerRoute?.to) return;
            setLoadingAI(true);
            try {
                const result = await pricingAPI.getSuggestedPrice(
                    { from: travelerRoute.from, to: travelerRoute.to },
                    1
                );
                setAiSuggestion(result);
            } catch (e) {
                console.error('Failed to get AI price suggestion:', e);
            } finally {
                setLoadingAI(false);
            }
        };
        fetchSuggestion();
    }, [travelerRoute]);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold" style={styles.headerTitle}>
                    Pricing
                </Typography>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                {/* Step Info */}
                <View style={styles.stepInfoContainer}>
                    <View style={styles.stepHeaderRow}>
                        <Typography size="xs" weight="bold" color="#0F172A">
                            Traveler Flow
                        </Typography>
                        <Typography size="sm" color={COLORS.background.slate[500]}>Step 4 of 5</Typography>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBarFill, { width: '80%' }]} />
                    </View>
                </View>

                {/* Title Section */}
                <View style={styles.titleSection}>
                    <Typography size="3xl" weight="bold" color="#0F172A" style={{ lineHeight: 40 }}>
                        Set your service fee
                    </Typography>
                    <Typography size="md" color={COLORS.background.slate[600]} style={{ marginTop: 12, lineHeight: 24 }}>
                        How much would you like to earn for this delivery?
                    </Typography>
                </View>

                {/* Service Fee Input */}
                <View style={styles.inputSection}>
                    <Typography size="sm" weight="bold" color="#0F172A" style={styles.label}>
                        Service Fee
                    </Typography>
                    <View style={styles.feeInputWrapper}>
                        <Typography size="3xl" weight="bold" color="#1E3B8A" style={styles.currencySymbol}>{currency.symbol}</Typography>
                        <TextInput
                            style={styles.feeInput}
                            keyboardType="decimal-pad"
                            value={fee}
                            onChangeText={setFee}
                            placeholder="0.00"
                            placeholderTextColor={COLORS.background.slate[300]}
                        />
                    </View>
                </View>

                {/* AI Suggestion */}
                <View style={styles.aiCard}>
                    <View style={styles.aiHeader}>
                        <View style={styles.aiTag}>
                            <Brain color="#1E3B8A" size={12} />
                            <Typography size="xs" weight="bold" color="#1E3B8A" uppercase tracking={1}>Smart AI Suggestion</Typography>
                        </View>
                        <Sparkles color={`#1E3B8A33`} size={28} />
                    </View>

                    {loadingAI ? (
                        <ActivityIndicator color="#1E3B8A" style={{ marginVertical: 10 }} />
                    ) : (
                        <>
                            <Typography size="xl" weight="bold" style={styles.aiRange}>
                                {currency.symbol}{aiSuggestion ? aiSuggestion.min.toFixed(2) : '35.00'} - {currency.symbol}{aiSuggestion ? aiSuggestion.max.toFixed(2) : '55.00'}
                            </Typography>
                            <Typography size="xs" color={COLORS.background.slate[500]} style={styles.aiDesc}>
                                {aiSuggestion?.distanceKm
                                    ? `Based on ${aiSuggestion.distanceKm.toLocaleString()} km route and market rates.`
                                    : 'Based on route demand and typical service fees for this distance.'}
                            </Typography>

                            {aiSuggestion && (
                                <View style={styles.confidenceRow}>
                                    <Typography size="xs" color={COLORS.background.slate[500]}>Confidence</Typography>
                                    <View style={styles.confidenceBar}>
                                        <View style={[styles.confidenceFill, { width: `${Math.round(aiSuggestion.confidence * 100)}%` as any }]} />
                                    </View>
                                    <Typography size="xs" weight="bold" color="#1E3B8A">{Math.round(aiSuggestion.confidence * 100)}%</Typography>
                                </View>
                            )}

                            <TouchableOpacity style={styles.applyButton} onPress={() => setFee(aiSuggestion ? aiSuggestion.median.toFixed(2) : '45.00')}>
                                <Typography size="xs" weight="bold" color="#1E3B8A">
                                    Apply median ({currency.symbol}{aiSuggestion ? aiSuggestion.median.toFixed(2) : '45.00'})
                                </Typography>
                                <ArrowRight color="#1E3B8A" size={14} />
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                {/* Toggle Card */}
                <View style={styles.toggleCard}>
                    <View style={styles.flex1}>
                        <Typography size="base" weight="bold" color="#0F172A">Open to negotiation</Typography>
                        <Typography size="sm" color={COLORS.background.slate[500]} style={{ marginTop: 4 }}>
                            Allow buyers to make counter-offers
                        </Typography>
                    </View>
                    <Switch
                        value={negotiable}
                        onValueChange={setNegotiable}
                        trackColor={{ false: COLORS.background.slate[200], true: '#1E3B8A' }}
                        thumbColor={COLORS.white}
                        ios_backgroundColor={COLORS.background.slate[200]}
                    />
                </View>

                {/* Earnings Summary Table */}
                <View style={styles.summaryBox}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.summaryTitle}>
                        POTENTIAL EARNINGS SUMMARY
                    </Typography>

                    <View style={styles.summaryDetail}>
                        <Typography size="sm" color={COLORS.background.slate[600]}>Your Service Fee</Typography>
                        <Typography size="sm" weight="semibold" color="#0F172A">{currency.symbol}{earnings.toFixed(2)}</Typography>
                    </View>

                    <View style={styles.summaryDetail}>
                        <Typography size="sm" color={COLORS.background.slate[600]}>Platform Commission (5%)</Typography>
                        <Typography size="sm" weight="semibold" color="#0F172A">-{currency.symbol}{commission.toFixed(2)}</Typography>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.summaryDetailTotal}>
                        <Typography size="base" weight="bold" color="#0F172A">Total Take-home Pay</Typography>
                        <Typography size="lg" weight="bold" color="#1E3B8A">{currency.symbol}{total.toFixed(2)}</Typography>
                    </View>
                </View>

            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.footer}>
                <View style={styles.footerButtons}>
                    <Button
                        label="Back"
                        variant="outline"
                        onPress={onBack}
                        style={styles.backCta}
                        textStyle={{ color: '#0F172A' }}
                    />
                    <Button
                        label="Next"
                        onPress={() => {
                            const parsed = parseFloat(fee);
                            if (!fee.trim() || isNaN(parsed)) {
                                Alert.alert('Fee required', 'Please enter a valid service fee.');
                                return;
                            }
                            if (parsed <= 0) {
                                Alert.alert('Invalid fee', 'Service fee must be greater than 0.');
                                return;
                            }
                            if (parsed > 10000) {
                                Alert.alert('Fee too high', 'Service fee cannot exceed 10,000.');
                                return;
                            }
                            onNext({ fee, negotiable });
                        }}
                        style={styles.nextCta}
                    />
                </View>
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
    inputSection: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    label: {
        marginBottom: 12,
    },
    feeInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        paddingHorizontal: SPACING.lg,
        height: 72,
        shadowColor: '#1E3B8A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
        borderWidth: 2,
        borderColor: '#1E3B8A30',
    },
    currencySymbol: {
        marginRight: 8,
        marginTop: 4,
        color: '#1E3B8A',
    },
    feeInput: {
        flex: 1,
        fontSize: 32,
        fontWeight: 'bold',
        color: '#1E3B8A',
        padding: 0,
        fontFamily: 'Inter_700Bold',
    },
    applyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    aiCard: {
        backgroundColor: '#1E3B8A08',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#1E3B8A1A',
        padding: 20,
        marginHorizontal: SPACING.xl,
        marginBottom: SPACING.lg,
    },
    aiHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    aiTag: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 4,
        paddingHorizontal: 8,
        backgroundColor: '#1E3B8A0D',
        borderRadius: 4,
    },
    aiRange: {
        marginBottom: 4,
        color: '#0F172A',
    },
    aiDesc: {
        lineHeight: 16,
        marginBottom: SPACING.lg,
    },
    confidenceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: SPACING.lg,
    },
    confidenceBar: {
        flex: 1,
        height: 4,
        backgroundColor: '#1E3B8A20',
        borderRadius: 2,
        overflow: 'hidden',
    },
    confidenceFill: {
        height: '100%',
        backgroundColor: '#1E3B8A',
        borderRadius: 2,
    },
    flex1: {
        flex: 1,
    },
    marginTop: {
        marginTop: 6,
        lineHeight: 18,
    },
    toggleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        padding: 24,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
        marginHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 1,
    },
    summaryBox: {
        backgroundColor: '#F1F5F9', // slate-100
        borderRadius: 24,
        padding: 24,
        marginHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    summaryTitle: {
        letterSpacing: 1,
        marginBottom: 20,
    },
    summaryDetail: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.background.slate[200],
        marginVertical: 16,
    },
    summaryDetailTotal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footer: {
        padding: SPACING.xl,
        backgroundColor: '#F8FAFC',
        paddingBottom: SPACING.xl,
    },
    footerButtons: {
        flexDirection: 'row',
        gap: SPACING.md,
    },
    backCta: {
        flex: 1,
        height: 56,
        borderRadius: 28,
        borderColor: COLORS.background.slate[200],
    },
    nextCta: {
        flex: 2,
        backgroundColor: '#1E3B8A',
        height: 56,
        borderRadius: 28,
    },
});
