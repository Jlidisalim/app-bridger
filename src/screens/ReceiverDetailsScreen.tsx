import React, { useState } from 'react';
import {
    View,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    StatusBar,
    TextInput,
    Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { StepIndicator } from '../components/StepIndicator';
import { ArrowLeft, User, Phone, Info } from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { CountryPicker, Country, DEFAULT_COUNTRY, COUNTRIES } from '../components/CountryPicker';

interface ReceiverDetailsScreenProps {
    onNext: (receiver: any) => void;
    onBack: () => void;
}

export const ReceiverDetailsScreen: React.FC<ReceiverDetailsScreenProps> = ({ onNext, onBack }) => {
    const senderReceiver = useAppStore((s) => s.senderReceiver);
    const [name, setName] = useState(senderReceiver?.name || '');

    // Parse stored phone to get country + local number (if possible)
    const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
    const [localPhone, setLocalPhone] = useState('');

    // Initialize from existing senderReceiver phone (stored format: full E.164 like "+21612345678")
    React.useEffect(() => {
        if (senderReceiver?.phone) {
            const stored = senderReceiver.phone;
            // Try to find matching country by dial code prefix
            const match = COUNTRIES.find((c) => stored.startsWith(c.dialCode));
            if (match) {
                setSelectedCountry(match);
                setLocalPhone(stored.slice(match.dialCode.length));
            } else {
                setLocalPhone(stored);
            }
        }
    }, [senderReceiver]);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <ArrowLeft color={COLORS.background.slate[900]} size={24} />
                    </TouchableOpacity>
                    <Typography size="lg" weight="bold" style={styles.headerTitle}>
                        Receiver Details
                    </Typography>
                </View>
                <StepIndicator currentStep={4} totalSteps={5} label="Recipient Info" />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.titleSection}>
                    <Typography size="2xl" weight="bold">Who is receiving?</Typography>
                    <Typography size="base" color={COLORS.background.slate[600]}>
                        The receiver will need to scan a QR code to confirm delivery.
                    </Typography>
                </View>

                <View style={styles.inputSection}>
                    <Input
                        label="Receiver Full Name"
                        placeholder="Enter full name"
                        value={name}
                        onChangeText={setName}
                    />
                    <Typography size="xs" weight="bold" color={COLORS.background.slate[500]} style={styles.phoneLabel}>
                        Phone Number
                    </Typography>
                    <View style={styles.phoneRow}>
                        <CountryPicker
                            selectedCountry={selectedCountry}
                            onSelect={(c) => setSelectedCountry(c)}
                        />
                        <TextInput
                            style={styles.phoneInput}
                            placeholder="Phone number"
                            value={localPhone}
                            onChangeText={setLocalPhone}
                            keyboardType="phone-pad"
                            placeholderTextColor={COLORS.background.slate[400]}
                        />
                    </View>
                </View>

                <View style={styles.infoBox}>
                    <Info color={COLORS.primary} size={20} style={styles.infoIcon} />
                    <Typography size="sm" color={COLORS.background.slate[600]} style={styles.infoText}>
                        We'll send a secure collection link to this number when the package is ready for pickup.
                    </Typography>
                </View>

                <View style={styles.spacer} />
            </ScrollView>

                <View style={styles.footer}>
                    <View style={styles.footerButtons}>
                        <Button label="Back" variant="outline" onPress={onBack} style={styles.backCta} />
                        <Button
                            label="Next Step"
                            onPress={() => {
                                if (!name.trim()) {
                                    Alert.alert('Name required', 'Please enter the receiver\'s full name.');
                                    return;
                                }
                                if (name.trim().length < 2) {
                                    Alert.alert('Name too short', 'Receiver name must be at least 2 characters.');
                                    return;
                                }
                                const digitsOnly = localPhone.replace(/\D/g, '');
                                if (!digitsOnly || digitsOnly.length < 4) {
                                    Alert.alert('Phone required', 'Please enter a valid receiver phone number.');
                                    return;
                                }
                                onNext({ name: name.trim(), phone: `${selectedCountry.dialCode}${localPhone.trim()}` });
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
    titleSection: {
        marginBottom: SPACING.xxl,
        gap: 8,
    },
    inputSection: {
        gap: SPACING.md,
        marginBottom: SPACING.xl,
    },
    phoneLabel: {
        marginBottom: 8,
        marginLeft: 4,
    },
    phoneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.sm,
    },
    phoneInput: {
        flex: 1,
        height: 56,
        backgroundColor: COLORS.white,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: COLORS.background.slate[200],
        paddingHorizontal: SPACING.md,
        fontSize: 16,
        color: COLORS.background.slate[900],
    },
    infoBox: {
        flexDirection: 'row',
        padding: SPACING.lg,
        backgroundColor: `${COLORS.primary}0D`,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: `${COLORS.primary}1A`,
        gap: 12,
    },
    infoIcon: {
        marginTop: 2,
    },
    infoText: {
        flex: 1,
        lineHeight: 20,
    },
    spacer: {
        flex: 1,
        minHeight: 40,
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
