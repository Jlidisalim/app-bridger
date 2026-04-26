/**
 * ReceiverCodeScreen
 *
 * Flow: Sender generates a 6-digit receiver code → shares it with the receiver →
 * the receiver opens this screen to display the code as a QR →
 * the traveler scans the QR from the receiver's phone to confirm delivery.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from '../components/Typography';
import { QRCodeGenerator } from '../components/QRCodeGenerator';
import { ArrowLeft, Copy, Share2 } from 'lucide-react-native';
import apiClient from '../services/api/client';
import * as Clipboard from 'expo-clipboard';

interface ReceiverCodeScreenProps {
  deal: any;
  onBack: () => void;
}

export const ReceiverCodeScreen: React.FC<ReceiverCodeScreenProps> = ({ deal, onBack }) => {
  const [receiverCode, setReceiverCode] = useState<string | null>(deal?.receiverCode || null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateCode = async () => {
    setIsGenerating(true);
    try {
      const res = await apiClient.post<any>(`/deals/${deal.id}/generate-receiver-code`, {});
      if (res.success && res.data?.receiverCode) {
        setReceiverCode(res.data.receiverCode);
      } else {
        Alert.alert('Error', 'Could not generate receiver code. Try again.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to generate code');
    }
    setIsGenerating(false);
  };

  useEffect(() => {
    if (!receiverCode) generateCode();
  }, []);

  const handleCopy = async () => {
    if (receiverCode) {
      await Clipboard.setStringAsync(receiverCode);
      Alert.alert('Copied!', 'Receiver code copied to clipboard.');
    }
  };

  const handleShare = async () => {
    if (receiverCode) {
      await Share.share({
        message: `Your Bridger delivery code is: ${receiverCode}\n\nShow this QR code to the traveler when they deliver your package.`,
      });
    }
  };

  const qrValue = JSON.stringify({
    dealId: deal.id,
    receiverCode,
    type: 'receiver_confirmation',
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft color={COLORS.background.slate[900]} size={24} />
        </TouchableOpacity>
        <Typography weight="bold" size="lg" style={styles.headerTitle}>Receiver Code</Typography>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Typography weight="bold" size="xl" style={styles.title}>Delivery Confirmation Code</Typography>
        <Typography color={COLORS.background.slate[500]} style={styles.subtitle}>
          Share this code with the package receiver. They will show this QR code on their phone, and the traveler scans it to confirm delivery.
        </Typography>

        {isGenerating ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Typography size="sm" color={COLORS.background.slate[400]} style={{ marginTop: 12 }}>Generating code...</Typography>
          </View>
        ) : receiverCode ? (
          <>
            {/* QR Code Display */}
            <QRCodeGenerator
              value={qrValue}
              size={200}
              title=""
              subtitle="Traveler scans this from the receiver's phone"
            />

            {/* Code Display */}
            <View style={styles.codeBox}>
              <Typography weight="bold" size="3xl" color={COLORS.primary} style={styles.codeText}>
                {receiverCode}
              </Typography>
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionButton} onPress={handleCopy}>
                <Copy size={20} color={COLORS.primary} />
                <Typography weight="bold" size="sm" color={COLORS.primary} style={{ marginLeft: 8 }}>Copy Code</Typography>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
                <Share2 size={20} color={COLORS.primary} />
                <Typography weight="bold" size="sm" color={COLORS.primary} style={{ marginLeft: 8 }}>Share</Typography>
              </TouchableOpacity>
            </View>

          </>
        ) : (
          <View style={styles.loadingContainer}>
            <Typography color={COLORS.background.slate[400]}>No code generated</Typography>
            <TouchableOpacity style={styles.generateBtn} onPress={generateCode}>
              <Typography weight="bold" color={COLORS.white}>Generate Code</Typography>
            </TouchableOpacity>
          </View>
        )}

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Typography weight="bold" size="sm" color="#0F172A">How it works:</Typography>
          <Typography size="xs" color={COLORS.background.slate[600]} style={{ marginTop: 4, lineHeight: 18 }}>
            1. You (sender) share this code with the receiver{'\n'}
            2. Receiver opens this screen on their phone{'\n'}
            3. When the traveler arrives, receiver shows the QR{'\n'}
            4. Traveler scans the QR to confirm delivery{'\n'}
            5. Funds are released from escrow
          </Typography>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
  },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', color: COLORS.background.slate[900] },
  content: { flex: 1, padding: SPACING.xl, alignItems: 'center' },
  title: { marginBottom: 8 },
  subtitle: { textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  loadingContainer: { alignItems: 'center', marginVertical: 40 },
  codeBox: {
    backgroundColor: COLORS.white, borderRadius: RADIUS.xl,
    paddingHorizontal: 32, paddingVertical: 16,
    borderWidth: 2, borderColor: COLORS.primary, borderStyle: 'dashed',
    marginBottom: 20,
  },
  codeText: { letterSpacing: 8 },
  actions: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  actionButton: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: RADIUS.xl, borderWidth: 1.5, borderColor: COLORS.primary,
  },
  generateBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.xl,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 16,
  },
  infoBox: {
    backgroundColor: '#F1F5F9', borderRadius: RADIUS.lg,
    padding: 16, width: '100%',
  },
});

export default ReceiverCodeScreen;
