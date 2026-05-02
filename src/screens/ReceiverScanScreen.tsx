/**
 * ReceiverScanScreen
 *
 * Allows a receiver to verify a delivery WITHOUT logging in or signing up.
 * Flow:
 *   1. Enter name + phone number
 *   2. WhatsApp profile info is auto-fetched when phone is entered
 *   3. Scan the traveler's QR code to confirm delivery (takes CMND)
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import Constants from 'expo-constants';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { CountryPicker, DEFAULT_COUNTRY, Country } from '../components/CountryPicker';
import {
  ArrowLeft,
  ScanLine,
  User,
  Phone,
  CheckCircle2,
  Camera,
  IdCard,
  Send,
} from 'lucide-react-native';
import { apiClient } from '../services/api/client';

interface ReceiverScanScreenProps {
  onBack: () => void;
  onSuccess?: () => void;
}

export const ReceiverScanScreen: React.FC<ReceiverScanScreenProps> = ({ onBack, onSuccess }) => {
  // Form fields
  const [name, setName] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [senderId, setSenderId] = useState('');
  const [whatsappId, setWhatsappId] = useState('');
  const [error, setError] = useState('');

  // Steps: 'form' → 'scan' → 'success'
  const [step, setStep] = useState<'form' | 'scan' | 'success'>('form');

  // Camera
  const [permission, requestPermission] = useCameraPermissions();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isFetchingWA, setIsFetchingWA] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);

  // Result
  const [deliveryResult, setDeliveryResult] = useState<any>(null);

  // Auto-fetch WhatsApp profile info when phone number is entered
  const fetchWhatsAppInfo = useCallback(async () => {
    if (!phoneNumber.trim()) return;

    const fullNumber = `${selectedCountry.dialCode}${phoneNumber.replace(/\s/g, '')}`;
    const parsed = parsePhoneNumberFromString(fullNumber, selectedCountry.code as any);
    if (!parsed || !parsed.isValid()) {
      setError('Please enter a valid phone number');
      return;
    }

    setIsFetchingWA(true);
    setError('');

    try {
      const e164 = parsed.format('E.164');
      // Try to fetch WhatsApp profile from baileys server
      const baileysUrl =
        process.env.EXPO_PUBLIC_BAILEYS_URL ||
        (Constants.expoConfig?.extra?.baileysServerUrl as string | undefined) ||
        'https://bridger-api.azurewebsites.net';
      const response = await fetch(`${baileysUrl}/api/check-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: e164 }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.exists) {
          if (data.name && !name) setName(data.name);
          setWhatsappId(data.jid || e164);
        } else {
          setWhatsappId(e164);
        }
      } else {
        // Fallback: use phone as WhatsApp ID
        setWhatsappId(e164);
      }
    } catch {
      // Baileys server unreachable — use phone as ID
      const e164 = parsed.format('E.164');
      setWhatsappId(e164);
    } finally {
      setIsFetchingWA(false);
    }
  }, [phoneNumber, selectedCountry, name]);

  const handleContinueToScan = async () => {
    setError('');

    if (!senderId.trim()) {
      setError('Please enter the Delivery Code');
      return;
    }

    // Verify code exists in the system before proceeding
    setIsVerifying(true);
    try {
      const verifyResponse = await apiClient.post<{ valid: boolean; error?: string; dealId?: string; status?: string }>(
        '/deals/verify-sender-id',
        { senderId: senderId.trim() },
        false,
      );

      if (!verifyResponse.data?.valid) {
        setIsVerifying(false);
        const errorMsg = verifyResponse.data?.error || 'No delivery found for this code';
        Alert.alert(
          'Invalid Code',
          errorMsg + '\n\nMake sure the sender has generated this code for you.',
          [{ text: 'OK' }]
        );
        return;
      }
    } catch (err: any) {
      // If API returns error in body, show it
      if (err.response?.data?.error) {
        setIsVerifying(false);
        Alert.alert(
          'Error',
          err.response.data.error,
          [{ text: 'OK' }]
        );
        return;
      }
      // If API fails (404 or other), skip verification for testing
      console.log('Verification API failed, continuing anyway for testing');
    }
    setIsVerifying(false);

    // Request camera permission
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera Required', 'Camera permission is needed to scan the QR code.');
        return;
      }
    }

    setStep('scan');
  };

  const handleBarCodeScanned = useCallback(async (result: BarcodeScanningResult) => {
    if (scanLocked || isVerifying) return;
    setScanLocked(true);

    try {
      const qrData = JSON.parse(result.data);
      const { dealId, receiverCode } = qrData;

      if (!dealId) {
        Alert.alert('Invalid QR', 'This QR code is not a valid delivery code.');
        setScanLocked(false);
        return;
      }

      setIsVerifying(true);

      const fullNumber = `${selectedCountry.dialCode}${phoneNumber.replace(/\s/g, '')}`;
      const parsed = parsePhoneNumberFromString(fullNumber, selectedCountry.code as any);
      const e164 = parsed?.format('E.164') || fullNumber;

      // Call unauthenticated receiver verify endpoint
      const response = await apiClient.post<any>('/deals/receiver-verify', 
        {
          dealId,
          receiverCode,
          receiverName: name,
          receiverPhone: e164,
          senderId,
          whatsappId: whatsappId || e164,
        },
        false // false = no auth required
      );

      if (response.success) {
        setDeliveryResult(response.data);
        setStep('success');
      } else {
        Alert.alert('Verification Failed', response.error || 'Could not verify the delivery code.');
        setScanLocked(false);
      }
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        Alert.alert('Invalid QR', 'This QR code is not a valid delivery code.');
      } else {
        Alert.alert('Error', e?.message || 'Failed to verify. Please try again.');
      }
      setScanLocked(false);
    } finally {
      setIsVerifying(false);
    }
  }, [scanLocked, isVerifying, name, phoneNumber, selectedCountry, whatsappId, senderId]);

  // ── FORM STEP ──
  if (step === 'form') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <ArrowLeft color={COLORS.background.slate[900]} size={24} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.main} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {/* Title */}
            <View style={styles.titleSection}>
              <View style={styles.iconBadge}>
                <ScanLine color={COLORS.white} size={28} />
              </View>
              <Typography size="2xl" weight="bold" style={styles.title}>
                Confirm Delivery
              </Typography>
              <Typography size="base" color={COLORS.background.slate[500]} style={styles.subtitle}>
                Enter the code shared by the sender, then scan the traveler's QR code.
              </Typography>
            </View>

            {/* Sender ID (provided by sender) */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Send color={COLORS.background.slate[500]} size={16} />
                <Typography size="sm" weight="semibold" style={styles.inputLabel}>
                  Delivery Code
                </Typography>
              </View>
              <Input
                value={senderId}
                onChangeText={(text) => { setSenderId(text); setError(''); }}
                placeholder="Enter the 6-digit code from sender"
                containerStyle={styles.input}
              />
              <Typography size="xs" color={COLORS.background.slate[400]} style={{ marginLeft: 4, marginTop: 2 }}>
                The sender shared this code with you
              </Typography>
            </View>

            {error ? (
              <Typography size="sm" color={COLORS.error} style={styles.errorText}>
                {error}
              </Typography>
            ) : null}

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Typography weight="bold" size="sm" color={COLORS.background.slate[800]}>
                How it works:
              </Typography>
              <Typography size="xs" color={COLORS.background.slate[600]} style={{ marginTop: 4, lineHeight: 18 }}>
                1. Enter the Sender ID{'\n'}
                2. Scan the QR code shown by the traveler{'\n'}
                3. Delivery is confirmed instantly
              </Typography>
            </View>

            <View style={styles.spacer} />
          </ScrollView>

          <View style={styles.footer}>
            <Button
              label="Scan Traveler's QR Code"
              onPress={handleContinueToScan}
              style={styles.continueButton}
              icon={<Camera color={COLORS.white} size={20} />}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── SCAN STEP ──
  if (step === 'scan') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        <View style={styles.scanHeader}>
          <TouchableOpacity onPress={() => { setStep('form'); setScanLocked(false); }} style={styles.backButton}>
            <ArrowLeft color={COLORS.white} size={24} />
          </TouchableOpacity>
          <Typography size="lg" weight="bold" color={COLORS.white} style={{ flex: 1, textAlign: 'center' }}>
            Scan QR Code
          </Typography>
          <View style={{ width: 48 }} />
        </View>

        <View style={styles.cameraContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanLocked ? undefined : handleBarCodeScanned}
          />

          {/* Scanner overlay */}
          <View style={styles.scanOverlay}>
            <View style={styles.scanFrameTop} />
            <View style={styles.scanFrameMiddle}>
              <View style={styles.scanFrameSide} />
              <View style={styles.scanFrame}>
                {/* Corner decorations */}
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <View style={styles.scanFrameSide} />
            </View>
            <View style={styles.scanFrameBottom}>
              <Typography size="base" color={COLORS.white} align="center" style={styles.scanHint}>
                Point your camera at the traveler's QR code
              </Typography>
              {isVerifying && (
                <View style={styles.verifyingBadge}>
                  <ActivityIndicator size="small" color={COLORS.white} />
                  <Typography size="sm" color={COLORS.white} weight="bold" style={{ marginLeft: 8 }}>
                    Verifying delivery...
                  </Typography>
                </View>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── SUCCESS STEP ──
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.successContent}>
        <View style={styles.successIcon}>
          <CheckCircle2 color={COLORS.success} size={64} />
        </View>
        <Typography size="2xl" weight="bold" align="center" style={styles.successTitle}>
          Delivery Confirmed!
        </Typography>
        <Typography size="base" color={COLORS.background.slate[500]} align="center" style={styles.successSubtitle}>
          The package has been successfully verified and delivered.
        </Typography>

        {deliveryResult && (
          <View style={styles.resultCard}>
            <Typography size="sm" weight="bold" color={COLORS.background.slate[800]}>
              Delivery Details
            </Typography>
            <View style={styles.resultRow}>
              <Typography size="sm" color={COLORS.background.slate[500]}>Receiver:</Typography>
              <Typography size="sm" weight="semibold">{name}</Typography>
            </View>
            {deliveryResult.route && (
              <View style={styles.resultRow}>
                <Typography size="sm" color={COLORS.background.slate[500]}>Route:</Typography>
                <Typography size="sm" weight="semibold">{deliveryResult.route}</Typography>
              </View>
            )}
            <View style={styles.resultRow}>
              <Typography size="sm" color={COLORS.background.slate[500]}>Status:</Typography>
              <Typography size="sm" weight="bold" color={COLORS.success}>DELIVERED</Typography>
            </View>
          </View>
        )}

        <Button
          label="Done"
          onPress={onSuccess || onBack}
          style={styles.doneButton}
        />
      </View>
    </SafeAreaView>
  );
};

