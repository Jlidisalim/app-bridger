import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    StatusBar,
    KeyboardAvoidingView,
    Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { CountryPicker, DEFAULT_COUNTRY, Country } from '../components/CountryPicker';
import { ArrowLeft, Sparkles, ScanLine } from 'lucide-react-native';

interface PhoneEntryScreenProps {
    onContinue: (phone: string) => void;
    onBack: () => void;
    onReceiverMode?: () => void;
}

export const PhoneEntryScreen: React.FC<PhoneEntryScreenProps> = ({ onContinue, onBack, onReceiverMode }) => {
    const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [error, setError] = useState('');

    const handleContinue = () => {
        setError('');

        if (!phoneNumber.trim()) {
            setError('Please enter your phone number');
            return;
        }

        const fullNumber = `${selectedCountry.dialCode}${phoneNumber.replace(/\s/g, '')}`;
        const parsed = parsePhoneNumberFromString(fullNumber, selectedCountry.code as any);

        if (!parsed || !parsed.isValid()) {
            setError('Please enter a valid phone number');
            return;
        }

        onContinue(parsed.format('E.164'));
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.content}
            >
                {/* Top Bar */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                    </TouchableOpacity>
                </View>

                <View style={styles.main}>
                    {/* Header Section */}
                    <View style={styles.titleSection}>
                        <Typography size="4xl" weight="bold" style={styles.title}>
                            Welcome
                        </Typography>
                        <Typography size="lg" color={COLORS.background.slate[600]} style={styles.subtitle}>
                            Please enter your phone number to continue with Bridger.
                        </Typography>
                    </View>

                    {/* Input Section */}
                    <View style={styles.inputSection}>
                        <View>
                            <Typography size="sm" weight="semibold" style={styles.inputLabel}>
                                Phone Number
                            </Typography>
                            <View style={styles.row}>
                                <View style={styles.countryCodeContainer}>
                                    <CountryPicker
                                        selectedCountry={selectedCountry}
                                        onSelect={(country) => {
                                            setSelectedCountry(country);
                                            setError('');
                                        }}
                                    />
                                </View>
                                <View style={styles.phoneContainer}>
                                    <Input
                                        value={phoneNumber}
                                        onChangeText={(text) => {
                                            setPhoneNumber(text);
                                            setError('');
                                        }}
                                        placeholder="98 000 000"
                                        keyboardType="phone-pad"
                                        containerStyle={styles.phoneInput}
                                    />
                                </View>
                            </View>
                            {error ? (
                                <Typography size="xs" color={COLORS.error} style={styles.errorText}>
                                    {error}
                                </Typography>
                            ) : null}
                        </View>

                        <Typography size="xs" color={COLORS.background.slate[500]} align="center" style={styles.disclaimer}>
                            By continuing, you may receive an SMS for verification. Message and data rates may apply.
                        </Typography>
                    </View>

                    <View style={styles.spacer} />

                    {/* Action Section */}
                    <View style={styles.footer}>
                        <Button
                            label="Continue"
                            onPress={handleContinue}
                            style={styles.continueButton}
                        />

                        {/* Receiver Mode Button */}
                        {onReceiverMode && (
                            <TouchableOpacity style={styles.receiverButton} onPress={onReceiverMode}>
                                <ScanLine color={COLORS.primary} size={20} />
                                <Typography size="sm" weight="bold" color={COLORS.primary} style={{ marginLeft: 8 }}>
                                    I'm a Receiver — Scan to Confirm Delivery
                                </Typography>
                            </TouchableOpacity>
                        )}

                        {/* ML Badge */}
                        <View style={styles.mlBadge}>
                            <Sparkles color={COLORS.primary} size={16} />
                            <Typography
                                size="xs"
                                weight="bold"
                                color={COLORS.primary}
                                uppercase
                                tracking={1}
                                style={styles.mlText}
                            >
                                Powered by ML
                            </Typography>
                        </View>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.light,
    },
    content: {
        flex: 1,
    },
    header: {
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
    },
    backButton: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 24,
    },
    main: {
        flex: 1,
        paddingHorizontal: SPACING.xl,
    },
    titleSection: {
        paddingTop: SPACING.xxl,
        paddingBottom: SPACING.xxl * 1.5,
    },
    title: {
        marginBottom: SPACING.sm,
    },
    subtitle: {
        lineHeight: 28,
    },
    inputSection: {
        gap: SPACING.lg,
    },
    inputLabel: {
        marginBottom: SPACING.sm,
        marginLeft: 4,
    },
    row: {
        flexDirection: 'row',
        gap: SPACING.md,
    },
    countryCodeContainer: {
        width: 120,
    },
    phoneContainer: {
        flex: 1,
    },
    phoneInput: {
        marginBottom: 0,
    },
    errorText: {
        marginTop: SPACING.xs,
        marginLeft: 4,
    },
    disclaimer: {
        paddingHorizontal: SPACING.xl,
        lineHeight: 18,
    },
    spacer: {
        flex: 1,
    },
    footer: {
        paddingBottom: SPACING.xl,
        alignItems: 'center',
        gap: SPACING.xl,
    },
    continueButton: {
        height: 56,
    },
    receiverButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.xl,
        borderRadius: RADIUS.xl,
        borderWidth: 1.5,
        borderColor: COLORS.primary,
        borderStyle: 'dashed',
        backgroundColor: `${COLORS.primary}08`,
    },
    mlBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        backgroundColor: `${COLORS.primary}0D`,
        borderRadius: RADIUS.full,
        borderWidth: 1,
        borderColor: `${COLORS.primary}1A`,
    },
    mlText: {
        fontSize: 10,
    },
});
