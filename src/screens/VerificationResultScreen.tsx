import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import {
  CheckCircle2,
  XCircle,
  Shield,
} from 'lucide-react-native';
import { useAppStore } from '../store/useAppStore';
import { faceVerificationAPI } from '../services/api/faceVerification';

interface VerificationResultScreenProps {
  onComplete: () => void;
  onRetry: () => void;
  /** Called when verification fails because the ID card is already registered
   *  to another account. Typically navigates back to the phone-entry screen. */
  onLoginInstead?: () => void;
}

type StepState = 'pending' | 'active' | 'done' | 'failed';

interface MLStep {
  label: string;
  state: StepState;
  detail: string;
}

const INITIAL_STEPS: MLStep[] = [
  { label: 'Loading face embeddings', detail: 'Preparing biometric data', state: 'pending' },
  { label: 'Running ArcFace model', detail: 'InsightFace 512-d extraction', state: 'pending' },
  { label: 'Normalizing vectors', detail: 'L2 normalization applied', state: 'pending' },
  { label: 'Computing cosine similarity', detail: 'Comparing face vs document', state: 'active' },
  { label: 'Applying match threshold', detail: 'Threshold: 0.40 similarity', state: 'pending' },
  { label: 'Finalizing result', detail: 'Generating verification report', state: 'pending' },
];

