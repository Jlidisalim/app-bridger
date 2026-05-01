import React from 'react';
import { View, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { Typography } from './Typography';

interface QRCodeGeneratorProps {
  value: string;
  size?: number;
  title?: string;
  subtitle?: string;
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({
  value,
  size = 200,
  title = 'Delivery QR Code',
  subtitle = 'Show this code to confirm delivery',
}) => {
  return (
    <View style={styles.container}>
      {title && (
        <Typography size="lg" weight="bold" align="center" style={styles.title}>
          {title}
        </Typography>
      )}
      <View style={styles.qrWrapper}>
        <QRCode
          value={value}
          size={size}
          color={COLORS.background.slate[900]}
          backgroundColor={COLORS.white}
        />
      </View>
      {subtitle && (
        <Typography
          size="sm"
          color={COLORS.background.slate[500]}
          align="center"
          style={styles.subtitle}
        >
          {subtitle}
        </Typography>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: SPACING.xl,
  },
  title: {
    marginBottom: SPACING.lg,
  },
  qrWrapper: {
    padding: SPACING.lg,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  subtitle: {
    marginTop: SPACING.md,
  },
});
