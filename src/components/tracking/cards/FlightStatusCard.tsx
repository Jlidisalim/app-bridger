import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../../theme/theme';
import { Typography } from '../../Typography';
import { Plane } from 'lucide-react-native';

interface Props {
  callsign: string | undefined;
  speedKmh: number;
  altitudeM: number;
  verticalRate: number;
  onGround: boolean;
  isStale: boolean;
  updatedAt: number;
}

export const FlightStatusCard: React.FC<Props> = ({
  callsign,
  speedKmh,
  altitudeM,
  verticalRate,
  onGround,
  isStale,
  updatedAt,
}) => {
  const speedText = speedKmh > 0 ? `${Math.round(speedKmh)} km/h` : 'stationary';
  const altitudeText = `${Math.round(altitudeM)}m`;
  const timeAgo = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  const timeText = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.floor(timeAgo / 60)}m ago`;

  // Determine vertical speed text
  let verticalText = '';
  if (verticalRate > 2) verticalText = '▲ Climbing';
  else if (verticalRate < -2) verticalText = '▼ Descending';
  else if (onGround) verticalText = '● On ground';
  else verticalText = '● Cruising';

  return (
    <View style={[styles.card, isStale && styles.stale]}>
      <View style={styles.icon}>
        <Plane size={20} color={COLORS.info} />
      </View>
      <View style={styles.info}>
        <Typography size="md" weight="bold" color={COLORS.background.slate[900]}>
          {callsign ?? 'Flight'}
        </Typography>
        <View style={styles.details}>
          <Typography size="sm" color={COLORS.background.slate[600]}>
            {verticalText}
          </Typography>
          <Typography size="xs" color={COLORS.background.slate[400]}>
            {speedText} · {altitudeText} · Updated {timeText}
          </Typography>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  stale: {
    backgroundColor: '#fffbeb',
    borderColor: '#fbbf24',
    borderWidth: 1,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  info: {
    flex: 1,
  },
  details: {
    marginTop: 2,
  },
});