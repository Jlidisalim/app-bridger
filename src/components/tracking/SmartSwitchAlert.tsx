// Modal that prompts the user to switch from GPS to flight mode after the
// signal-loss watchdog fires. Auto-dismisses after 30s if ignored.

import React, { useEffect, useState } from 'react';
import { Modal, View, StyleSheet, Pressable } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING } from '../../theme/theme';
import { Typography } from '../Typography';

interface Props {
  visible: boolean;
  callsign?: string | null;
  onSwitchToFlight: () => void;
  onDismiss: () => void;
  autoDismissAfterSec?: number;
}

export const SmartSwitchAlert: React.FC<Props> = ({
  visible,
  callsign,
  onSwitchToFlight,
  onDismiss,
  autoDismissAfterSec = 30,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(autoDismissAfterSec);

  useEffect(() => {
    if (!visible) {
      setSecondsLeft(autoDismissAfterSec);
      return;
    }
    setSecondsLeft(autoDismissAfterSec);
    const id = setInterval(() => {
      setSecondsLeft((n) => {
        if (n <= 1) {
          clearInterval(id);
          onDismiss();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [visible, autoDismissAfterSec, onDismiss]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <AlertTriangle size={28} color={COLORS.warning} />
          </View>
          <Typography size="lg" weight="bold" color={COLORS.background.slate[900]} style={{ textAlign: 'center' }}>
            GPS signal lost
          </Typography>
          <Typography
            size="sm"
            color={COLORS.background.slate[600]}
            style={{ textAlign: 'center', marginTop: 8, lineHeight: 20 }}
          >
            The traveler's GPS hasn't reported in over 2 minutes.
            {callsign ? `  Switch to flight tracking for ${callsign}?` : '  No flight number is on file.'}
          </Typography>
          <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'center', marginTop: 6 }}>
            Auto-dismissing in {secondsLeft}s
          </Typography>

          <View style={styles.actions}>
            <Pressable onPress={onDismiss} style={[styles.btn, styles.btnGhost]}>
              <Typography size="md" weight="bold" color={COLORS.background.slate[700]}>Stay on GPS</Typography>
            </Pressable>
            <Pressable
              onPress={onSwitchToFlight}
              disabled={!callsign}
              style={[styles.btn, styles.btnPrimary, !callsign && { opacity: 0.4 }]}
            >
              <Typography size="md" weight="bold" color="#fff">Switch to flight →</Typography>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: SPACING.xl,
    alignItems: 'stretch',
  },
  iconWrap: {
    alignSelf: 'center',
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fef3c7',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: {
    flex: 1, height: 48, borderRadius: RADIUS.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  btnGhost:   { backgroundColor: COLORS.background.slate[100] },
  btnPrimary: { backgroundColor: COLORS.primary },
});
