import React from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { CheckCircle2, PartyPopper, ArrowRight } from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface SuccessScreenProps {
    onDone: () => void;
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({ onDone }) => {
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <View style={styles.pulseContainer}>
                        <View style={[styles.pulse, { transform: [{ scale: 1.2 }], opacity: 0.1 }]} />
                        <View style={[styles.pulse, { transform: [{ scale: 1.5 }], opacity: 0.05 }]} />
                    </View>
                    <View style={styles.mainIcon}>
                        <CheckCircle2 color={COLORS.white} size={64} strokeWidth={2.5} />
                    </View>
                    <View style={styles.partyBox}>
                        <PartyPopper color={COLORS.primary} size={32} />
                    </View>
                </View>

                <Typography size="3xl" weight="bold" align="center" style={styles.title}>
                    Shipment Published!
                </Typography>

                <Typography size="base" color={COLORS.background.slate[500]} align="center" style={styles.subtitle}>
                    Your shipment is now live and verified carriers on your route can see it. We'll notify you when someone makes an offer.
                </Typography>

                <View style={styles.summaryCard}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} uppercase tracking={1} style={styles.summaryLabel}>
                        Route Summary
                    </Typography>
                    <View style={styles.summaryRow}>
                        <Typography weight="bold">London</Typography>
                        <ArrowRight color={COLORS.primary} size={14} />
                        <Typography weight="bold">New York</Typography>
                    </View>
                    <Typography size="xs" color={COLORS.background.slate[500]} style={styles.summaryDate}>Oct 24 • James Wilson</Typography>
                </View>
            </View>

            <View style={styles.footer}>
                <Button label="Go to Home" onPress={onDone} />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.white,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.xxl,
    },
    iconContainer: {
        marginBottom: 40,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainIcon: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 10,
        zIndex: 2,
    },
    pulseContainer: {
        position: 'absolute',
        zIndex: 1,
    },
    pulse: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: COLORS.primary,
        alignSelf: 'center',
    },
    partyBox: {
        position: 'absolute',
        top: -10,
        right: -10,
        backgroundColor: COLORS.white,
        padding: 8,
        borderRadius: 20,
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        zIndex: 3,
    },
    title: {
        marginBottom: SPACING.md,
    },
    subtitle: {
        lineHeight: 24,
        marginBottom: 40,
    },
    summaryCard: {
        width: width * 0.8,
        padding: SPACING.xl,
        backgroundColor: COLORS.background.light,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
        alignItems: 'center',
    },
    summaryLabel: {
        marginBottom: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    summaryDate: {
        marginTop: 4,
    },
    footer: {
        padding: SPACING.xl,
        paddingBottom: 40,
    },
});
