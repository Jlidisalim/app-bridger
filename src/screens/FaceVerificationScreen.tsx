import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ArrowLeft,
  Camera as CameraIcon,
  Zap,
  Lock,
  CheckCircle2,
  Sun,
  AlertTriangle,
  RotateCcw,
  Eye,
} from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { useAppStore } from '../store/useAppStore';
import { faceVerificationAPI, VerificationStatus } from '../services/api/faceVerification';

const STATUS_MESSAGES: Record<VerificationStatus, string> = {
  no_face_detected: 'Aucun visage détecté dans l\'image',
  face_mismatch: 'Le visage ne correspond pas à la pièce d\'identité',
  verified: 'Vérification réussie',
};

interface FaceVerificationScreenProps {
  onCapture: () => void;
  onBack: () => void;
}

type LivenessStep = 'position' | 'blink' | 'turn_left' | 'turn_right' | 'capturing';

export const FaceVerificationScreen: React.FC<FaceVerificationScreenProps> = ({
  onCapture,
  onBack,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const [livenessStep, setLivenessStep] = useState<LivenessStep>('position');
  const [livenessTimer, setLivenessTimer] = useState(0);
  const [qualityIssues, setQualityIssues] = useState<string[]>([]);
  const cameraRef = useRef<any>(null);
  // FIX 14C: Store interval ref so it can be cleared on unmount or success
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    setFaceEmbedding,
    setFaceVerificationStatus,
    setFaceVerificationMessage,
    setKYCSelfie,
  } = useAppStore();

  // Liveness detection flow: guide user through steps
  useEffect(() => {
    if (livenessStep === 'position') {
      const timer = setTimeout(() => setLivenessStep('blink'), 3000);
      return () => clearTimeout(timer);
    }
    if (livenessStep === 'blink') {
      const timer = setTimeout(() => setLivenessStep('turn_left'), 3000);
      return () => clearTimeout(timer);
    }
    if (livenessStep === 'turn_left') {
      const timer = setTimeout(() => setLivenessStep('turn_right'), 3000);
      return () => clearTimeout(timer);
    }
    if (livenessStep === 'turn_right') {
      const timer = setTimeout(() => setLivenessStep('capturing'), 2000);
      return () => clearTimeout(timer);
    }
  }, [livenessStep]);

  // Auto-capture when liveness flow completes
  useEffect(() => {
    if (livenessStep === 'capturing') {
      handleCapture();
    }
  }, [livenessStep]);

  // FIX 14C: Countdown timer — guard against double-start, always clean up
  useEffect(() => {
    if (captureIntervalRef.current) return; // don't start a second interval
    captureIntervalRef.current = setInterval(() => {
      setLivenessTimer((prev) => prev + 1);
    }, 1000);
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
    };
  }, []);

  const getLivenessInstruction = (): string => {
    switch (livenessStep) {
      case 'position':
        return 'Position your face in the oval frame';
      case 'blink':
        return 'Blink your eyes slowly';
      case 'turn_left':
        return 'Turn your head slightly left';
      case 'turn_right':
        return 'Turn your head slightly right';
      case 'capturing':
        return 'Hold still... Capturing';
      default:
        return '';
    }
  };

  const getLivenessProgress = (): number => {
    const steps: LivenessStep[] = ['position', 'blink', 'turn_left', 'turn_right', 'capturing'];
    const idx = steps.indexOf(livenessStep);
    return ((idx + 1) / steps.length) * 100;
  };

  const handleCapture = useCallback(async () => {
    if (isProcessing || !cameraRef.current) return;

    try {
      setIsProcessing(true);
      setFaceVerificationStatus('capturing');
      setQualityIssues([]);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        throw new Error('Failed to take photo');
      }

      setKYCSelfie(photo.uri);

      // Send to AI service for face detection, quality checks, and liveness
      const result = await faceVerificationAPI.captureFace(photo.uri);

      if (!result.success) {
        const displayMessage = result.status
          ? STATUS_MESSAGES[result.status]
          : result.message;
        setQualityIssues(result.quality?.issues || [displayMessage]);
        setFaceVerificationStatus('failed');
        setFaceVerificationMessage(displayMessage);

        Alert.alert('Problème de vérification', displayMessage, [
          {
            text: 'Réessayer',
            onPress: () => {
              setLivenessStep('position');
              setIsProcessing(false);
            },
          },
        ]);
        return;
      }

      // FIX 14C: Stop the timer on success
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      // Success - save embedding
      if (result.embedding) {
        setFaceEmbedding(result.embedding);
      }
      setFaceVerificationMessage('Face captured successfully');
      onCapture();
    } catch (error: any) {
      console.error('Face capture error:', error);
      setFaceVerificationStatus('failed');
      Alert.alert('Error', error.message || 'Failed to process selfie. Please try again.', [
        {
          text: 'Retry',
          onPress: () => {
            setLivenessStep('position');
            setIsProcessing(false);
          },
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing]);

  const handleManualCapture = () => {
    setLivenessStep('capturing');
  };

  const handleRestart = () => {
    setLivenessStep('position');
    setQualityIssues([]);
    setIsProcessing(false);
    setLivenessTimer(0);
  };

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <View style={styles.permissionIcon}>
            <CameraIcon color={COLORS.primary} size={48} />
          </View>
          <Typography size="lg" weight="bold" align="center" style={styles.permissionTitle}>
            Camera Access Required
          </Typography>
          <Typography
            size="base"
            color={COLORS.background.slate[500]}
            align="center"
            style={styles.permissionText}
          >
            Camera access is required for face verification. Your photo is processed securely and only the face embedding (not the image) is stored.
          </Typography>
          <Button label="Grant Camera Permission" onPress={requestPermission} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography size="lg" weight="bold">
          Face Verification
        </Typography>
        <View style={{ width: 40 }} />
      </View>

      {/* Liveness Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBarFill, { width: `${getLivenessProgress()}%` }]} />
        </View>
        <View style={styles.instructionRow}>
          <Eye size={18} color={COLORS.primary} />
          <Typography size="md" weight="semibold" color={COLORS.primary} style={{ marginLeft: 8 }}>
            {getLivenessInstruction()}
          </Typography>
        </View>
      </View>

      {/* Quality Issues */}
      {qualityIssues.length > 0 && (
        <View style={styles.issuesContainer}>
          {qualityIssues.map((issue, i) => (
            <View key={i} style={styles.issueRow}>
              <AlertTriangle size={14} color={COLORS.error} />
              <Typography size="xs" color={COLORS.error} style={{ marginLeft: 6, flex: 1 }}>
                {issue}
              </Typography>
            </View>
          ))}
        </View>
      )}

      {/* Camera */}
      <View style={styles.cameraArea}>
        <View style={styles.cameraFrame}>
          <CameraView ref={cameraRef} style={styles.cameraFeed} facing="front">
            {/* Face oval guide */}
            <View style={styles.faceOutlineContainer}>
              <Svg height="100%" width="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                <Path
                  d="M 20 50 C 20 10, 80 10, 80 50 C 80 90, 60 95, 50 95 C 40 95, 20 90, 20 50 Z"
                  fill="transparent"
                  stroke={
                    livenessStep === 'capturing'
                      ? '#22c55e'
                      : 'rgba(255, 255, 255, 0.8)'
                  }
                  strokeWidth="1.5"
                />
              </Svg>
            </View>

            {/* Status pill */}
            <View style={styles.statusPill}>
              {isProcessing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Typography size="sm" color={COLORS.white} weight="medium" style={{ marginLeft: 8 }}>
                    Processing...
                  </Typography>
                </>
              ) : (
                <>
                  <Sun size={16} color="#4ADE80" />
                  <Typography size="sm" color={COLORS.white} weight="medium" style={{ marginLeft: 8 }}>
                    {livenessStep === 'capturing' ? 'Capturing...' : 'Follow instructions'}
                  </Typography>
                </>
              )}
            </View>
          </CameraView>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controlsSection}>
        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.iconButton} onPress={handleRestart}>
            <RotateCcw color={COLORS.background.slate[700]} size={24} />
          </TouchableOpacity>

          <View style={styles.captureRing}>
            <TouchableOpacity
              style={[
                styles.captureButton,
                isProcessing && styles.captureButtonDisabled,
              ]}
              onPress={handleManualCapture}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <CameraIcon color={COLORS.white} size={32} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.iconButton}>
            <Zap color={COLORS.background.slate[700]} size={24} />
          </TouchableOpacity>
        </View>

        <View style={styles.securityInfo}>
          <Lock color={COLORS.background.slate[400]} size={14} />
          <Typography size="xs" color={COLORS.background.slate[400]} weight="medium">
            End-to-end encrypted. Only embeddings stored, never images.
          </Typography>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  permissionIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${COLORS.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  permissionTitle: {
    marginBottom: SPACING.md,
  },
  permissionText: {
    marginBottom: SPACING.xl,
    lineHeight: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  progressSection: {
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.sm,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  instructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  issuesContainer: {
    marginHorizontal: SPACING.xl,
    marginTop: 8,
    padding: SPACING.md,
    backgroundColor: '#FEF2F2',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  cameraArea: {
    flex: 1,
    paddingHorizontal: 24,
    marginTop: 16,
    marginBottom: 20,
  },
  cameraFrame: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 15,
    elevation: 10,
  },
  cameraFeed: {
    flex: 1,
    backgroundColor: COLORS.background.slate[900],
  },
  faceOutlineContainer: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
  },
  statusPill: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  controlsSection: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 40,
    marginBottom: 20,
    gap: 30,
  },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 5,
  },
  captureRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButton: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  captureButtonDisabled: {
    opacity: 0.6,
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