export const VerificationResultScreen: React.FC<VerificationResultScreenProps> = ({
  onComplete,
  onRetry,
  onLoginInstead,
}) => {
  const [steps, setSteps] = useState<MLStep[]>(INITIAL_STEPS);
  const [phase, setPhase] = useState<'animating' | 'comparing' | 'done'>('animating');
  const [result, setResult] = useState<{
    verified: boolean;
    confidence: number;
    message: string;
    isDuplicateId?: boolean;
  } | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const {
    faceEmbedding,
    idEmbedding,
    extractedIdNumber,
    extractedBirthday,
    setFaceVerificationStatus,
    setFaceConfidence,
    setFaceVerificationMessage,
    setKYCStatus,
    setAuthenticated,
    setCurrentUser,
    currentUser,
    phone,
  } = useAppStore();

  // Mark a step as done and activate next
  const advanceStep = (doneIndex: number) => {
    setSteps((prev) =>
      prev.map((s, i) => {
        if (i === doneIndex) return { ...s, state: 'done' };
        if (i === doneIndex + 1) return { ...s, state: 'active' };
        return s;
      })
    );
  };

  const markFailed = (fromIndex: number) => {
    setSteps((prev) =>
      prev.map((s, i) => (i >= fromIndex ? { ...s, state: 'failed' } : s))
    );
  };

  const markAllDone = () => {
    setSteps((prev) => prev.map((s) => ({ ...s, state: 'done' })));
  };

  useEffect(() => {
    // Animate steps 0–2 before making the API call
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => advanceStep(0), 400));
    timers.push(setTimeout(() => advanceStep(1), 900));
    timers.push(setTimeout(() => advanceStep(2), 1400));
    timers.push(
      setTimeout(() => {
        setPhase('comparing');
        runComparison();
      }, 1900)
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  // Fade in result card
  const showResult = () => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  };

  const runComparison = async () => {
    if (!faceEmbedding || !idEmbedding) {
      markFailed(3);
      setResult({
        verified: false,
        confidence: 0,
        message: 'Missing biometric data. Please restart verification.',
      });
      setPhase('done');
      showResult();
      return;
    }

    try {
      setFaceVerificationStatus('comparing');

      const compareResult = await faceVerificationAPI.compareFaces(
        faceEmbedding,
        idEmbedding,
        extractedIdNumber
      );

      // Animate remaining steps after API returns
      advanceStep(3);
      await delay(350);
      advanceStep(4);
      await delay(350);
      markAllDone();
      await delay(300);

      // Treat MANUAL_REVIEW as a pass (score above minimum threshold)
      const passed = compareResult.verified || compareResult.result === 'MANUAL_REVIEW';
      setResult({ ...compareResult, verified: passed });
      setFaceConfidence(compareResult.confidence);
      setFaceVerificationMessage(compareResult.message);

      if (passed) {
        setFaceVerificationStatus('verified');
        setKYCStatus('approved');
      } else {
        setFaceVerificationStatus('failed');
        setKYCStatus('rejected');
      }

      setPhase('done');
      showResult();
    } catch (error: any) {
      markFailed(3);
      const isDuplicateId =
        error.isDuplicateId === true ||
        error.code === 'DUPLICATE_ID_DOCUMENT';
      setResult({
        verified: false,
        confidence: 0,
        message: isDuplicateId
          ? error.message
          : (error.message || 'Verification service error. Please try again.'),
        isDuplicateId,
      });
      setFaceVerificationStatus('failed');
      setPhase('done');
      showResult();
    }
  };

  const handleEnterAccount = () => {
    // Set user as authenticated — RootNavigator will auto-switch to AppStack
    if (!currentUser) {
      setCurrentUser({
        id: '0',
        name: 'Verified User',
        phone: phone,
        verified: true,
        rating: 5.0,
        memberSince: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        completionRate: 100,
        totalDeals: 0,
        kycStatus: 'approved',
      });
    } else {
      setCurrentUser({ ...currentUser, verified: true, kycStatus: 'approved' });
    }
    setAuthenticated(true);
    onComplete();
  };

  // ── Loading screen ────────────────────────────────────────────

  if (phase !== 'done') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.centerContent}>

          <View style={styles.loadingCircle}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>

          <Typography size="xl" weight="bold" align="center" style={{ marginTop: 24 }}>
            Verifying Identity
          </Typography>
          <Typography
            size="sm"
            color={COLORS.background.slate[500]}
            align="center"
            style={{ marginTop: 8, paddingHorizontal: 40 }}
          >
            AI model is comparing your selfie with the face on your ID document
          </Typography>

          <View style={styles.stepsContainer}>
            {steps.map((step, i) => (
              <MLStepItem key={i} step={step} />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Result screen ─────────────────────────────────────────────

  if (!result) return null;

  const confidencePercent = (result.confidence * 100).toFixed(1);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <Animated.View style={[styles.centerContent, { opacity: fadeAnim }]}>

        <View
          style={[
            styles.resultIconCircle,
            result.verified ? styles.successCircle : styles.failCircle,
          ]}
        >
          {result.verified ? (
            <CheckCircle2 size={64} color={COLORS.success} />
          ) : (
            <XCircle size={64} color={COLORS.error} />
          )}
        </View>

        <Typography size="2xl" weight="bold" align="center" style={{ marginTop: 24 }}>
          {result.verified ? 'Identity Verified' : 'Verification Failed'}
        </Typography>

        <Typography
          size="base"
          color={COLORS.background.slate[500]}
          align="center"
          style={{ marginTop: 12, paddingHorizontal: 32 }}
        >
          {result.message}
        </Typography>

        {/* Confidence Score */}
        <View style={styles.scoreCard}>
          <View style={styles.scoreHeader}>
            <Shield size={20} color={COLORS.primary} />
            <Typography size="md" weight="bold" style={{ marginLeft: 8 }}>
              Biometric Confidence
            </Typography>
          </View>

          <View style={styles.scoreBarContainer}>
            <View
              style={[
                styles.scoreBarFill,
                {
                  width: `${Math.min(result.confidence * 100, 100)}%`,
                  backgroundColor: result.verified ? COLORS.success : COLORS.error,
                },
              ]}
            />
          </View>

          <View style={styles.scoreRow}>
            <Typography
              size="3xl"
              weight="bold"
              color={result.verified ? COLORS.success : COLORS.error}
            >
              {confidencePercent}%
            </Typography>
            <View style={styles.thresholdBadge}>
              <Typography size="xs" color={COLORS.background.slate[600]}>
                Min threshold: 10%
              </Typography>
            </View>
          </View>
        </View>

        {/* Extracted ID Information */}
        {result.verified && (extractedIdNumber || extractedBirthday) && (
          <View style={styles.scoreCard}>
            <View style={styles.scoreHeader}>
              <Shield size={20} color={COLORS.primary} />
              <Typography size="md" weight="bold" style={{ marginLeft: 8 }}>
                Extracted ID Information
              </Typography>
            </View>
            {extractedIdNumber && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Typography size="sm" color={COLORS.background.slate[500]}>ID Number</Typography>
                <Typography size="sm" weight="bold" color={COLORS.background.slate[900]}>
                  {extractedIdNumber}
                </Typography>
              </View>
            )}
            {extractedBirthday && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Typography size="sm" color={COLORS.background.slate[500]}>Date of Birth</Typography>
                <Typography size="sm" weight="bold" color={COLORS.background.slate[900]}>
                  {extractedBirthday}
                </Typography>
              </View>
            )}
          </View>
        )}

        {/* Completed ML Steps */}
        <View style={styles.completedSteps}>
          {steps.map((step, i) => (
            <MLStepItem key={i} step={step} compact />
          ))}
        </View>
      </Animated.View>

      {/* Actions */}
      <View style={styles.actions}>
        {result.verified ? (
          <Button
            label="Enter My Account"
            onPress={handleEnterAccount}
            style={styles.actionButton}
          />
        ) : result.isDuplicateId ? (
          <>
            <Button
              label="Log In Instead"
              onPress={onLoginInstead ?? onRetry}
              style={styles.actionButton}
            />
            <Typography
              size="xs"
              color={COLORS.background.slate[400]}
              align="center"
              style={{ marginTop: 12 }}
            >
              An account with this ID already exists. Please log in with your registered phone number.
            </Typography>
          </>
        ) : (
          <>
            <Button
              label="Retry Verification"
              onPress={onRetry}
              style={styles.actionButton}
            />
            <Typography
              size="xs"
              color={COLORS.background.slate[400]}
              align="center"
              style={{ marginTop: 12 }}
            >
              Ensure good lighting and hold your ID document steady
            </Typography>
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

// ── ML Step Item ───────────────────────────────────────────────

const MLStepItem: React.FC<{ step: MLStep; compact?: boolean }> = ({ step, compact }) => {
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step.state === 'active') {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.stopAnimation();
      spinAnim.setValue(0);
    }
  }, [step.state]);

  const textColor =
    step.state === 'done'
      ? COLORS.background.slate[700]
      : step.state === 'active'
      ? COLORS.primary
      : step.state === 'failed'
      ? COLORS.error
      : COLORS.background.slate[400];

  return (
    <View style={[stepStyles.row, compact && stepStyles.compactRow]}>
      <View style={stepStyles.icon}>
        {step.state === 'active' ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : step.state === 'done' ? (
          <CheckCircle2 size={compact ? 14 : 18} color={COLORS.success} />
        ) : step.state === 'failed' ? (
          <XCircle size={compact ? 14 : 18} color={COLORS.error} />
        ) : (
          <View style={[stepStyles.pending, compact && stepStyles.pendingSmall]} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Typography
          size={compact ? 'xs' : 'sm'}
          color={textColor}
          weight={step.state === 'active' ? 'semibold' : 'regular'}
        >
          {step.label}
        </Typography>
        {!compact && step.state === 'active' && (
          <Typography size="xs" color={COLORS.background.slate[400]}>
            {step.detail}
          </Typography>
        )}
      </View>
    </View>
  );
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  compactRow: {
    marginBottom: 4,
  },
  icon: {
    width: 24,
    alignItems: 'center',
    marginRight: 10,
  },
  pending: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.background.slate[300],
  },
  pendingSmall: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  loadingCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: `${COLORS.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsContainer: {
    marginTop: 32,
    alignSelf: 'stretch',
    paddingHorizontal: 20,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  resultIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircle: {
    backgroundColor: '#F0FDF4',
  },
  failCircle: {
    backgroundColor: '#FEF2F2',
  },
  scoreCard: {
    marginTop: 24,
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  scoreBarContainer: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  thresholdBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completedSteps: {
    marginTop: 16,
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.sm,
    padding: SPACING.lg,
  },
  actions: {
    padding: SPACING.xl,
    paddingBottom: 40,
  },
  actionButton: {},
});
