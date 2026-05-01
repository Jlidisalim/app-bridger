import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  Image,
  ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { Button } from '../components/Button';
import {
  ArrowLeft,
  BadgeCheck,
  Book,
  Car,
  Camera as CameraIcon,
  CheckCircle2,
  Info,
  AlertTriangle,
  Shield,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppStore } from '../store/useAppStore';
import { faceVerificationAPI, VerificationStatus } from '../services/api/faceVerification';

const STATUS_MESSAGES: Record<VerificationStatus, string> = {
  no_face_detected: 'Aucun visage détecté dans l\'image',
  face_mismatch: 'Le visage ne correspond pas à la pièce d\'identité',
  verified: 'Vérification réussie',
};

interface IDDocumentScanScreenProps {
  onContinue: () => void;
  onBack: () => void;
}

export const IDDocumentScanScreen: React.FC<IDDocumentScanScreenProps> = ({
  onContinue,
  onBack,
}) => {
  const [selectedDoc, setSelectedDoc] = useState<'id_card' | 'passport' | 'license'>('id_card');
  const [documentImage, setDocumentImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractionResult, setExtractionResult] = useState<{
    success: boolean;
    confidence?: number;
    message: string;
  } | null>(null);

  const {
    setIdEmbedding,
    setKYCDocumentType,
    setKYCDocumentFront,
    setFaceVerificationStatus,
    setFaceVerificationMessage,
    setExtractedIdNumber,
    setExtractedBirthday,
  } = useAppStore();

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setDocumentImage(result.assets[0].uri);
      setExtractionResult(null);
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow camera access to photograph your document.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.9,
    });

    if (!result.canceled && result.assets[0]) {
      setDocumentImage(result.assets[0].uri);
      setExtractionResult(null);
    }
  };

  const handleProcessDocument = async () => {
    if (!documentImage) {
      Alert.alert('Missing Document', 'Please upload or photograph your ID document.');
      return;
    }

    try {
      setIsProcessing(true);
      setFaceVerificationStatus('uploading_id');

      const result = await faceVerificationAPI.uploadID(documentImage);

      const displayMessage = (!result.success && result.status)
        ? STATUS_MESSAGES[result.status]
        : result.message;

      setExtractionResult({
        success: result.success,
        confidence: result.face_confidence,
        message: displayMessage,
      });

      if (!result.success) {
        setFaceVerificationStatus('failed');
        setFaceVerificationMessage(displayMessage);
        Alert.alert('Échec de l\'extraction', displayMessage);
        return;
      }

      // Save embedding and document info
      if (result.embedding) {
        setIdEmbedding(result.embedding);
      }
      setKYCDocumentType(selectedDoc);
      setKYCDocumentFront(documentImage);
      setFaceVerificationMessage('Document processed successfully');

      // Store OCR-extracted identity fields
      setExtractedIdNumber(result.id_number || null);
      setExtractedBirthday(result.birthday || null);

      onContinue();
    } catch (error: any) {
      console.error('Document processing error:', error);
      setExtractionResult({
        success: false,
        message: error.message || 'Failed to process document',
      });
      setFaceVerificationStatus('failed');
      Alert.alert('Error', error.message || 'Failed to process document. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const docTypes = [
    { id: 'id_card' as const, title: 'National ID Card', subtitle: 'Government-issued ID', icon: BadgeCheck },
    { id: 'passport' as const, title: 'Passport', subtitle: 'International passport', icon: Book },
    { id: 'license' as const, title: "Driver's License", subtitle: 'Government-issued license', icon: Car },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography size="lg" weight="bold">
          ID Document Scan
        </Typography>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Document Type Selection */}
        <Typography size="md" weight="bold" style={styles.sectionTitle}>
          Select Document Type
        </Typography>

        <View style={styles.optionsSection}>
          {docTypes.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              activeOpacity={0.7}
              onPress={() => setSelectedDoc(doc.id)}
              style={[styles.option, selectedDoc === doc.id && styles.selectedOption]}
            >
              <View style={styles.optionContent}>
                <View style={styles.iconBox}>
                  <doc.icon color={COLORS.primary} size={22} />
                </View>
                <View style={{ flex: 1 }}>
                  <Typography weight="bold" size="sm">
                    {doc.title}
                  </Typography>
                  <Typography size="xs" color={COLORS.background.slate[500]}>
                    {doc.subtitle}
                  </Typography>
                </View>
              </View>
              <View style={[styles.radio, selectedDoc === doc.id && styles.radioActive]}>
                {selectedDoc === doc.id && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Upload Section */}
        <Typography size="md" weight="bold" style={styles.sectionTitle}>
          Upload Document Photo
        </Typography>

        <TouchableOpacity
          style={[styles.uploadBox, documentImage && styles.uploadBoxSuccess]}
          onPress={pickImage}
        >
          {documentImage ? (
            <View style={styles.previewContainer}>
              <Image source={{ uri: documentImage }} style={styles.previewImage} />
              <View style={styles.checkBadge}>
                <CheckCircle2 size={20} color={COLORS.white} />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.uploadIconCircle}>
                <CameraIcon color={COLORS.primary} size={28} />
              </View>
              <Typography weight="semibold">Tap to upload from gallery</Typography>
              <Typography size="xs" color={COLORS.background.slate[400]}>
                PNG, JPG up to 10MB
              </Typography>
            </>
          )}
        </TouchableOpacity>

        {/* Or take photo */}
        <TouchableOpacity style={styles.takePhotoButton} onPress={takePhoto}>
          <CameraIcon size={18} color={COLORS.primary} />
          <Typography size="sm" color={COLORS.primary} weight="semibold" style={{ marginLeft: 8 }}>
            Or take a photo with camera
          </Typography>
        </TouchableOpacity>

        {/* Extraction Result */}
        {extractionResult && (
          <View
            style={[
              styles.resultBox,
              extractionResult.success ? styles.resultSuccess : styles.resultError,
            ]}
          >
            {extractionResult.success ? (
              <CheckCircle2 size={18} color={COLORS.success} />
            ) : (
              <AlertTriangle size={18} color={COLORS.error} />
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Typography
                size="sm"
                weight="semibold"
                color={extractionResult.success ? COLORS.success : COLORS.error}
              >
                {extractionResult.success ? 'Face Detected' : 'Detection Failed'}
              </Typography>
              <Typography size="xs" color={COLORS.background.slate[600]}>
                {extractionResult.message}
              </Typography>
              {extractionResult.confidence !== undefined && (
                <Typography size="xs" color={COLORS.background.slate[500]}>
                  Detection confidence: {(extractionResult.confidence * 100).toFixed(1)}%
                </Typography>
              )}
            </View>
          </View>
        )}

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Shield color={COLORS.primary} size={16} style={{ marginTop: 2 }} />
          <Typography size="xs" color={COLORS.background.slate[600]} style={{ flex: 1, lineHeight: 18, marginLeft: 10 }}>
            The face on your ID document will be extracted and compared with your selfie using AI.
            Only the mathematical face embedding is stored, never the raw image.
          </Typography>
        </View>

        {/* Continue Button */}
        <Button
          label={isProcessing ? 'Processing...' : 'Process & Continue'}
          onPress={handleProcessDocument}
          loading={isProcessing}
          disabled={!documentImage || isProcessing}
          style={styles.continueButton}
        />

        <View style={{ height: 40 }} />
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
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: `${COLORS.primary}1A`,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: SPACING.xl,
  },
  sectionTitle: {
    marginBottom: SPACING.md,
  },
  optionsSection: {
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: `${COLORS.primary}1A`,
  },
  selectedOption: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}0D`,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: `${COLORS.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: `${COLORS.primary}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  uploadBox: {
    height: 160,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: `${COLORS.primary}33`,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: SPACING.md,
  },
  uploadBoxSuccess: {
    borderColor: COLORS.success,
    borderStyle: 'solid',
  },
  uploadIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${COLORS.primary}0D`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  previewContainer: {
    width: '100%',
    height: '100%',
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.success,
    borderRadius: 12,
    padding: 2,
  },
  takePhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md,
    marginBottom: SPACING.xl,
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.md,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    marginBottom: SPACING.lg,
  },
  resultSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  resultError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  infoBox: {
    flexDirection: 'row',
    padding: SPACING.lg,
    backgroundColor: `${COLORS.primary}0D`,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: `${COLORS.primary}1A`,
    marginBottom: SPACING.xl,
  },
  continueButton: {},
});
