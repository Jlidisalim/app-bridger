import React, { useState, useEffect } from 'react';
import {
    View,
    StyleSheet,
    StatusBar,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { CheckCircle2, Plane, Sparkles, Copy, Share2, QrCode, ArrowRight } from 'lucide-react-native';
import { QRCodeGenerator } from '../components/QRCodeGenerator';
import { dealsAPI } from '../services/api';
import { useAppStore } from '../store/useAppStore';
import * as Clipboard from 'expo-clipboard';

interface TravelerSuccessScreenProps {
    tripId?: string;
    onDone: () => void;
}

export const TravelerSuccessScreen: React.FC<TravelerSuccessScreenProps> = ({ tripId, onDone }) => {
    const [receiverCode, setReceiverCode] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showQR, setShowQR] = useState(false);

    const travelerRoute = useAppStore((s) => s.travelerRoute);

    useEffect(() => {
        if (tripId && !receiverCode) {
            generateCode();
        }
    }, [tripId]);

    const generateCode = async () => {
        if (!tripId || isGenerating || receiverCode) return; // single-use: skip if already generated
        setIsGenerating(true);
        try {
            const result = await dealsAPI.generateTravelerReceiverCode(tripId);
            if (result.success && result.receiverCode) {
                setReceiverCode(result.receiverCode);
            }
        } catch (err: any) {
            console.error('Failed to generate receiver code:', err);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = async () => {
        if (receiverCode) {
            await Clipboard.setStringAsync(receiverCode);
            Alert.alert('Copied!', 'Receiver code copied to clipboard.');
        }
    };

    const handleShare = async () => {
        if (receiverCode) {
            await Share.share({
                message: `Your Bridger delivery code is: ${receiverCode}\n\nShare this with the sender. They'll use it to confirm package handoff.`,
            });
        }
    };

    const qrValue = JSON.stringify({
        tripId,
        receiverCode,
        type: 'trip_confirmation',
    });

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Success Icon */}
                <View style={styles.iconContainer}>
                    <View style={styles.pulseRing} />
                    <View style={styles.mainIcon}>
                        <Plane color={COLORS.white} size={48} style={{ transform: [{ rotate: '45deg' }] }} />
                    </View>
                    <View style={styles.sparkleBox}>
                        <Sparkles color="#f59e0b" size={24} />
                    </View>
                </View>

                <Typography size="3xl" weight="bold" align="center" style={styles.title}>
                    Trip Published!
                </Typography>

                <Typography size="base" color={COLORS.background.slate[500]} align="center" style={styles.subtitle}>
                    Your trip is live. Senders on your route can now see your available capacity.
                </Typography>

                {/* Route Summary */}
                <View style={styles.summaryCard}>
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[400]} uppercase tracking={1} style={styles.summaryLabel}>
                        Trip Route
                    </Typography>
                    <View style={styles.summaryRow}>
                        <Typography weight="bold" size="lg">{travelerRoute?.from || 'Origin'}</Typography>
                        <ArrowRight color={COLORS.primary} size={16} />
                        <Typography weight="bold" size="lg">{travelerRoute?.to || 'Destination'}</Typography>
                    </View>
                </View>

                {/* Receiver Code Section */}
                {tripId && (
                    <View style={styles.codeSection}>
                        <View style={styles.codeSectionHeader}>
                            <QrCode color={COLORS.primary} size={20} />
                            <Typography size="base" weight="bold" color="#0F172A" style={{ marginLeft: 8 }}>
                                Your Receiver Code
                            </Typography>
                        </View>

                        <Typography size="xs" color={COLORS.background.slate[500]} style={styles.codeDesc}>
                            Share this code with the sender. They present it at handoff to confirm the delivery.
                        </Typography>

                        {isGenerating ? (
                            <View style={styles.loadingBox}>
                                <ActivityIndicator color={COLORS.primary} />
                                <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginTop: 8 }}>
                                    Generating code...
                                </Typography>
                            </View>
                        ) : receiverCode ? (
                            <>
                                {/* QR Code (toggled) */}
                                {showQR && (
                                    <View style={styles.qrContainer}>
                                        <QRCodeGenerator
                                            value={qrValue}
                                            size={180}
                                            title=""
                                            subtitle="Sender scans this to confirm handoff"
                                        />
                                    </View>
                                )}

                                {/* Code display */}
                                <View style={styles.codeBox}>
                                    <Typography weight="bold" size="3xl" color={COLORS.primary} style={styles.codeText}>
                                        {receiverCode}
                                    </Typography>
                                </View>

                                {/* Action buttons */}
                                <View style={styles.codeActions}>
                                    <TouchableOpacity style={styles.codeActionBtn} onPress={handleCopy}>
                                        <Copy size={16} color={COLORS.primary} />
                                        <Typography size="xs" weight="bold" color={COLORS.primary} style={{ marginLeft: 6 }}>
                                            Copy
                                        </Typography>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.codeActionBtn} onPress={handleShare}>
                                        <Share2 size={16} color={COLORS.primary} />
                                        <Typography size="xs" weight="bold" color={COLORS.primary} style={{ marginLeft: 6 }}>
                                            Share
                                        </Typography>
                                    </TouchableOpacity>

                                    <TouchableOpacity style={styles.codeActionBtn} onPress={() => setShowQR(!showQR)}>
                                        <QrCode size={16} color={COLORS.primary} />
                                        <Typography size="xs" weight="bold" color={COLORS.primary} style={{ marginLeft: 6 }}>
                                            {showQR ? 'Hide QR' : 'Show QR'}
                                        </Typography>
                                    </TouchableOpacity>
                                </View>

                                {/* How it works */}
                                <View style={styles.infoBox}>
                                    <Typography weight="bold" size="sm" color="#0F172A">How it works:</Typography>
                                    <Typography size="xs" color={COLORS.background.slate[600]} style={{ marginTop: 4, lineHeight: 18 }}>
                                        1. Share this code or QR with the sender{'\n'}
                                        2. Sender presents it when you meet for handoff{'\n'}
                                        3. You scan their QR or they enter the code{'\n'}
                                        4. Delivery is confirmed and funds are released
                                    </Typography>
                                </View>
                            </>
                        ) : (
                            <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'center', marginVertical: 16 }}>
                                Code generation failed. You can access it from your trip details.
                            </Typography>
                        )}
                    </View>
                )}

                <View style={{ height: 16 }} />
            </ScrollView>

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
    scrollContent: {
        paddingHorizontal: SPACING.xl,
        paddingTop: SPACING.xxl,
        paddingBottom: 20,
        alignItems: 'center',
    },
    iconContainer: {
        marginBottom: 32,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pulseRing: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: COLORS.primary,
        opacity: 0.08,
    },
    mainIcon: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 10,
    },
    sparkleBox: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: COLORS.white,
        padding: 6,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    title: {
        marginBottom: SPACING.md,
        color: '#0F172A',
    },
    subtitle: {
        lineHeight: 24,
        marginBottom: 28,
        textAlign: 'center',
    },
    summaryCard: {
        width: '100%',
        padding: SPACING.xl,
        backgroundColor: COLORS.background.light,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.background.slate[100],
        alignItems: 'center',
        marginBottom: SPACING.xl,
    },
    summaryLabel: {
        marginBottom: 10,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    codeSection: {
        width: '100%',
        backgroundColor: COLORS.background.light,
        borderRadius: RADIUS.xl,
        padding: SPACING.xl,
        borderWidth: 1,
        borderColor: `${COLORS.primary}1A`,
    },
    codeSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    codeDesc: {
        lineHeight: 18,
        marginBottom: 20,
    },
    loadingBox: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    qrContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    codeBox: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderWidth: 2,
        borderColor: COLORS.primary,
        borderStyle: 'dashed',
        alignItems: 'center',
        marginBottom: 16,
    },
    codeText: {
        letterSpacing: 6,
    },
    codeActions: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 20,
        flexWrap: 'wrap',
    },
    codeActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: RADIUS.lg,
        borderWidth: 1.5,
        borderColor: COLORS.primary,
        backgroundColor: COLORS.white,
    },
    infoBox: {
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        padding: 14,
    },
    footer: {
        padding: SPACING.xl,
        paddingBottom: 40,
        backgroundColor: COLORS.white,
        borderTopWidth: 1,
        borderTopColor: COLORS.background.slate[100],
    },
});
