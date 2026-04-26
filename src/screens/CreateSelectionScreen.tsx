import React from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import {
    Package,
    Plane,
    ChevronLeft,
    ArrowRight,
    Briefcase,
    ShieldCheck,
    Sparkles
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface CreateSelectionScreenProps {
    onBack: () => void;
    onSelectSender: () => void;
    onSelectTraveler: () => void;
}

export const CreateSelectionScreen: React.FC<CreateSelectionScreenProps> = ({
    onBack,
    onSelectSender,
    onSelectTraveler
}) => {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <ChevronLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold">Choose Action</Typography>
                <View style={{ width: 40 }} />
            </View>

            <View style={styles.content}>
                <View style={styles.titleSection}>
                    <Typography size="3xl" weight="bold" style={styles.title}>What would you like to do today?</Typography>
                    <Typography color={COLORS.background.slate[500]} style={styles.subtitle}>
                        Select how you want to use Bridger. You can switch roles at any time.
                    </Typography>
                </View>

                <View style={styles.optionsGrid}>
                    <TouchableOpacity style={styles.optionCard} onPress={onSelectSender}>
                        <View style={[styles.iconContainer, { backgroundColor: '#eff6ff' }]}>
                            <Package color="#2563eb" size={32} />
                        </View>
                        <View style={styles.optionInfo}>
                            <Typography size="xl" weight="bold" style={styles.optionTitle}>Send a Package</Typography>
                            <Typography size="sm" color={COLORS.background.slate[500]} style={styles.optionDesc}>
                                I have an item I need delivered to another city or country.
                            </Typography>
                        </View>
                        <View style={styles.tag}>
                            <Typography size="xs" weight="bold" color="#2563eb">SENDER</Typography>
                        </View>
                        <ArrowRight color={COLORS.background.slate[300]} size={20} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.optionCard} onPress={onSelectTraveler}>
                        <View style={[styles.iconContainer, { backgroundColor: '#f0fdf4' }]}>
                            <Plane color="#16a34a" size={32} />
                        </View>
                        <View style={styles.optionInfo}>
                            <Typography size="xl" weight="bold" style={styles.optionTitle}>Post a Trip</Typography>
                            <Typography size="sm" color={COLORS.background.slate[500]} style={styles.optionDesc}>
                                I'm traveling and have extra space in my luggage to carry items.
                            </Typography>
                        </View>
                        <View style={[styles.tag, { backgroundColor: '#f0fdf4' }]}>
                            <Typography size="xs" weight="bold" color="#16a34a">TRAVELER</Typography>
                        </View>
                        <ArrowRight color={COLORS.background.slate[300]} size={20} />
                    </TouchableOpacity>
                </View>

                <View style={styles.infoBanner}>
                    <View style={styles.infoIcon}>
                        <ShieldCheck color={COLORS.primary} size={20} />
                    </View>
                    <View style={styles.infoText}>
                        <Typography size="sm" weight="semibold">Verified & Secure</Typography>
                        <Typography size="xs" color={COLORS.background.slate[500]}>
                            All transactions are protected by Bridger Escrow and identity verification.
                        </Typography>
                    </View>
                </View>
            </View>
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
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.background.light,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        paddingHorizontal: SPACING.xl,
        paddingTop: SPACING.xl,
    },
    titleSection: {
        marginBottom: 40,
    },
    title: {
        lineHeight: 40,
        marginBottom: 12,
    },
    subtitle: {
        fontSize: 16,
        lineHeight: 24,
    },
    optionsGrid: {
        gap: SPACING.lg,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        borderRadius: RADIUS['2xl'],
        padding: 24,
        borderWidth: 1.5,
        borderColor: COLORS.background.slate[100],
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: RADIUS.xl,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 20,
    },
    optionInfo: {
        flex: 1,
    },
    optionTitle: {
        marginBottom: 4,
    },
    optionDesc: {
        lineHeight: 20,
    },
    tag: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: '#eff6ff',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    infoBanner: {
        marginTop: 'auto',
        marginBottom: 20,
        flexDirection: 'row',
        backgroundColor: `${COLORS.primary}08`,
        padding: 20,
        borderRadius: RADIUS.xl,
        alignItems: 'center',
        gap: 16,
    },
    infoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.white,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    infoText: {
        flex: 1,
        gap: 2,
    },
});
