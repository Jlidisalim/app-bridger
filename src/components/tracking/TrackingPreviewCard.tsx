// Compact card shown inline in the Explore screen for matched deals.
// State A: tracking idle → "Activate tracking" CTA.
// State B: tracking active → mini map preview + status row + "View" button.

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ChevronRight, Plane, MapPin, Package } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING } from '../../theme/theme';
import { Typography } from '../Typography';
import { useTrackingStore, selectDeal } from '../../store/tracking.store';
import { GPSMapView } from './GPSMapView';
import { FlightMapView } from './FlightMapView';

export interface TrackingPreviewDeal {
  id:               string;
  travelerName?:    string | null;
  travelerAvatar?:  string | null;
  fromCity?:        string | null;
  toCity?:          string | null;
  fromIata?:        string | null;
  toIata?:          string | null;
  origin?:          { lat: number; lng: number } | null;
  destination?:     { lat: number; lng: number } | null;
}

interface Props {
  deal: TrackingPreviewDeal;
  onActivate?: () => void;
  onOpen?:     () => void;
}

export const TrackingPreviewCard: React.FC<Props> = ({ deal, onActivate, onOpen }) => {
  const state = useTrackingStore(selectDeal(deal.id));
  const isActive = state.mode !== 'idle';
  const lastGpsAgo = state.gps.currentPosition
    ? Math.max(0, Math.floor((Date.now() - state.gps.currentPosition.updatedAt) / 1000))
    : null;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={isActive ? onOpen : undefined} style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          {deal.travelerAvatar ? (
            <Image source={{ uri: deal.travelerAvatar }} style={styles.avatarImg} />
          ) : (
            <Typography size="md" weight="bold" color="#fff">
              {(deal.travelerName ?? '?').slice(0, 1).toUpperCase()}
            </Typography>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Typography size="md" weight="bold" color={COLORS.background.slate[900]}>
            {deal.travelerName ?? 'Traveler'}
          </Typography>
          <Typography size="xs" color={COLORS.background.slate[500]}>
            {deal.fromCity ?? deal.fromIata ?? '—'} → {deal.toCity ?? deal.toIata ?? '—'}
          </Typography>
        </View>
        <View style={[styles.pill, { backgroundColor: isActive ? COLORS.success : COLORS.background.slate[200] }]}>
          <Typography size="xs" color={isActive ? '#fff' : COLORS.background.slate[700]} weight="bold">
            {isActive ? (state.mode === 'flight' ? 'IN AIR' : 'LIVE') : 'MATCHED'}
          </Typography>
        </View>
      </View>

      {isActive ? (
        <>
          <View style={styles.mapWrap}>
            {state.mode === 'flight' ? (
              <FlightMapView
                dealId={deal.id}
                origin={deal.origin ? { ...deal.origin, iata: deal.fromIata ?? undefined } : null}
                destination={deal.destination ? { ...deal.destination, iata: deal.toIata ?? undefined } : null}
                interactive={false}
                showOverlay={false}
              />
            ) : (
              <GPSMapView
                dealId={deal.id}
                origin={deal.origin ? { ...deal.origin, label: deal.fromCity ?? undefined } : null}
                destination={deal.destination ? { ...deal.destination, label: deal.toCity ?? undefined } : null}
                travelerAvatar={deal.travelerAvatar}
                interactive={false}
                showOverlay={false}
              />
            )}
            <View style={styles.mapTapHint} pointerEvents="none">
              <Typography size="xs" weight="bold" color="#fff">Tap to open</Typography>
            </View>
          </View>

          <View style={styles.statusRow}>
            {state.mode === 'flight' ? (
              <View style={styles.statusItem}>
                <Plane size={14} color={COLORS.info} />
                <Typography size="sm" color={COLORS.background.slate[700]}>
                  {state.flight.callsign ?? '—'}
                  {state.flight.currentPosition && `  ·  ${state.flight.currentPosition.velocityKmh} km/h`}
                </Typography>
              </View>
            ) : (
              <View style={styles.statusItem}>
                <MapPin size={14} color={COLORS.success} />
                <Typography size="sm" color={COLORS.background.slate[700]}>
                  {lastGpsAgo !== null ? `Updated ${lastGpsAgo}s ago` : 'Awaiting first fix…'}
                </Typography>
              </View>
            )}
            <TouchableOpacity onPress={onOpen} style={styles.openBtn}>
              <Typography size="sm" weight="bold" color={COLORS.primary}>View</Typography>
              <ChevronRight size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.idleRow}>
          <Package size={18} color={COLORS.background.slate[500]} />
          <Typography size="sm" color={COLORS.background.slate[600]} style={{ flex: 1 }}>
            Deal matched. Activate tracking to follow this trip.
          </Typography>
          {onActivate && (
            <TouchableOpacity onPress={onActivate} style={styles.activateBtn}>
              <Typography size="sm" weight="bold" color="#fff">Activate</Typography>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.background.slate[200],
    padding: SPACING.md,
    marginVertical: 6,
    marginHorizontal: SPACING.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 36, height: 36 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  mapWrap: { height: 140, borderRadius: 12, overflow: 'hidden', marginTop: 12, backgroundColor: '#0d1117' },
  mapTapHint: {
    position: 'absolute',
    top: 8, right: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 6,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  openBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  idleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  activateBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
