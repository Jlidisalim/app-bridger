// GPS-mode map. Standard light Google map; pulses traveler position in real time.
// Auto-follows the traveler unless the user has dragged the map (camera lock toggle).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Lock, Unlock, MapPin, Flag } from 'lucide-react-native';
import { useTrackingStore, selectDeal } from '../../../store/tracking.store';
import { PulsingDot } from '../PulsingDot';
import { COLORS } from '../../../theme/theme';
import { Typography } from '../../Typography';
import type { LatLng } from '../../../types/tracking';

interface Props {
  dealId: string;
  origin?: { lat: number; lng: number; label?: string } | null;
  destination?: { lat: number; lng: number; label?: string } | null;
  style?: ViewStyle;
  interactive?: boolean;
  showOverlay?: boolean;
}

const DEFAULT_REGION: Region = {
  latitude: 36.81,
  longitude: 10.18,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

export const CarMap: React.FC<Props> = ({
  dealId,
  origin,
  destination,
  style,
  interactive = true,
  showOverlay = true,
}) => {
  const state = useTrackingStore(selectDeal(dealId));
  const pos = state.gps.currentPosition ?? state.gps.lastKnownPosition;
  const history = state.gps.positionHistory;

  const mapRef = useRef<MapView>(null);
  const [follow, setFollow] = useState(true);

  const initialRegion: Region = useMemo(() => {
    if (pos) return regionAround(pos.lat, pos.lng);
    if (origin) return regionAround(origin.lat, origin.lng);
    return DEFAULT_REGION;
  }, []); // intentionally one-shot

  useEffect(() => {
    if (!follow || !pos || !mapRef.current) return;
    mapRef.current.animateToRegion(regionAround(pos.lat, pos.lng), 600);
  }, [follow, pos?.lat, pos?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const trail: LatLng[] = history.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const remaining: LatLng[] | null = pos && destination ? [
    { latitude: pos.lat, longitude: pos.lng },
    { latitude: destination.lat, longitude: destination.lng },
  ] : null;

  const lostMs = state.gps.signalLostAt ? Date.now() - state.gps.signalLostAt : null;
  const lastUpdateAgo = pos ? Math.max(0, Math.floor((Date.now() - pos.updatedAt) / 1000)) : null;

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'ios' ? undefined : PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        onPanDrag={interactive ? () => setFollow(false) : undefined}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
      >
        {origin && (
          <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title={origin.label ?? 'Origin'}>
            <View style={[styles.pin, { backgroundColor: COLORS.success }]}>
              <MapPin size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {destination && (
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destination.label ?? 'Destination'}>
            <View style={[styles.pin, { backgroundColor: COLORS.info }]}>
              <Flag size={16} color="#fff" />
            </View>
          </Marker>
        )}
        {trail.length > 1 && (
          <Polyline coordinates={trail} strokeColor="#3b82f680" strokeWidth={3} />
        )}
        {remaining && (
          <Polyline
            coordinates={remaining}
            strokeColor="#94a3b8"
            strokeWidth={2}
            lineDashPattern={[10, 6]}
          />
        )}
        {pos && (
          <Marker
            coordinate={{ latitude: pos.lat, longitude: pos.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <PulsingDot avatar={null} size={16} color={COLORS.success} />
          </Marker>
        )}
      </MapView>

      {interactive && (
        <TouchableOpacity
          onPress={() => setFollow((v) => !v)}
          style={styles.lockBtn}
          activeOpacity={0.8}
        >
          {follow ? <Lock size={18} color="#fff" /> : <Unlock size={18} color="#fff" />}
        </TouchableOpacity>
      )}

      {showOverlay && (
        <View style={styles.overlay}>
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: lostMs ? COLORS.warning : COLORS.success }]}>
              <Typography size="xs" color="#fff" weight="bold">
                {lostMs ? 'GPS LOST' : 'EN ROUTE'}
              </Typography>
            </View>
            {lastUpdateAgo !== null && (
              <Typography size="xs" color={COLORS.background.slate[600]}>
                Updated {lastUpdateAgo}s ago
              </Typography>
            )}
          </View>
          {pos && (
            <Typography size="sm" color={COLORS.background.slate[800]} style={{ marginTop: 6 }}>
              {pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}
              {pos.speed != null && pos.speed > 0
                ? `  ·  ${Math.round(pos.speed * 3.6)} km/h`
                : '  ·  stationary'}
            </Typography>
          )}
        </View>
      )}
    </View>
  );
};

function regionAround(lat: number, lng: number): Region {
  return { latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#e5e7eb' },
  pin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  lockBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
});