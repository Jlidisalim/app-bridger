import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    ScrollView,
    Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { OTPInput } from '../components/OTPInput';
import { ArrowLeft, ShieldCheck, MessageCircle, RefreshCw } from 'lucide-react-native';
import { authAPI } from '../services/api';
// OTP is now handled entirely by the backend auth API
import { useAppStore } from '../store/useAppStore';

interface OTPVerificationScreenProps {
    phoneNumber: string;
    onVerify: () => void;
    onBack: () => void;
}

export const OTPVerificationScreen: React.FC<OTPVerificationScreenProps> = ({
    phoneNumber,
    onVerify,
    onBack,
}) => {
    const setCurrentUser = useAppStore((s) => s.setCurrentUser);
    const [otp, setOtp] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState('');
    const [resendCooldown, setResendCooldown] = useState(0);
    // FIX 14B: Store interval in ref so it can be reliably cleared on unmount
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Send OTP on mount
    useEffect(() => {
        handleSendOTP();

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    // FIX 14B: Use setInterval (not setTimeout) stored in ref for reliable cleanup
    useEffect(() => {
        if (resendCooldown > 0) {
            intervalRef.current = setInterval(() => {
                setResendCooldown(prev => {
                    if (prev <= 1) {
                        clearInterval(intervalRef.current!);
                        intervalRef.current = null;
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [resendCooldown]);

    const handleSendOTP = async () => {
        setIsSending(true);
        setError('');

        try {
            // Use backend auth API to send OTP (stores code in database)
            const result = await authAPI.sendOTP(phoneNumber);

            if (result.success) {
                if (result.code) {
                    // DB-based OTP: backend returned the code (dev mode or no Twilio Verify)
                    setOtp(result.code);
                    Alert.alert('Code Received', `Your verification code is: ${result.code}`, [{ text: 'OK' }]);
                } else {
                    // Twilio Verify: code sent via SMS/WhatsApp by Twilio — user enters manually
                    Alert.alert('Code Sent', `A verification code has been sent to ${phoneNumber}. Check your SMS or WhatsApp.`, [{ text: 'OK' }]);
                }
                setResendCooldown(30);
            } else {
                setError(result.message);
                Alert.alert('OTP Error', result.message || 'Failed to send OTP');
            }
        } catch (err: any) {
            const msg = err?.message || 'Failed to send OTP. Check your connection.';
            setError(msg);
            Alert.alert('Connection Error', msg);
        } finally {
            setIsSending(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;
        await handleSendOTP();
    };

    const handleVerify = async () => {
        if (otp.length !== 6) {
            setError('Please enter the complete 6-digit code');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            // Use real backend auth API which stores JWT tokens
            const result = await authAPI.verifyOTP(phoneNumber, otp);
            
            if (result.success) {
                // Store real user from backend in Zustand store
                if (result.user) {
                    setCurrentUser({
                        id: result.user.id,
                        name: result.user.name || 'New User',
                        phone: result.user.phone || phoneNumber,
                        verified: result.user.kycStatus === 'APPROVED',
                        rating: result.user.rating ?? 5.0,
                        memberSince: result.user.createdAt
                            ? new Date(result.user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                            : new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                        completionRate: 100,
                        totalDeals: result.user.totalDeals ?? 0,
                        kycStatus: (result.user.kycStatus || 'NOT_STARTED').toLowerCase().replace('_', ' ') as any,
                        avatar: result.user.avatar || result.user.profilePhoto || undefined,
                        profilePhoto: result.user.profilePhoto || result.user.avatar || undefined,
                    });
                }
                onVerify();
            } else {
                setError('Invalid verification code. Please try again.');
                setOtp('');
            }
        } catch (err) {
            setError('Verification failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Test OTP hint for development
    const handleShowTestOTP = () => {
        if (otp) {
            Alert.alert('Dev OTP', `Current code: ${otp}`, [{ text: 'OK' }]);
        } else {
            Alert.alert('Dev Hint', 'Send OTP first — the code will auto-fill in dev mode.', [{ text: 'OK' }]);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backButton}>
                    <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                </TouchableOpacity>
                <Typography size="lg" weight="bold" style={styles.headerTitle}>
                    Verification
                </Typography>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.heroSection}>
                    <View style={styles.iconContainer}>
                        <ShieldCheck color={COLORS.primary} size={48} />
                    </View>
                    <Typography size="2xl" weight="bold" align="center" style={styles.title}>
                        Verify Your Number
                    </Typography>
                    <Typography size="base" color={COLORS.background.slate[500]} align="center" style={styles.subtitle}>
                        We've sent a verification code to{'\n'}
                        <Typography weight="bold" color={COLORS.primary}>{phoneNumber}</Typography>
                    </Typography>
                </View>

                <View style={styles.whatsappInfo}>
                    <MessageCircle color="#25D366" size={20} />
                    <Typography size="sm" color={COLORS.background.slate[600]} style={{ marginLeft: 8 }}>
                        Code sent via WhatsApp
                    </Typography>
                </View>

                <View style={styles.otpSection}>
                    <Typography size="sm" weight="semibold" color={COLORS.background.slate[600]} style={styles.otpLabel}>
                        Enter Verification Code
                    </Typography>
                    <OTPInput length={6} value={otp} onComplete={setOtp} />
                    
                    {error ? (
                        <Typography size="sm" color={COLORS.error} style={styles.errorText}>
                            {error}
                        </Typography>
                    ) : null}
                </View>

                <Button 
                    label={isLoading ? "Verifying..." : "Verify & Continue"} 
                    onPress={handleVerify}
                    loading={isLoading}
                    disabled={otp.length !== 6 || isLoading}
                    style={styles.verifyButton}
                />

                <View style={styles.resendSection}>
                    <Typography size="sm" color={COLORS.background.slate[500]}>
                        Didn't receive the code?
                    </Typography>
                    
                    <TouchableOpacity 
                        onPress={handleResend} 
                        disabled={resendCooldown > 0 || isSending}
                        style={styles.resendButton}
                    >
                        {isSending ? (
                            <Typography size="sm" weight="bold" color={COLORS.primary}>Sending...</Typography>
                        ) : resendCooldown > 0 ? (
                            <Typography size="sm" weight="bold" color={COLORS.background.slate[400]}>
                                Resend in {resendCooldown}s
                            </Typography>
                        ) : (
                            <View style={styles.resendContent}>
                                <RefreshCw size={16} color={COLORS.primary} />
                                <Typography size="sm" weight="bold" color={COLORS.primary} style={{ marginLeft: 4 }}>
                                    Resend Code
                                </Typography>
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                {__DEV__ && (
                    <TouchableOpacity onPress={handleShowTestOTP} style={styles.testHelper}>
                        <Typography size="xs" color={COLORS.background.slate[400]}>
                            👀 Show Test OTP (Dev Only)
                        </Typography>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background.light },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
        backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.background.slate[100],
    },
    backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { color: COLORS.background.slate[900] },
    scrollContent: { flexGrow: 1, padding: SPACING.xl },
    heroSection: { alignItems: 'center', marginBottom: SPACING.xl },
    iconContainer: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: `${COLORS.primary}1A`,
        alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.lg,
    },
    title: { marginBottom: SPACING.sm },
    subtitle: { lineHeight: 22 },
    whatsappInfo: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: `${COLORS.success}10`, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.full, alignSelf: 'center', marginBottom: SPACING.xl,
    },
    otpSection: { marginBottom: SPACING.xl },
    otpLabel: { marginBottom: SPACING.md },
    errorText: { textAlign: 'center', marginTop: SPACING.md },
    verifyButton: { marginBottom: SPACING.xl },
    resendSection: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    },
    resendButton: { padding: SPACING.sm },
    resendContent: { flexDirection: 'row', alignItems: 'center' },
    testHelper: { marginTop: SPACING.xxl, alignItems: 'center' },
});
