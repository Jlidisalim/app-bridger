import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { ArrowLeft, History, Clock, Check, RefreshCcw, Lock, Mail, ShieldCheck } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { authAPI } from '../services/api';

interface KYCStatusScreenProps {
    onReturn: () => void;
    onBack: () => void;
}

export const KYCStatusScreen: React.FC<KYCStatusScreenProps> = ({ onReturn, onBack }) => {
    const { kycDocumentFront, kycDocumentBack, kycSelfie, kycStatus, setKYCStatus } = useAppStore();
    const [isApproved, setIsApproved] = useState(false);

    // Poll backend for KYC status instead of auto-approving
    useEffect(() => {
        if (kycDocumentFront && kycDocumentBack && kycSelfie) {
            const pollStatus = async () => {
                try {
                    const result = await authAPI.getKYCStatus();
                    if (result.status === 'approved') {
                        setIsApproved(true);
                        setKYCStatus('approved');
                    }
                } catch {
                    // Will retry on next interval
                }
            };
            pollStatus();
            const interval = setInterval(pollStatus, 5000);
            return () => clearInterval(interval);
        }
    }, [kycDocumentFront, kycDocumentBack, kycSelfie]);

    const steps = isApproved
        ? [
            { title: 'Documents Uploaded', status: 'completed', subtitle: 'Completed successfully' },
            { title: 'Selfie Verified', status: 'completed', subtitle: 'Face matching completed' },
            { title: 'Verified', status: 'completed', subtitle: 'Your account is verified!' },
        ]
        : [
            { title: 'Documents Uploaded', status: 'completed', subtitle: 'Completed successfully on ' + new Date().toLocaleDateString() },
            { title: 'Under Review', status: 'active', subtitle: 'In Progress - Verifying your identity' },
            { title: 'Final Approval', status: 'pending', subtitle: 'Awaiting verification completion' },
        ];

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.primary} size={24} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold" style={styles.headerTitle}>
                    Verification Status
                </Typography>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Hero Section */}
                <View style={styles.heroSection}>
                    <View style={styles.iconContainer}>
                        <View style={[styles.mainIconCircle, isApproved && styles.mainIconCircleApproved]}>
                            {isApproved ? (
                                <ShieldCheck color={COLORS.white} size={72} />
                            ) : (
                                <History color={COLORS.primary} size={72} />
                            )}
                            {!isApproved && <View style={styles.pulseRing} />}
                        </View>
                        {isApproved ? (
                            <View style={[styles.badgeIcon, styles.badgeIconApproved]}>
                                <Check color={COLORS.white} size={32} />
                            </View>
                        ) : (
                            <View style={styles.badgeIcon}>
                                <Clock color="#f59e0b" size={32} />
                            </View>
                        )}
                    </View>

                    <View style={styles.heroText}>
                        <Typography size="2xl" weight="bold">
                            {isApproved ? 'Verification Complete!' : 'Verifying Your Identity'}
                        </Typography>
                        <Typography size="base" color={COLORS.background.slate[600]} align="center">
                            {isApproved
                                ? 'Congratulations! Your identity has been verified successfully. You now have full access to all features.'
                                : 'We\'re currently verifying your documents and selfie. This should only take a moment.'}
                        </Typography>

                        {!isApproved && (
                            <View style={styles.timeBadge}>
                                <Typography size="sm" weight="medium" color="#b45309">
                                    Verifying... {Math.round((Date.now() % 100))}%
                                </Typography>
                            </View>
                        )}
                    </View>
                </View>

                {/* Document Preview (if verified) */}
                {isApproved && (
                    <View style={styles.documentsPreview}>
                        <Typography size="sm" weight="bold" style={styles.previewTitle}>
                            Documents Submitted
                        </Typography>
                        <View style={styles.previewRow}>
                            <View style={styles.previewItem}>
                                <Check size={16} color={COLORS.success} />
                                <Typography size="xs" style={{ marginLeft: 4 }}>ID Front</Typography>
                            </View>
                            <View style={styles.previewItem}>
                                <Check size={16} color={COLORS.success} />
                                <Typography size="xs" style={{ marginLeft: 4 }}>ID Back</Typography>
                            </View>
                            <View style={styles.previewItem}>
                                <Check size={16} color={COLORS.success} />
                                <Typography size="xs" style={{ marginLeft: 4 }}>Selfie</Typography>
                            </View>
                        </View>
                    </View>
                )}

                {/* Timeline */}
                <View style={styles.timeline}>
                    {steps.map((step, index) => {
                        const isCompleted = step.status === 'completed';
                        const isActive = step.status === 'active';

                        return (
                            <View key={index} style={styles.timelineItem}>
                                <View style={styles.timelineLeft}>
                                    <View style={[
                                        styles.dot,
                                        isCompleted && styles.dotCompleted,
                                        isActive && styles.dotActive,
                                    ]}>
                                        {isCompleted && <Check color={COLORS.white} size={18} />}
                                        {isActive && <RefreshCcw color={COLORS.primary} size={18} />}
                                        {!isCompleted && !isActive && <Lock color={COLORS.background.slate[300]} size={18} />}
                                    </View>
                                    {index < steps.length - 1 && (
                                        <View style={[styles.line, isCompleted && styles.lineCompleted]} />
                                    )}
                                </View>
                                <View style={styles.timelineRight}>
                                    <Typography 
                                        weight="bold" 
                                        color={!isCompleted && !isActive ? COLORS.background.slate[400] : undefined}
                                    >
                                        {step.title}
                                    </Typography>
                                    <Typography 
                                        size="sm" 
                                        color={isActive ? COLORS.primary : COLORS.background.slate[400]} 
                                        weight={isActive ? "medium" : "regular"}
                                    >
                                        {step.subtitle}
                                    </Typography>
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* Info Card */}
                <View style={styles.infoCard}>
                    <View style={styles.infoIconBox}>
                        <Mail color={COLORS.primary} size={20} />
                    </View>
                    <View style={styles.infoContent}>
                        <Typography size="sm" weight="bold">
                            {isApproved ? 'Welcome to Bridger!' : 'Next Steps'}
                        </Typography>
                        <Typography size="xs" color={COLORS.background.slate[600]} style={styles.infoSubtext}>
                            {isApproved
                                ? 'Your account is fully verified. You can now send packages and become a traveler!'
                                : 'You\'ll receive an email notification once your account is verified. No further action is required.'}
                        </Typography>
                    </View>
                </View>

                {/* Actions */}
                <View style={styles.actions}>
                    <Button 
                        label={isApproved ? "Get Started" : "Return to Home"} 
                        onPress={onReturn} 
                    />
                    <TouchableOpacity style={styles.supportButton}>
                        <Typography size="sm" weight="semibold" color={COLORS.background.slate[600]}>
                            Contact Support
                        </Typography>
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomSpacer} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.light,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: SPACING.md,
        backgroundColor: COLORS.background.light,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.background.slate[100],
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
        flexGrow: 1,
    },
    heroSection: {
        padding: SPACING.xxl,
        alignItems: 'center',
    },
    iconContainer: {
        marginBottom: SPACING.xl,
        position: 'relative',
    },
    mainIconCircle: {
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: `${COLORS.primary}1A`,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainIconCircleApproved: {
        backgroundColor: COLORS.success,
    },
    pulseRing: {
        position: 'absolute',
        inset: 0,
        borderRadius: 80,
        borderWidth: 4,
        borderColor: `${COLORS.primary}33`,
    },
    badgeIcon: {
        position: 'absolute',
        bottom: -8,
        right: -8,
        backgroundColor: COLORS.white,
        padding: 8,
        borderRadius: 40,
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    badgeIconApproved: {
        backgroundColor: COLORS.success,
    },
    heroText: {
        alignItems: 'center',
        gap: 12,
    },
    timeBadge: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        backgroundColor: '#fffbeb',
        borderRadius: RADIUS.full,
        borderWidth: 1,
        borderColor: '#fef3c7',
        marginTop: 8,
    },
    documentsPreview: {
        margin: SPACING.xl,
        marginTop: 0,
        padding: SPACING.lg,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
    },
    previewTitle: {
        marginBottom: SPACING.md,
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    previewItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    timeline: {
        paddingHorizontal: SPACING.xl,
        paddingVertical: SPACING.lg,
    },
    timelineItem: {
        flexDirection: 'row',
        minHeight: 80,
    },
    timelineLeft: {
        alignItems: 'center',
        width: 40,
    },
    dot: {
        width: 32,
        height: 32,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: COLORS.background.slate[200],
        backgroundColor: COLORS.white,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    dotCompleted: {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
    },
    dotActive: {
        backgroundColor: `${COLORS.primary}1A`,
        borderColor: COLORS.primary,
    },
    line: {
        width: 2,
        flex: 1,
        backgroundColor: COLORS.background.slate[200],
        marginVertical: 4,
    },
    lineCompleted: {
        backgroundColor: COLORS.primary,
    },
    timelineRight: {
        flex: 1,
        paddingLeft: SPACING.md,
        paddingTop: 4,
    },
    infoCard: {
        margin: SPACING.xl,
        marginTop: 0,
        padding: SPACING.lg,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
        flexDirection: 'row',
        gap: 12,
    },
    infoIconBox: {
        marginTop: 2,
    },
    infoContent: {
        flex: 1,
    },
    infoSubtext: {
        marginTop: 4,
        lineHeight: 16,
    },
    actions: {
        padding: SPACING.xl,
        gap: SPACING.md,
    },
    supportButton: {
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        borderRadius: RADIUS.lg,
    },
    bottomSpacer: {
        height: 40,
    },
});
