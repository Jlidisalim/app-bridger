import React, { useState, useRef } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    PanResponder,
    Platform,
    TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { ArrowLeft, ArrowRight, FileText, Package, Lock } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';

interface CapacityScreenProps {
    onNext: (capacity: any) => void;
    onBack: () => void;
}

export const CapacityScreen: React.FC<CapacityScreenProps> = ({ onNext, onBack }) => {
    const travelerCapacity = useAppStore((s) => s.travelerCapacity);
    const travelerPackageTypes = useAppStore((s) => s.travelerPackageTypes);
    const travelerDescription = useAppStore((s) => s.travelerDescription);
    const [selectedType, setSelectedType] = useState<'documents' | 'parcels'>(
        travelerPackageTypes.includes('Documents') ? 'documents' : travelerPackageTypes.includes('Small Parcel') ? 'parcels' : 'documents'
    );
    const minWeight = 0.1;
    const maxWeight = 1.0;
    const initialWeight = Math.min(maxWeight, Math.max(minWeight, travelerCapacity || 0.5));
    const [weight, setWeight] = useState(initialWeight);
    const [description, setDescription] = useState(travelerDescription || '');
    const percentage = Math.max(0, Math.min(100, ((weight - minWeight) / (maxWeight - minWeight)) * 100));
    const sliderRef = useRef<View>(null);
    const sliderWidth = useRef(0);
    const sliderX = useRef(0);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                updateWeight(evt.nativeEvent.pageX);
            },
            onPanResponderMove: (evt) => {
                updateWeight(evt.nativeEvent.pageX);
            },
        })
    ).current;

    const updateWeight = (pageX: number) => {
        if (sliderWidth.current === 0) return;
        const relativeX = pageX - sliderX.current;
        const ratio = Math.max(0, Math.min(1, relativeX / sliderWidth.current));
        const newWeight = Math.round((minWeight + ratio * (maxWeight - minWeight)) * 10) / 10;
        setWeight(newWeight);
    };

    const onSliderLayout = () => {
        sliderRef.current?.measureInWindow((x, _y, w) => {
            sliderX.current = x;
            sliderWidth.current = w;
        });
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold" style={styles.headerTitle}>
                    Traveler Profile
                </Typography>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Step Info */}
                <View style={styles.stepInfoContainer}>
                    <View style={styles.stepHeaderRow}>
                        <Typography size="xs" weight="bold" color="#1E3B8A" style={{ letterSpacing: 1 }}>
                            Step 3 of 5
                        </Typography>
                        <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={{ letterSpacing: 1 }}>
                            CAPACITY
                        </Typography>
                    </View>

                    {/* Progress Bar */}
                    <View style={styles.progressBarContainer}>
                        <View style={[styles.progressBarFill, { width: '60%' }]} />
                    </View>
                </View>

                {/* Title Section */}
                <View style={styles.titleSection}>
                    <Typography size="3xl" weight="bold" color="#0F172A" style={{ lineHeight: 40 }}>
                        Luggage Capacity
                    </Typography>
                    <Typography size="md" color={COLORS.background.slate[600]} style={{ marginTop: 12, lineHeight: 24 }}>
                        How much weight can you carry? Remember, Bridger only allows items under 1kg.
                    </Typography>
                </View>

                {/* Slider Card */}
                <View style={styles.sliderCard}>
                    <View style={styles.sliderHeader}>
                        <Typography size="base" weight="bold" color="#0F172A">
                            Max Weight Capacity
                        </Typography>
                        <View style={styles.weightPill}>
                            <Typography size="sm" weight="bold" color="#1E3B8A">
                                {weight.toFixed(1)} kg
                            </Typography>
                        </View>
                    </View>

                    <View
                        ref={sliderRef}
                        onLayout={onSliderLayout}
                        style={styles.sliderContainer}
                        {...panResponder.panHandlers}
                    >
                        <View style={styles.sliderTrackBg} />
                        <View style={[styles.sliderTrackFill, { width: `${percentage}%` }]} />
                        <View style={[styles.sliderThumb, { left: `${percentage}%` }]} />
                    </View>

                    <View style={styles.sliderLabels}>
                        <Typography size="sm" color={COLORS.background.slate[400]}>0.1kg</Typography>
                        <Typography size="sm" color={COLORS.background.slate[400]}>0.5kg</Typography>
                        <Typography size="sm" color={COLORS.background.slate[400]}>1.0kg</Typography>
                    </View>
                </View>

                {/* Item Types Row */}
                <View style={styles.typesRow}>
                    <TouchableOpacity
                        style={[
                            styles.typeCard,
                            selectedType === 'documents' && styles.typeCardSelected
                        ]}
                        onPress={() => setSelectedType('documents')}
                    >
                        <FileText
                            color={selectedType === 'documents' ? '#1E3B8A' : COLORS.background.slate[400]}
                            size={28}
                            style={styles.typeIcon}
                            fill={selectedType === 'documents' ? '#1E3B8A' : 'transparent'}
                        />
                        <Typography size="sm" weight="bold" color="#0F172A">Documents</Typography>
                        <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 4 }}>
                            Up to 0.2kg
                        </Typography>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.typeCard,
                            selectedType === 'parcels' && styles.typeCardSelected
                        ]}
                        onPress={() => setSelectedType('parcels')}
                    >
                        <Package
                            color={selectedType === 'parcels' ? '#1E3B8A' : COLORS.background.slate[400]}
                            size={28}
                            style={styles.typeIcon}
                            fill={selectedType === 'parcels' ? '#1E3B8A' : 'transparent'}
                        />
                        <Typography size="sm" weight="bold" color="#0F172A">Small Parcels</Typography>
                        <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginTop: 4 }}>
                            Up to 1.0kg
                        </Typography>
                    </TouchableOpacity>
                </View>

                {/* Description Card */}
                <View style={styles.descriptionCard}>
                    <Typography size="base" weight="bold" color="#0F172A" style={{ marginBottom: 6 }}>
                        Traveler Note (optional)
                    </Typography>
                    <Typography size="xs" color={COLORS.background.slate[500]} style={{ marginBottom: 12, lineHeight: 16 }}>
                        Add a short description for senders (e.g. preferred items, packing rules, timing).
                    </Typography>
                    <TextInput
                        style={styles.descriptionInput}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="e.g. Small fragile items only, no liquids."
                        placeholderTextColor={COLORS.background.slate[400]}
                        multiline
                        maxLength={200}
                        textAlignVertical="top"
                    />
                    <Typography size="xs" color={COLORS.background.slate[400]} style={{ alignSelf: 'flex-end', marginTop: 4 }}>
                        {description.length}/200
                    </Typography>
                </View>

                {/* Warning Box */}
                <View style={styles.warningBox}>
                    <View style={styles.warningIcon}>
                        <Lock color="#B45309" size={16} fill="#B45309" stroke="#FEF3C7" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Typography size="sm" weight="bold" color="#92400E">
                            Security & Restrictions
                        </Typography>
                        <Typography size="xs" color="#92400E" style={{ marginTop: 6, lineHeight: 18 }}>
                            All items are scanned by Bridger. You are responsible for knowing local customs regulations. Never accept sealed packages you haven't inspected.
                        </Typography>
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
                        label="Continue"
                        onPress={() => onNext({ weight, type: selectedType, description: description.trim() })}
                        style={styles.nextCta}
                        icon={<ArrowRight color={COLORS.white} size={20} />}
                        iconPosition="right"
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
    sliderCard: {
        backgroundColor: COLORS.white,
        marginHorizontal: SPACING.xl,
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
        marginBottom: SPACING.lg,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 1,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
    },
    weightPill: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    sliderContainer: {
        position: 'relative',
        height: 24,
        justifyContent: 'center',
    },
    sliderTrackBg: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 8,
        backgroundColor: '#E2E8F0',
        borderRadius: 4,
    },
    sliderTrackFill: {
        position: 'absolute',
        left: 0,
        height: 8,
        backgroundColor: '#1E3B8A',
        borderRadius: 4,
        zIndex: 1,
    },
    sliderThumb: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: COLORS.white,
        borderWidth: 3,
        borderColor: '#1E3B8A',
        marginLeft: -12,
        zIndex: 2,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 16,
    },
    typesRow: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.xl,
        gap: 16,
        marginBottom: SPACING.xl,
    },
    typeCard: {
        flex: 1,
        backgroundColor: COLORS.white,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 1,
    },
    typeCardSelected: {
        borderColor: '#1E3B8A',
        borderWidth: 1.5,
    },
    typeIcon: {
        marginBottom: 16,
    },
    descriptionCard: {
        backgroundColor: COLORS.white,
        marginHorizontal: SPACING.xl,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
        marginBottom: SPACING.xl,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 8,
        elevation: 1,
    },
    descriptionInput: {
        minHeight: 80,
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        color: '#0F172A',
    },
    warningBox: {
        flexDirection: 'row',
        marginHorizontal: SPACING.xl,
        backgroundColor: '#FFFBEB',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    warningIcon: {
        marginTop: 2,
        marginRight: 12,
    },
    footer: {
        padding: SPACING.xl,
        backgroundColor: '#F8FAFC',
        paddingBottom: Platform.OS === 'ios' ? 40 : SPACING.xl,
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
