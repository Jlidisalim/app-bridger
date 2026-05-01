import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { WalletMinimal, AlertCircle, ArrowRight } from 'lucide-react-native';
import { Typography } from './Typography';
import { COLORS, SPACING, RADIUS } from '../theme/theme';
import { formatAmount, useUserCurrency } from '../utils/currency';
import type { AppStackParamList } from '../navigation/types';

interface InsufficientBalanceAlertProps {
  visible: boolean;
  price: number;
  walletBalance: number;
  onClose: () => void;
}

export const InsufficientBalanceAlert: React.FC<InsufficientBalanceAlertProps> = ({
  visible,
  price,
  walletBalance,
  onClose,
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const currency = useUserCurrency();
  const shortfall = Math.max(0, price - walletBalance);

  const handleTopUp = () => {
    onClose();
    navigation.navigate('Deposit');
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Icon */}
              <View style={styles.iconWrapper}>
                <AlertCircle color={COLORS.warning} size={32} />
              </View>

              <Typography size="lg" weight="bold" style={styles.title}>
                Insufficient Balance
              </Typography>
              <Typography
                size="sm"
                color={COLORS.background.slate[500]}
                style={styles.subtitle}
              >
                Your wallet balance is too low to complete this transaction.
              </Typography>

              {/* Balance breakdown */}
              <View style={styles.breakdown}>
                <Row
                  label="Deal price"
                  value={formatAmount(price, currency)}
                  valueColor={COLORS.background.slate[900]}
                />
                <Row
                  label="Your balance"
                  value={formatAmount(walletBalance, currency)}
                  valueColor={COLORS.background.slate[500]}
                />
                <View style={styles.divider} />
                <Row
                  label="Amount needed"
                  value={formatAmount(shortfall, currency)}
                  valueColor={COLORS.error}
                  bold
                />
              </View>

              {/* CTA */}
              <TouchableOpacity style={styles.topUpBtn} onPress={handleTopUp} activeOpacity={0.85}>
                <WalletMinimal color={COLORS.white} size={18} />
                <Typography size="sm" weight="bold" color={COLORS.white} style={styles.topUpLabel}>
                  Top Up Wallet
                </Typography>
                <ArrowRight color={COLORS.white} size={16} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                <Typography size="sm" color={COLORS.background.slate[500]}>
                  Cancel
                </Typography>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ─── small helper ────────────────────────────────────────────────────────────
const Row: React.FC<{
  label: string;
  value: string;
  valueColor: string;
  bold?: boolean;
}> = ({ label, value, valueColor, bold }) => (
  <View style={styles.row}>
    <Typography size="sm" color={COLORS.background.slate[500]}>
      {label}
    </Typography>
    <Typography size="sm" weight={bold ? 'bold' : 'semibold'} color={valueColor}>
      {value}
    </Typography>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS['3xl'],
    borderTopRightRadius: RADIUS['3xl'],
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING['3xl'],
    alignItems: 'center',
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 20,
  },
  breakdown: {
    width: '100%',
    backgroundColor: COLORS.background.slate[50],
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
    gap: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.background.slate[200],
    marginVertical: SPACING.xs,
  },
  topUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  topUpLabel: {
    flex: 1,
    textAlign: 'center',
  },
  cancelBtn: {
    paddingVertical: SPACING.sm,
  },
});