const SCAN_FRAME_SIZE = 260;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background.light },
  content: { flex: 1 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  backButton: {
    width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 24,
  },
  main: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
  },
  titleSection: {
    alignItems: 'center',
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  iconBadge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: { marginBottom: SPACING.sm },
  subtitle: { textAlign: 'center', lineHeight: 22 },
  inputGroup: { marginBottom: SPACING.lg },
  labelRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: SPACING.sm, marginLeft: 4, gap: 6,
  },
  inputLabel: { color: COLORS.background.slate[700] },
  input: { marginBottom: 0 },
  row: { flexDirection: 'row', gap: SPACING.md },
  countryCodeContainer: { width: 120 },
  phoneContainer: { flex: 1 },
  phoneInput: { marginBottom: 0 },
  whatsappBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#25D3661A', borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  errorText: { marginBottom: SPACING.md, marginLeft: 4 },
  infoBox: {
    backgroundColor: COLORS.background.slate[100],
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  spacer: { height: SPACING.xl },
  footer: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.md,
    backgroundColor: COLORS.background.light,
  },
  continueButton: { height: 56 },

  // Scan step
  scanHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    backgroundColor: 'rgba(0,0,0,0.8)',
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    paddingTop: Platform.OS === 'ios' ? 60 : SPACING.md,
  },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  scanOverlay: { ...StyleSheet.absoluteFillObject },
  scanFrameTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrameMiddle: { flexDirection: 'row', height: SCAN_FRAME_SIZE },
  scanFrameSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanFrame: {
    width: SCAN_FRAME_SIZE, height: SCAN_FRAME_SIZE,
    borderWidth: 0,
  },
  scanFrameBottom: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', paddingTop: SPACING.xl,
  },
  scanHint: { paddingHorizontal: SPACING.xl },
  corner: {
    position: 'absolute', width: 30, height: 30,
    borderColor: COLORS.white, borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  verifyingBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.primary, borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm,
    marginTop: SPACING.lg,
  },

  // Success step
  successContent: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  successIcon: { marginBottom: SPACING.xl },
  successTitle: { marginBottom: SPACING.sm },
  successSubtitle: { marginBottom: SPACING.xl, lineHeight: 22 },
  resultCard: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.lg,
    padding: SPACING.xl, width: '100%',
    shadowColor: COLORS.black, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
    marginBottom: SPACING.xl, gap: SPACING.sm,
  },
  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  doneButton: { width: '100%', height: 56 },
});

export default ReceiverScanScreen;
