import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    ImageBackground,
    KeyboardAvoidingView,
    Platform,
    Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { ArrowLeft, ArrowRight, PlaneTakeoff, PlaneLanding, ArrowDownUp, Globe2, X, Link, MapPin } from 'lucide-react-native';
import { TextInput } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { searchAirports, Airport } from '../utils/airports';

interface TravelerRouteScreenProps {
    onNext: (route: any) => void;
    onBack: () => void;
}

export const TravelerRouteScreen: React.FC<TravelerRouteScreenProps> = ({ onNext, onBack }) => {
    const travelerRoute = useAppStore((s) => s.travelerRoute);
    const [from, setFrom] = useState(travelerRoute?.from || '');
    const [to, setTo] = useState(travelerRoute?.to || '');
    const [activeField, setActiveField] = useState<'from' | 'to' | null>(null);

    const fromSuggestions = activeField === 'from' ? searchAirports(from) : [];
    const toSuggestions = activeField === 'to' ? searchAirports(to) : [];

    const formatAirport = (a: Airport) => `${a.code} — ${a.city}, ${a.country}`;

    const handleSelectAirport = (a: Airport, field: 'from' | 'to') => {
        const value = formatAirport(a);
        if (field === 'from') setFrom(value);
        else setTo(value);
        setActiveField(null);
    };

    const handleSwap = () => {
        const temp = from;
        setFrom(to);
        setTo(temp);
    };

    const handlePopularRoute = (fromCity: string, toCity: string) => {
        setFrom(fromCity);
        setTo(toCity);
        setActiveField(null);
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.logoContainer}>
                    <View style={styles.logoCircle}>
                        <Link color={COLORS.white} size={18} />
                    </View>
                    <Typography size="lg" weight="bold" color="#1E3B8A" style={{ marginLeft: 8 }}>
                        Bridger
                    </Typography>
                </View>
                <TouchableOpacity onPress={onBack}>
                    <X color={COLORS.background.slate[500]} size={24} />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                    {/* Background SVG simulation */}
                    <View style={styles.mapBackground}>
                        <Globe2 color="#E2E8F0" size={400} strokeWidth={0.5} style={styles.globeIcon} />
                    </View>

                    {/* Step Info */}
                    <View style={styles.stepInfoContainer}>
                        <Typography size="xs" weight="bold" color="#1E3B8A" style={{ letterSpacing: 1, marginBottom: 4 }}>
                            TRAVELER FLOW
                        </Typography>
                        <View style={styles.stepHeaderRow}>
                            <Typography weight="bold" size="md">Step 1: Route Selection</Typography>
                            <Typography size="sm" color={COLORS.background.slate[500]}>1 of 5</Typography>
                        </View>

                        {/* Progress Bar */}
                        <View style={styles.progressBarContainer}>
                            <View style={[styles.progressBarFill, { width: '20%' }]} />
                        </View>
                    </View>

                    {/* Title Section */}
                    <View style={styles.titleSection}>
                        <Typography size="3xl" weight="bold" color="#0F172A" style={{ lineHeight: 40 }}>
                            Where are you flying?
                        </Typography>
                        <Typography size="md" color={COLORS.background.slate[600]} style={{ marginTop: 12, lineHeight: 24 }}>
                            Enter your departure and arrival airports to find delivery requests on your route.
                        </Typography>
                    </View>

                    {/* Route Inputs */}
                    <View style={styles.inputsContainer}>
                        {/* Departure */}
                        <View style={styles.inputLabelRow}>
                            <Typography size="sm" weight="semibold" color="#0F172A">Departure Airport</Typography>
                        </View>
                        <View style={styles.inputWrapper}>
                            <PlaneTakeoff color={COLORS.background.slate[400]} size={24} />
                            <TextInput
                                style={styles.input}
                                placeholder="Airport, city or country"
                                placeholderTextColor={COLORS.background.slate[400]}
                                value={from}
                                onChangeText={(t) => { setFrom(t); setActiveField('from'); }}
                                onFocus={() => setActiveField('from')}
                            />
                        </View>

                        {activeField === 'from' && fromSuggestions.length > 0 && (
                            <View style={styles.suggestionsBox}>
                                {fromSuggestions.map((a) => (
                                    <TouchableOpacity
                                        key={a.code}
                                        style={styles.suggestionItem}
                                        onPress={() => handleSelectAirport(a, 'from')}
                                    >
                                        <MapPin color={COLORS.background.slate[400]} size={16} />
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Typography size="sm" weight="bold" color="#0F172A">
                                                {a.code} · {a.city}
                                            </Typography>
                                            <Typography size="xs" color={COLORS.background.slate[500]}>
                                                {a.name}, {a.country}
                                            </Typography>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {/* Swap Button */}
                        <View style={styles.swapContainer}>
                            <TouchableOpacity style={styles.swapButton} onPress={handleSwap}>
                                <ArrowDownUp color="#1E3B8A" size={20} />
                            </TouchableOpacity>
                        </View>

                        {/* Arrival */}
                        <View style={styles.inputLabelRow}>
                            <Typography size="sm" weight="semibold" color="#0F172A">Arrival Airport</Typography>
                        </View>
                        <View style={styles.inputWrapper}>
                            <PlaneLanding color={COLORS.background.slate[400]} size={24} />
                            <TextInput
                                style={styles.input}
                                placeholder="Airport, city or country"
                                placeholderTextColor={COLORS.background.slate[400]}
                                value={to}
                                onChangeText={(t) => { setTo(t); setActiveField('to'); }}
                                onFocus={() => setActiveField('to')}
                            />
                        </View>

                        {activeField === 'to' && toSuggestions.length > 0 && (
                            <View style={styles.suggestionsBox}>
                                {toSuggestions.map((a) => (
                                    <TouchableOpacity
                                        key={a.code}
                                        style={styles.suggestionItem}
                                        onPress={() => handleSelectAirport(a, 'to')}
                                    >
                                        <MapPin color={COLORS.background.slate[400]} size={16} />
                                        <View style={{ flex: 1, marginLeft: 10 }}>
                                            <Typography size="sm" weight="bold" color="#0F172A">
                                                {a.code} · {a.city}
                                            </Typography>
                                            <Typography size="xs" color={COLORS.background.slate[500]}>
                                                {a.name}, {a.country}
                                            </Typography>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Popular Routes */}
                    <View style={styles.popularSection}>
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={{ letterSpacing: 1, marginBottom: 16 }}>
                            POPULAR FOR TRAVELERS
                        </Typography>

                        <TouchableOpacity
                            style={styles.popularCard}
                            onPress={() => handlePopularRoute('LHR', 'JFK')}
                        >
                            <View style={styles.iconCircle}>
                                <Globe2 color={COLORS.background.slate[600]} size={16} />
                            </View>
                            <View>
                                <Typography weight="bold" color="#0F172A">LHR ➔ JFK</Typography>
                                <Typography size="sm" color={COLORS.background.slate[500]}>London to New York</Typography>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.popularCard}
                            onPress={() => handlePopularRoute('DXB', 'BOM')}
                        >
                            <View style={styles.iconCircle}>
                                <Globe2 color={COLORS.background.slate[600]} size={16} />
                            </View>
                            <View>
                                <Typography weight="bold" color="#0F172A">DXB ➔ BOM</Typography>
                                <Typography size="sm" color={COLORS.background.slate[500]}>Dubai to Mumbai</Typography>
                            </View>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <View style={styles.footer}>
                <Button
                    label="Continue"
                    onPress={() => {
                        if (!from.trim()) {
                            Alert.alert('Departure required', 'Please enter your departure airport or city.');
                            return;
                        }
                        if (!to.trim()) {
                            Alert.alert('Arrival required', 'Please enter your arrival airport or city.');
                            return;
                        }
                        if (from.trim().toLowerCase() === to.trim().toLowerCase()) {
                            Alert.alert('Invalid route', 'Departure and arrival cannot be the same.');
                            return;
                        }
                        onNext({ from: from.trim(), to: to.trim() });
                    }}
                    style={styles.nextCta}
                    icon={<ArrowRight color={COLORS.white} size={20} />}
                    iconPosition="right"
                />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC', // Very light slate
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACING.xl,
        paddingVertical: 16,
        backgroundColor: COLORS.white,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
        zIndex: 10,
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#1E3B8A',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 40,
        position: 'relative',
    },
    mapBackground: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.4,
    },
    globeIcon: {
        transform: [{ scale: 1.5 }, { translateY: 40 }],
    },
    stepInfoContainer: {
        paddingHorizontal: SPACING.xl,
        paddingTop: SPACING.xl,
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
        marginTop: SPACING.xxl,
        marginBottom: SPACING.xl,
    },
    inputsContainer: {
        paddingHorizontal: SPACING.xl,
        marginBottom: SPACING.xl,
    },
    inputLabelRow: {
        marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        borderRadius: 24,
        paddingHorizontal: SPACING.lg,
        height: 64,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 1,
    },
    input: {
        flex: 1,
        marginLeft: 12,
        fontSize: 16,
        fontFamily: 'Inter_400Regular',
        color: '#0F172A',
        height: '100%',
    },
    swapContainer: {
        alignItems: 'center',
        marginVertical: -16,
        zIndex: 2,
    },
    swapButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#E0E7FF', // Light indigo background
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    suggestionsBox: {
        backgroundColor: COLORS.white,
        borderRadius: 16,
        marginTop: 8,
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    suggestionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
    },
    popularSection: {
        paddingHorizontal: SPACING.xl,
        marginTop: SPACING.lg,
    },
    popularCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        padding: 16,
        borderRadius: 20,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 8,
        elevation: 1,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F1F5F9', // slate-100
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    footer: {
        padding: SPACING.xl,
        backgroundColor: '#F8FAFC',
        paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xl,
    },
    nextCta: {
        backgroundColor: '#1E3B8A',
        height: 56,
        borderRadius: 28,
    },
});
