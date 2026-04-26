import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    TextInput,
    ActivityIndicator,
    Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { StepIndicator } from '../components/StepIndicator';
import { ArrowLeft, Sparkles, Brain, Info, ArrowRight } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { pricingAPI, dealsAPI } from '../services/api';
import { useUserCurrency } from '../utils/currency';

interface PricingScreenProps {
    onConfirm: (pricing: any) => void;
    onBack: () => void;
}

export const PricingScreen: React.FC<PricingScreenProps> = ({ onConfirm, onBack }) => {
    const senderPricing = useAppStore((s) => s.senderPricing);
    const [price, setPrice] = useState(senderPricing?.amount ? senderPricing.amount.toFixed(2) : '40.00');
    const [isNegotible, setIsNegotiable] = useState(senderPricing?.negotiable ?? false);
    const [aiSuggestion, setAiSuggestion] = useState<{ min: number; max: number; median: number; confidence: number; distanceKm?: number } | null>(null);
    const [loadingAI, setLoadingAI] = useState(false);
    const senderRoute = useAppStore((s) => s.senderRoute);
    const senderPackage = useAppStore((s) => s.senderPackage);
    const currency = useUserCurrency();

    useEffect(() => {
        const fetchSuggestion = async () => {
            if (!senderRoute?.from || !senderRoute?.to) return;
            setLoadingAI(true);
            try {
                const result = await pricingAPI.getSuggestedPrice(
                    { from: senderRoute.from, to: senderRoute.to },
                    senderPackage?.weight || 1
                );
                setAiSuggestion(result);
            } catch (e) {
                console.error('Failed to get AI price suggestion:', e);
            } finally {
                setLoadingAI(false);
            }
        };
        fetchSuggestion();
    }, [senderRoute, senderPackage]);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                    </TouchableOpacity>
                    <Typography size="lg" weight="bold" style={styles.headerTitle}>
                        Create Shipment
                    </Typography>
                </View>
                <StepIndicator currentStep={5} totalSteps={5} label="Pricing Details" />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Typography size="2xl" weight="bold" style={styles.title}>Set your price</Typography>

                {/* Pricing Toggle */}
                <View style={styles.toggleContainer}>
                    <TouchableOpacity
                        style={[styles.toggleButton, !isNegotible && styles.toggleButtonActive]}
                        onPress={() => setIsNegotiable(false)}
                    >
                        <Typography size="sm" weight="bold" color={!isNegotible ? COLORS.primary : COLORS.background.slate[500]}>Fixed Price</Typography>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleButton, isNegotible && styles.toggleButtonActive]}
                        onPress={() => setIsNegotiable(true)}
                    >
                        <Typography size="sm" weight="bold" color={isNegotible ? COLORS.primary : COLORS.background.slate[500]}>Negotiable</Typography>
                    </TouchableOpacity>
                </View>

                {/* Price Input */}
                <View style={styles.priceSection}>
                    <Typography size="sm" weight="bold" color={COLORS.background.slate[700]} style={styles.label}>Your Price</Typography>
                    <View style={styles.inputWrapper}>
                        <Typography size="3xl" weight="bold" color={COLORS.background.slate[400]} style={styles.currencySymbol}>{currency.symbol}</Typography>
                        <TextInput
                            style={styles.priceInput}
                            keyboardType="decimal-pad"
                            value={price}
                            onChangeText={setPrice}
                            placeholder="0.00"
                        />
                    </View>
                </View>

                {/* AI Suggestion */}
                <View style={styles.aiCard}>
                    <View style={styles.aiHeader}>
                        <View style={styles.aiTag}>
                            <Brain color={COLORS.primary} size={12} />
                            <Typography size="xs" weight="bold" color={COLORS.primary} uppercase tracking={1}>Smart AI Suggestion</Typography>
                        </View>
                        <Sparkles color={`${COLORS.primary}33`} size={32} />
                    </View>

                    {loadingAI ? (
                        <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />
                    ) : (
                        <>
                            <Typography size="xl" weight="bold" style={styles.aiRange}>
                                {currency.symbol}{aiSuggestion ? aiSuggestion.min.toFixed(2) : '35.00'} - {currency.symbol}{aiSuggestion ? aiSuggestion.max.toFixed(2) : '45.00'}
                            </Typography>
                            <Typography size="xs" color={COLORS.background.slate[500]} style={styles.aiDesc}>
                                {aiSuggestion?.distanceKm
                                    ? `Based on ${aiSuggestion.distanceKm.toLocaleString()} km route, package weight, and live carrier rates.`
                                    : 'Based on current route demand, package dimensions, and typical carrier rates for this distance.'}
                            </Typography>

                            {aiSuggestion && (
                                <View style={styles.confidenceRow}>
                                    <Typography size="xs" color={COLORS.background.slate[500]}>Confidence</Typography>
                                    <View style={styles.confidenceBar}>
                                        <View style={[styles.confidenceFill, { width: `${Math.round(aiSuggestion.confidence * 100)}%` as any }]} />
                                    </View>
                                    <Typography size="xs" weight="bold" color={COLORS.primary}>{Math.round(aiSuggestion.confidence * 100)}%</Typography>
                                </View>
                            )}

                            <TouchableOpacity style={styles.applyButton} onPress={() => setPrice(aiSuggestion ? aiSuggestion.median.toFixed(2) : '40.00')}>
                                <Typography size="xs" weight="bold" color={COLORS.primary}>
                                    Apply median price ({currency.symbol}{aiSuggestion ? aiSuggestion.median.toFixed(2) : '40.00'})
                                </Typography>
                                <ArrowRight color={COLORS.primary} size={14} />
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                 <View style={styles.infoBox}>
                     <Info color={COLORS.background.slate[400]} size={16} />
                     <Typography size="xs" color={COLORS.background.slate[500]}>
                         Setting a competitive price increases your chances of finding a sender within 24 hours.
                     </Typography>
                 </View>
             </ScrollView>

            <View style={styles.footer}>
                <View style={styles.footerButtons}>
                    <Button label="Back" variant="outline" onPress={onBack} style={styles.backCta} />
                    <Button
                        label="Next Step"
                        onPress={() => {
                            const parsed = parseFloat(price);
                            if (!price.trim() || isNaN(parsed)) {
                                Alert.alert('Price required', 'Please enter a valid price.');
                                return;
                            }
                            if (parsed <= 0) {
                                Alert.alert('Invalid price', 'Price must be greater than 0.');
                                return;
                            }
                            if (parsed > 10000) {
                                Alert.alert('Price too high', 'Price cannot exceed 10,000.');
                                return;
                            }
                            onConfirm({ price, isNegotible });
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
    toggleContainer: {
        flexDirection: 'row',
        padding: 4,
        backgroundColor: COLORS.background.slate[100],
        borderRadius: RADIUS.lg,
        marginBottom: SPACING.xxl,
    },
    toggleButton: {
        flex: 1,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    toggleButtonActive: {
        backgroundColor: COLORS.white,
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    priceSection: {
        marginBottom: SPACING.xxl,
    },
    label: {
        marginLeft: 4,
        marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        paddingHorizontal: SPACING.lg,
        height: 72,
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    currencySymbol: {
        marginRight: 8,
        marginTop: 4,
    },
    priceInput: {
        flex: 1,
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.background.slate[900],
        padding: 0,
    },
    aiCard: {
        backgroundColor: `${COLORS.primary}08`,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: `${COLORS.primary}1A`,
        padding: SPACING.xl,
        marginBottom: SPACING.xl,
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
        backgroundColor: `${COLORS.primary}0D`,
        borderRadius: 4,
    },
    aiRange: {
        marginBottom: 4,
    },
    aiDesc: {
        lineHeight: 16,
        width: '85%',
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
        backgroundColor: `${COLORS.primary}20`,
        borderRadius: 2,
        overflow: 'hidden',
    },
    confidenceFill: {
        height: '100%',
        backgroundColor: COLORS.primary,
        borderRadius: 2,
    },
    applyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 4,
    },
    footer: {
        padding: SPACING.xl,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.background.slate[100],
    },
    footerButtons: {
        flexDirection: 'row',
        gap: SPACING.md,
    },
    backCta: {
        flex: 1,
    },
    nextCta: {
        flex: 2,
    },
});
