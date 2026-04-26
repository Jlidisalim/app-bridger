// Bottom sheet for activating tracking. Gorhom isn't installed in this project,
// so we use a Modal with a slide-up animation.

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  Easing,
  TouchableWithoutFeedback,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Plane, MapPin, X } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING } from '../../theme/theme';
import { Typography } from '../Typography';

type Mode = 'gps' | 'flight';

interface Props {
  visible: boolean;
  onClose: () => void;
  defaultMode?: Mode;
  defaultCallsign?: string;
  loading?: boolean;
  onActivate: (mode: Mode, callsign?: string) => Promise<void> | void;
}

export const TrackingModeSheet: React.FC<Props> = ({
  visible,
  onClose,
  defaultMode = 'gps',
  defaultCallsign,
  loading = false,
  onActivate,
}) => {
  const [selected, setSelected] = useState<Mode>(defaultMode);
  const [callsign, setCallsign] = useState(defaultCallsign ?? '');
  const [touched, setTouched] = useState(false);

  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setSelected(defaultMode);
      setCallsign(defaultCallsign ?? '');
      setTouched(false);
      Animated.timing(slide, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible, defaultMode, defaultCallsign, slide]);

  const callsignError = (() => {
    if (selected !== 'flight') return null;
    const cleaned = callsign.replace(/\s+/g, '');
    if (cleaned.length < 3) return touched ? 'Enter a valid flight number' : null;
    if (!/^[A-Z0-9]+$/i.test(cleaned)) return 'Letters and numbers only';
    return null;
  })();

  const canSubmit = !loading && (selected === 'gps' || (callsign.trim().length >= 3 && !callsignError));

  const submit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    await onActivate(selected, selected === 'flight' ? callsign.trim().toUpperCase() : undefined);
  };

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });
  const backdropOpacity = slide.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={StyleSheet.absoluteFill}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: backdropOpacity }]} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View>
              <Typography size="xl" weight="bold" color={COLORS.background.slate[900]}>
                Activate tracking
              </Typography>
              <Typography size="sm" color={COLORS.background.slate[500]}>
                Choose how to share your journey
              </Typography>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <X size={24} color={COLORS.background.slate[500]} />
            </TouchableOpacity>
          </View>

          <ModeCard
            selected={selected === 'gps'}
            onPress={() => setSelected('gps')}
            icon={<MapPin size={22} color={COLORS.success} />}
            title="Live GPS tracking"
            subtitle="Real-time position every 15 seconds"
            badge="Recommended"
            accent={COLORS.success}
          />

          <ModeCard
            selected={selected === 'flight'}
            onPress={() => setSelected('flight')}
            icon={<Plane size={22} color={COLORS.info} />}
            title="Flight tracking"
            subtitle="Track your aircraft via OpenSky Network"
            accent={COLORS.info}
          />

          {selected === 'flight' && (
            <View style={styles.callsignGroup}>
              <Typography size="sm" color={COLORS.background.slate[700]} weight="medium">
                Flight number
              </Typography>
              <TextInput
                value={callsign}
                onChangeText={setCallsign}
                placeholder="e.g. TU123"
                placeholderTextColor={COLORS.background.slate[400]}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[
                  styles.input,
                  callsignError ? { borderColor: COLORS.error } : undefined,
                ]}
                onBlur={() => setTouched(true)}
              />
              {callsignError && (
                <Typography size="xs" color={COLORS.error} style={{ marginTop: 4 }}>
                  {callsignError}
                </Typography>
              )}
            </View>
          )}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.cta,
              { opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Typography size="md" weight="bold" color="#fff">
                {selected === 'gps' ? 'Start GPS tracking' : 'Start flight tracking'}
              </Typography>
            )}
          </Pressable>

          <Typography size="xs" color={COLORS.background.slate[400]} style={{ textAlign: 'center', marginTop: 12 }}>
            Location is only shared while tracking is active.
          </Typography>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

interface ModeCardProps {
  selected: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  accent: string;
}

const ModeCard: React.FC<ModeCardProps> = ({ selected, onPress, icon, title, subtitle, badge, accent }) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.modeCard,
      selected
        ? { borderColor: accent, backgroundColor: hexA(accent, 0.08) }
        : { borderColor: COLORS.background.slate[200] },
    ]}
  >
    <View style={[styles.modeIcon, { backgroundColor: hexA(accent, 0.12) }]}>{icon}</View>
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Typography size="md" weight="bold" color={COLORS.background.slate[900]}>{title}</Typography>
        {badge && (
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Typography size="xs" color="#fff" weight="bold">{badge}</Typography>
          </View>
        )}
      </View>
      <Typography size="sm" color={COLORS.background.slate[500]}>{subtitle}</Typography>
    </View>
    <View style={[styles.radio, selected && { borderColor: accent, backgroundColor: accent }]} />
  </Pressable>
);

function hexA(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: SPACING.lg,
    paddingTop: 8,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.background.slate[300],
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  modeIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: COLORS.background.slate[300] },
  callsignGroup: { marginTop: 4, marginBottom: 16 },
  input: {
    marginTop: 6,
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.background.slate[300],
    borderRadius: RADIUS.lg,
    paddingHorizontal: 14,
    fontSize: 16,
    color: COLORS.background.slate[900],
    letterSpacing: 1,
  },
  cta: {
    marginTop: 8,
    height: 52,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
