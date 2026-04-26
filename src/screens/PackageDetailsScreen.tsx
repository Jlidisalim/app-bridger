import React, { useState, useRef } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    TextInput,
    PanResponder,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { StepIndicator } from '../components/StepIndicator';
import {
    ArrowLeft,
    FileText,
    Smartphone,
    Box,
    Gift,
    Camera as CameraIcon,
    X,
    Plus,
    AlertTriangle,
    DollarSign,
    Check,
    Layers,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { PackageCategory, PackageSize } from '../types';

interface PackageDetailsScreenProps {
    onNext: (details: any) => void;
    onBack: () => void;
}

const PACKAGE_SIZES: { id: PackageSize; label: string; short: string; desc: string }[] = [
    { id: 'SMALL',       label: 'Small',       short: 'S',  desc: '≤ 0.5 kg' },
    { id: 'MEDIUM',      label: 'Medium',      short: 'M',  desc: '0.5–2 kg'  },
    { id: 'LARGE',       label: 'Large',       short: 'L',  desc: '2–5 kg'    },
    { id: 'EXTRA_LARGE', label: 'Extra Large', short: 'XL', desc: '5+ kg'     },
];

export const PackageDetailsScreen: React.FC<PackageDetailsScreenProps> = ({ onNext, onBack }) => {
    const senderPackage = useAppStore((s) => s.senderPackage);
    const [category, setCategory] = useState<PackageCategory>(senderPackage?.category || 'Documents');
    const [weight, setWeight] = useState(senderPackage?.weight || 0.45);
    const [packageSize, setPackageSize] = useState<PackageSize>(senderPackage?.packageSize || 'SMALL');
    const [isFragile, setIsFragile] = useState<boolean>(senderPackage?.isFragile ?? false);
    const [itemValue, setItemValue] = useState<string>(
        senderPackage?.itemValue != null ? String(senderPackage.itemValue) : ''
    );
    const [images, setImages] = useState<string[]>(
        senderPackage?.images && senderPackage.images.length > 0
            ? senderPackage.images
            : senderPackage?.image
            ? [senderPackage.image]
            : [],
    );
    const MAX_IMAGES = 5;

    const sliderRef = useRef<View>(null);
    const sliderWidth = useRef(0);
    const sliderX = useRef(0);

    const updateWeight = (pageX: number) => {
        if (sliderWidth.current === 0) return;
        const relativeX = pageX - sliderX.current;
        const ratio = Math.max(0, Math.min(1, relativeX / sliderWidth.current));
        const newWeight = Math.round((0.1 + ratio * 0.9) * 100) / 100;
        setWeight(newWeight);
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => updateWeight(evt.nativeEvent.pageX),
            onPanResponderMove: (evt) => updateWeight(evt.nativeEvent.pageX),
        })
    ).current;

    const onSliderLayout = () => {
        sliderRef.current?.measureInWindow((x, _y, w) => {
            sliderX.current = x;
            sliderWidth.current = w;
        });
    };

    const pickImages = async () => {
        const remaining = MAX_IMAGES - images.length;
        if (remaining <= 0) return;
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'] as ImagePicker.MediaType[],
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            quality: 0.8,
            base64: true,
        });

        if (!result.canceled && result.assets?.length) {
            const picked = result.assets
                .map((a) => {
                    if (a.base64) {
                        const mime = a.type || 'image/jpeg';
                        return `data:${mime};base64,${a.base64}`;
                    }
                    return a.uri;
                })
                .filter((uri): uri is string => !!uri);
            setImages((prev) => [...prev, ...picked].slice(0, MAX_IMAGES));
        }
    };

    const removeImage = (uri: string) => {
        setImages((prev) => prev.filter((u) => u !== uri));
    };

    const categories: { id: PackageCategory; icon: any; color: string }[] = [
        { id: 'Documents',    icon: FileText,    color: '#3B82F6' },
        { id: 'Electronics',  icon: Smartphone,  color: '#8B5CF6' },
        { id: 'Small Parcel', icon: Box,         color: '#F59E0B' },
        { id: 'Gift',         icon: Gift,        color: '#EC4899' },
    ];

    const parsedItemValue = itemValue.trim() !== '' ? parseFloat(itemValue) : undefined;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                    </TouchableOpacity>
                    <Typography size="lg" weight="bold" style={styles.headerTitle}>
                        Package Details
                    </Typography>
                </View>
                <StepIndicator currentStep={2} totalSteps={5} label="Package Info" />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* ── Category Selection ─────────────────────────────── */}
                <View style={styles.section}>
                    <Typography weight="bold" style={styles.sectionTitle}>Package Category</Typography>
                    <View style={styles.categoryGrid}>
                        {categories.map((item) => {
                            const isSelected = category === item.id;
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    activeOpacity={0.8}
                                    onPress={() => setCategory(item.id)}
                                    style={[
                                        styles.categoryCard,
                                        isSelected && { backgroundColor: item.color, borderColor: item.color },
                                    ]}
                                >
                                    {/* checkmark badge */}
                                    {isSelected && (
                                        <View style={styles.checkBadge}>
                                            <Check color={COLORS.white} size={10} strokeWidth={3} />
                                        </View>
                                    )}
                                    <View style={[
                                        styles.categoryIconCircle,
                                        isSelected && { backgroundColor: 'rgba(255,255,255,0.2)' },
                                        !isSelected && { backgroundColor: item.color + '18' },
                                    ]}>
                                        <item.icon
                                            color={isSelected ? COLORS.white : item.color}
                                            size={28}
                                        />
                                    </View>
                                    <Typography
                                        size="sm"
                                        weight="bold"
                                        color={isSelected ? COLORS.white : COLORS.background.slate[700]}
                                    >
                                        {item.id}
                                    </Typography>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* ── Package Size ───────────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Typography weight="bold" style={styles.sectionTitle}>Package Size</Typography>
                        <View style={styles.sizeIconHint}>
                            <Layers color={COLORS.background.slate[400]} size={14} />
                        </View>
                    </View>
                    <View style={styles.segmentContainer}>
                        {PACKAGE_SIZES.map((size) => {
                            const isSelected = packageSize === size.id;
                            return (
                                <TouchableOpacity
                                    key={size.id}
                                    activeOpacity={0.8}
                                    onPress={() => setPackageSize(size.id)}
                                    style={[styles.segmentItem, isSelected && styles.segmentItemActive]}
                                >
                                    <Typography
                                        size="base"
                                        weight="bold"
                                        color={isSelected ? COLORS.primary : COLORS.background.slate[500]}
                                    >
                                        {size.short}
                                    </Typography>
                                    <Typography
                                        size="xs"
                                        weight={isSelected ? 'semibold' : 'medium'}
                                        color={isSelected ? COLORS.primary : COLORS.background.slate[400]}
                                    >
                                        {size.desc}
                                    </Typography>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <Typography size="xs" color={COLORS.background.slate[400]} style={styles.hintText}>
                        {PACKAGE_SIZES.find((s) => s.id === packageSize)?.label} selected
                    </Typography>
                </View>

                {/* ── Estimated Weight ───────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Typography weight="bold" style={styles.sectionTitle}>Estimated Weight</Typography>
                        <View style={styles.weightBadge}>
                            <Typography size="sm" weight="bold" color={COLORS.primary}>{weight.toFixed(2)} kg</Typography>
                        </View>
                    </View>
                    <View style={styles.sliderPlaceholder}>
                        <View
                            ref={sliderRef}
                            onLayout={onSliderLayout}
                            style={styles.sliderTrack}
                            {...panResponder.panHandlers}
                        >
                            <View style={[styles.sliderFill, { width: `${(weight - 0.1) / 0.9 * 100}%` }]} />
                            <View style={[styles.sliderThumb, { left: `${(weight - 0.1) / 0.9 * 100}%` }]} />
                        </View>
                        <View style={styles.sliderLabels}>
                            <Typography size="xs" color={COLORS.background.slate[400]}>0.1 kg</Typography>
                            <Typography size="xs" color={COLORS.background.slate[400]}>Max: 1 kg</Typography>
                        </View>
                    </View>
                    <Typography size="xs" color={COLORS.background.slate[500]} style={[styles.hintText, { fontStyle: 'italic' }]}>
                        Bridger hand-carries only small items up to 1 kg.
                    </Typography>
                </View>

                {/* ── Fragile Toggle ─────────────────────────────────── */}
                <View style={styles.section}>
                    <Typography weight="bold" style={styles.sectionTitle}>Fragile?</Typography>
                    <View style={styles.segmentContainer}>
                        {/* No */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setIsFragile(false)}
                            style={[styles.segmentItem, !isFragile && styles.segmentItemActive]}
                        >
                            <Check
                                color={!isFragile ? COLORS.primary : COLORS.background.slate[300]}
                                size={16}
                                strokeWidth={2.5}
                            />
                            <Typography
                                size="sm"
                                weight={!isFragile ? 'bold' : 'medium'}
                                color={!isFragile ? COLORS.primary : COLORS.background.slate[400]}
                            >
                                No
                            </Typography>
                        </TouchableOpacity>

                        {/* Yes */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setIsFragile(true)}
                            style={[
                                styles.segmentItem,
                                isFragile && styles.segmentItemFragile,
                            ]}
                        >
                            <AlertTriangle
                                color={isFragile ? COLORS.error : COLORS.background.slate[300]}
                                size={16}
                                strokeWidth={2.5}
                            />
                            <Typography
                                size="sm"
                                weight={isFragile ? 'bold' : 'medium'}
                                color={isFragile ? COLORS.error : COLORS.background.slate[400]}
                            >
                                Yes — Handle with care
                            </Typography>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Declared Value ─────────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Typography weight="bold" style={styles.sectionTitle}>Declared Value</Typography>
                        <View style={styles.optionalBadge}>
                            <Typography size="xs" weight="medium" color={COLORS.background.slate[500]}>Optional</Typography>
                        </View>
                    </View>
                    <View style={styles.inputRow}>
                        <View style={styles.inputIconBox}>
                            <DollarSign color={COLORS.primary} size={18} />
                        </View>
                        <TextInput
                            style={styles.valueInput}
                            placeholder="e.g. 150"
                            placeholderTextColor={COLORS.background.slate[300]}
                            keyboardType="decimal-pad"
                            value={itemValue}
                            onChangeText={setItemValue}
                        />
                        {itemValue.trim() !== '' && (
                            <TouchableOpacity
                                style={styles.clearInput}
                                onPress={() => setItemValue('')}
                            >
                                <X color={COLORS.background.slate[400]} size={14} />
                            </TouchableOpacity>
                        )}
                    </View>
                    <Typography size="xs" color={COLORS.background.slate[400]} style={styles.hintText}>
                        For insurance purposes. Leave blank if not required.
                    </Typography>
                </View>

                {/* ── Photo Upload ───────────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Typography weight="bold" style={styles.sectionTitle}>Upload Photos</Typography>
                            <View style={styles.requiredBadge}>
                                <Typography size="xs" weight="bold" color="#fff">Required</Typography>
                            </View>
                        </View>
                        <View style={styles.countBadge}>
                            <Typography size="xs" weight="bold" color={images.length === 0 ? COLORS.error : COLORS.background.slate[500]}>
                                {images.length}/{MAX_IMAGES}
                            </Typography>
                        </View>
                    </View>
                    {images.length === 0 ? (
                        <TouchableOpacity style={[styles.uploadCard, styles.uploadCardRequired]} activeOpacity={0.7} onPress={pickImages}>
                            <View style={styles.uploadIconCircle}>
                                <CameraIcon color={COLORS.primary} size={26} />
                            </View>
                            <Typography weight="semibold" color={COLORS.background.slate[800]}>
                                Add package photos
                            </Typography>
                            <Typography size="xs" color={COLORS.background.slate[400]}>
                                Up to {MAX_IMAGES} images — JPEG, PNG
                            </Typography>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.thumbGrid}>
                            {images.map((uri) => (
                                <View key={uri} style={styles.thumbWrap}>
                                    <Image source={{ uri }} style={styles.thumb} />
                                    <TouchableOpacity
                                        style={styles.thumbRemove}
                                        onPress={() => removeImage(uri)}
                                    >
                                        <X color={COLORS.white} size={12} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                            {images.length < MAX_IMAGES && (
                                <TouchableOpacity style={styles.thumbAdd} activeOpacity={0.7} onPress={pickImages}>
                                    <Plus color={COLORS.primary} size={26} />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <View style={styles.footerButtons}>
                    <Button label="Back" variant="outline" onPress={onBack} style={styles.backCta} />
                    <Button
                        label="Next Step"
                        onPress={() => {
                            if (images.length === 0) {
                                Alert.alert(
                                    'Photo required',
                                    'Please add at least one photo of your package before continuing.'
                                );
                                return;
                            }
                            onNext({ category, weight, packageSize, isFragile, itemValue: parsedItemValue, images });
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
        paddingBottom: SPACING['3xl'],
    },
    section: {
        marginBottom: SPACING.xxl,
    },
    sectionTitle: {
        marginBottom: SPACING.lg,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.lg,
    },

    // ── Category cards ───────────────────────────────────────────
    categoryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.md,
    },
    categoryCard: {
        width: '47%',
        paddingVertical: 22,
        backgroundColor: COLORS.white,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: COLORS.background.slate[100],
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        position: 'relative',
        // Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
    },
    categoryIconCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Segmented control (shared by size + fragile) ─────────────
    segmentContainer: {
        flexDirection: 'row',
        backgroundColor: COLORS.background.slate[100],
        borderRadius: 14,
        padding: 4,
        gap: 4,
    },
    segmentItem: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 6,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },
    segmentItemActive: {
        backgroundColor: COLORS.white,
        // shadow to lift the active tab
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    segmentItemFragile: {
        backgroundColor: '#FFF5F5',
        shadowColor: COLORS.error,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 4,
        elevation: 2,
    },
    sizeIconHint: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: COLORS.background.slate[100],
        alignItems: 'center',
        justifyContent: 'center',
    },
    hintText: {
        marginTop: SPACING.sm,
    },

    // ── Weight slider ────────────────────────────────────────────
    weightBadge: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        backgroundColor: `${COLORS.primary}15`,
        borderRadius: RADIUS.full,
    },
    sliderPlaceholder: {
        paddingVertical: SPACING.sm,
    },
    sliderTrack: {
        height: 6,
        backgroundColor: COLORS.background.slate[200],
        borderRadius: 3,
        position: 'relative',
        marginVertical: 20,
    },
    sliderFill: {
        height: '100%',
        backgroundColor: COLORS.primary,
        borderRadius: 3,
    },
    sliderThumb: {
        position: 'absolute',
        top: -11,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: COLORS.white,
        borderWidth: 2.5,
        borderColor: COLORS.primary,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 4,
        marginLeft: -14,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },

    // ── Declared value input ─────────────────────────────────────
    optionalBadge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: COLORS.background.slate[100],
        borderRadius: RADIUS.full,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: COLORS.background.slate[200],
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    inputIconBox: {
        width: 48,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${COLORS.primary}0D`,
        borderRightWidth: 1,
        borderRightColor: COLORS.background.slate[100],
    },
    valueInput: {
        flex: 1,
        paddingHorizontal: SPACING.md,
        paddingVertical: 14,
        fontSize: 15,
        color: COLORS.background.slate[900],
    },
    clearInput: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 6,
        borderRadius: 18,
        backgroundColor: COLORS.background.slate[100],
    },

    // ── Photo upload ─────────────────────────────────────────────
    countBadge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: COLORS.background.slate[100],
        borderRadius: RADIUS.full,
    },
    uploadCard: {
        height: 160,
        backgroundColor: COLORS.white,
        borderRadius: 20,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: `${COLORS.primary}40`,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    uploadCardRequired: {
        borderColor: `${COLORS.error}60`,
        backgroundColor: '#fff5f5',
    },
    requiredBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: COLORS.error,
        borderRadius: 6,
    },
    uploadIconCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: `${COLORS.primary}12`,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 2,
    },
    thumbGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.sm,
    },
    thumbWrap: {
        width: 92,
        height: 92,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: COLORS.background.slate[100],
        position: 'relative',
    },
    thumb: {
        width: '100%',
        height: '100%',
    },
    thumbRemove: {
        position: 'absolute',
        top: 5,
        right: 5,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    thumbAdd: {
        width: 92,
        height: 92,
        borderRadius: 14,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: `${COLORS.primary}60`,
        backgroundColor: `${COLORS.primary}08`,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Footer ───────────────────────────────────────────────────
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
