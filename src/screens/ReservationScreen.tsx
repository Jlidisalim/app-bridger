/**
 * ReservationScreen
 *
 * Flow:
 * 1. User taps "Reserve" on a deal
 * 2. Modal asks for the Traveler ID (sent via WhatsApp by the traveler)
 * 3. After entering the ID, camera opens to scan the traveler's QR code
 * 4. QR data + traveler ID sent to backend for approval
 * 5. On success, shows confirmation
 */
import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import {
  ArrowLeft,
  QrCode,
  User,
  CheckCircle2,
  Camera,
  Shield,
  X,
} from 'lucide-react-native';
import apiClient from '../services/api/client';

type Phase = 'enter_id' | 'scanning' | 'processing' | 'success' | 'error';

interface ReservationScreenProps {
  deal: any;
  onBack: () => void;
  onComplete: () => void;
}

export const ReservationScreen: React.FC<ReservationScreenProps> = ({ deal, onBack, onComplete }) => {
  const [phase, setPhase] = useState<Phase>('enter_id');
  const [travelerId, setTravelerId] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [resultMessage, setResultMessage] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false); // prevent double-scan

  // Step 1: Validate traveler ID and move to scanner
  const handleIdSubmit = async () => {
    const id = travelerId.trim();
    if (!id) {
      Alert.alert('Required', 'Please enter the Traveler ID sent to you via WhatsApp.');
      return;
    }

    setIsValidating(true);
    try {
      // Optionally validate with backend that this traveler ID exists and is assigned to this deal
      const res = await apiClient.get<any>(`/deals/${deal.id}`);
      if (res.success && res.data) {
        if (res.data.travelerId && res.data.travelerId !== id) {
          Alert.alert('Invalid ID', 'This Traveler ID does not match the assigned traveler for this deal.');
          setIsValidating(false);
          return;
        }
      }
      // Move to QR scanner
      setPhase('scanning');
    } catch {
      // Backend unreachable — proceed anyway, backend will validate on approval
      setPhase('scanning');
    }
    setIsValidating(false);
  };

  // Step 2: Handle QR code scan
  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    if (scannedRef.current) return; // prevent duplicate processing
    scannedRef.current = true;
    setPhase('processing');

    try {
      const qrData = result.data;

      const res = await apiClient.post<any>(`/deals/${deal.id}/approve-reservation`, {
        travelerId: travelerId.trim(),
        qrData,
      });

      if (res.success && res.data?.success) {
        setResultMessage(res.data.message || 'Delivery confirmed successfully!');
        setPhase('success');
      } else {
        setResultMessage(res.error || res.data?.error || 'Reservation approval failed.');
        setPhase('error');
        scannedRef.current = false; // allow retry
      }
    } catch (err: any) {
      setResultMessage(err?.message || 'Network error. Please try again.');
      setPhase('error');
      scannedRef.current = false;
    }
  };

  // Camera permission not yet determined
  if (phase === 'scanning' && !permission) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // Camera permission denied
  if (phase === 'scanning' && !permission?.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Camera size={48} color={COLORS.primary} />
          <Typography size="lg" weight="bold" align="center" style={{ marginTop: 16 }}>
            Camera Access Required
          </Typography>
          <Typography size="sm" color={COLORS.background.slate[500]} align="center" style={{ marginTop: 8, paddingHorizontal: 40 }}>
            Camera is needed to scan the traveler's QR code for delivery confirmation.
          </Typography>
          <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
            <Typography weight="bold" color={COLORS.white}>Grant Permission</Typography>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography weight="bold" size="lg">
          {phase === 'enter_id' ? 'Enter Traveler ID' :
           phase === 'scanning' ? 'Scan QR Code' :
           phase === 'processing' ? 'Verifying...' :
           phase === 'success' ? 'Confirmed' : 'Error'}
        </Typography>
        <View style={{ width: 24 }} />
      </View>

      {/* ── Phase: Enter Traveler ID ──────────────────────────────── */}
      {phase === 'enter_id' && (
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <User size={40} color={COLORS.primary} />
          </View>
          <Typography size="xl" weight="bold" align="center" style={{ marginTop: 20 }}>
            Traveler ID
          </Typography>
          <Typography size="sm" color={COLORS.background.slate[500]} align="center" style={{ marginTop: 8, lineHeight: 20 }}>
            Enter the Traveler ID that was sent to you via WhatsApp when the deal was matched.
          </Typography>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="e.g. cmnrpi68e000711ri..."
              placeholderTextColor={COLORS.background.slate[400]}
              value={travelerId}
              onChangeText={setTravelerId}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, (!travelerId.trim() || isValidating) && styles.btnDisabled]}
            onPress={handleIdSubmit}
            disabled={!travelerId.trim() || isValidating}
          >
            {isValidating ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <QrCode size={20} color={COLORS.white} />
                <Typography weight="bold" color={COLORS.white} style={{ marginLeft: 10 }}>
                  Continue to QR Scan
                </Typography>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.infoBox}>
            <Shield size={16} color={COLORS.primary} />
            <Typography size="xs" color={COLORS.background.slate[600]} style={{ flex: 1, marginLeft: 10, lineHeight: 18 }}>
              The Traveler ID ensures only the correct traveler can complete this delivery. It was shared via WhatsApp when the deal was matched.
            </Typography>
          </View>
        </View>
      )}

      {/* ── Phase: QR Scanner ─────────────────────────────────────── */}
      {phase === 'scanning' && (
        <View style={styles.scannerContainer}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarCodeScanned}
          >
            <View style={styles.scanOverlay}>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Typography weight="bold" color={COLORS.white} align="center" style={{ marginTop: 30 }}>
                Point at the traveler's QR code
              </Typography>
              <Typography size="xs" color="rgba(255,255,255,0.7)" align="center" style={{ marginTop: 8 }}>
                The QR code is on the traveler's phone screen
              </Typography>
            </View>
          </CameraView>
        </View>
      )}

      {/* ── Phase: Processing ─────────────────────────────────────── */}
      {phase === 'processing' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Typography size="lg" weight="bold" style={{ marginTop: 20 }}>Verifying Delivery...</Typography>
          <Typography size="sm" color={COLORS.background.slate[500]} style={{ marginTop: 8 }}>
            Validating traveler ID and QR code
          </Typography>
        </View>
      )}

      {/* ── Phase: Success ────────────────────────────────────────── */}
      {phase === 'success' && (
        <View style={styles.centered}>
          <View style={[styles.resultCircle, { backgroundColor: '#F0FDF4' }]}>
            <CheckCircle2 size={64} color={COLORS.success} />
          </View>
          <Typography size="2xl" weight="bold" style={{ marginTop: 24 }}>Delivery Confirmed!</Typography>
          <Typography size="sm" color={COLORS.background.slate[500]} align="center" style={{ marginTop: 12, paddingHorizontal: 40 }}>
            {resultMessage}
          </Typography>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: COLORS.success, marginTop: 32 }]} onPress={onComplete}>
            <Typography weight="bold" color={COLORS.white}>Done</Typography>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Phase: Error ──────────────────────────────────────────── */}
      {phase === 'error' && (
        <View style={styles.centered}>
          <View style={[styles.resultCircle, { backgroundColor: '#FEF2F2' }]}>
            <X size={64} color={COLORS.error} />
          </View>
          <Typography size="xl" weight="bold" style={{ marginTop: 24 }}>Verification Failed</Typography>
          <Typography size="sm" color={COLORS.background.slate[500]} align="center" style={{ marginTop: 12, paddingHorizontal: 40 }}>
            {resultMessage}
          </Typography>
          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 32 }]} onPress={() => { setPhase('scanning'); scannedRef.current = false; }}>
            <Typography weight="bold" color={COLORS.white}>Try Again</Typography>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => setPhase('enter_id')}>
            <Typography weight="bold" color={COLORS.primary}>Re-enter Traveler ID</Typography>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const CORNER_SIZE = 24;
const CORNER_WIDTH = 4;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md, backgroundColor: COLORS.white,
  },
  backBtn: { padding: 4 },
  content: { flex: 1, padding: SPACING.xl, alignItems: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: `${COLORS.primary}1A`, alignItems: 'center', justifyContent: 'center',
  },
  inputContainer: {
    width: '100%', marginTop: 24, marginBottom: 20,
  },
  input: {
    width: '100%', height: 56, backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.background.slate[200],
    paddingHorizontal: 16, fontSize: 16, color: COLORS.background.slate[900],
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', height: 56, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl, marginBottom: 20,
  },
  btnDisabled: { opacity: 0.5 },
  infoBox: {
    flexDirection: 'row', padding: 16, backgroundColor: `${COLORS.primary}0D`,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: `${COLORS.primary}1A`, width: '100%',
  },
  scannerContainer: { flex: 1 },
  camera: { flex: 1 },
  scanOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scanFrame: {
    width: 250, height: 250, position: 'relative',
  },
  corner: {
    position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderColor: COLORS.white },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderColor: COLORS.white },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH, borderColor: COLORS.white },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH, borderColor: COLORS.white },
  resultCircle: {
    width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center',
  },
});

export default ReservationScreen;
