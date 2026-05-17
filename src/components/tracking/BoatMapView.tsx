// Boat-mode "nautical chart" view. Dark map style, vessel marker, great-circle
// route between origin and destination ports. AIS data is much sparser than
// ADS-B — vessels at sea can go several minutes between position reports — so
// we lean on the stale indicator more than the flight view.

import React, { useMemo, useRef } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useTrackingStore, selectDeal } from '../../store/tracking.store';
import { BoatMarker } from './BoatMarker';
import { RADAR_DARK_STYLE } from './mapStyles';
import { greatCircleArc, toLL } from '../../utils/geo';
import { Typography } from '../Typography';

interface PortInfo { lat: number; lng: number; code?: string; city?: string; }

interface Props {
  dealId: string;
  origin?:      PortInfo | null;
  destination?: PortInfo | null;
  style?: ViewStyle;
  interactive?: boolean;
  showOverlay?: boolean;
}

export const BoatMapView: React.FC<Props> = ({
  dealId,
  origin,
  destination,
  style,
  interactive = true,
  showOverlay = true,
}) => {
  const state = useTrackingStore(selectDeal(dealId));
  const boat = state.boat;
  const vessel = boat.currentPosition;

  const mapRef = useRef<MapView>(null);

  const greatCircle = useMemo(() => {
    if (boat.routePath.length > 1) return boat.routePath;
    if (origin && destination) {
      return greatCircleArc(
        { lat: origin.lat, lng: origin.lng },
        { lat: destination.lat, lng: destination.lng },
        64,
      ).map((p) => ({ latitude: p.lat, longitude: p.lng }));
    }
    return [];
  }, [boat.routePath, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  const initialRegion: Region = useMemo(() => {
    if (origin && destination) {
      const midLat = (origin.lat + destination.lat) / 2;
      const midLng = (origin.lng + destination.lng) / 2;
      const dLat = Math.abs(origin.lat - destination.lat) * 1.4 + 4;
      const dLng = Math.abs(origin.lng - destination.lng) * 1.4 + 4;
      return { latitude: midLat, longitude: midLng, latitudeDelta: dLat, longitudeDelta: dLng };
    }
    if (vessel) {
      return { latitude: vessel.lat, longitude: vessel.lng, latitudeDelta: 4, longitudeDelta: 4 };
    }
    return { latitude: 30, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };
  }, []); // intentionally one-shot

  const ageSec = vessel ? Math.max(0, Math.floor((Date.now() - vessel.updatedAt) / 1000)) : null;
  const status = computeStatus(vessel);
  const rotation = vessel?.headingDeg ?? vessel?.cogDeg ?? 0;

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'ios' ? undefined : PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        customMapStyle={RADAR_DARK_STYLE as any}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={interactive}
        pitchEnabled={interactive}
      >
        {greatCircle.length > 1 && (
          <Polyline
            coordinates={greatCircle.map((p) =>
              'latitude' in p ? p : toLL(p as any),
            )}
            strokeColor="rgba(34,211,238,0.55)"
            strokeWidth={1.5}
          />
        )}

        {origin && (
          <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title={origin.code ?? 'Origin'}>
            <View style={[styles.port, { borderColor: '#22d3ee' }]}>
              <Typography size="xs" weight="bold" color="#22d3ee">{origin.code ?? '•'}</Typography>
            </View>
          </Marker>
        )}
        {destination && (
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destination.code ?? 'Destination'}>
            <View style={[styles.port, { borderColor: '#60a5fa' }]}>
              <Typography size="xs" weight="bold" color="#60a5fa">{destination.code ?? '•'}</Typography>
            </View>
          </Marker>
        )}

        {vessel && (
          <Marker
            coordinate={{ latitude: vessel.lat, longitude: vessel.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges
            flat
          >
            <BoatMarker headingDeg={rotation} size={32} />
          </Marker>
        )}
      </MapView>

      {showOverlay && (
        <View style={styles.overlay}>
          <View style={styles.row}>
            <Typography size="sm" color="#fff" weight="bold">
              ⚓ {vessel?.name ?? (boat.mmsi ? `MMSI ${boat.mmsi}` : '—')}
            </Typography>
            <Typography size="xs" color="#94a3b8">via AISHub</Typography>
          </View>
          {origin && destination && (
            <Typography size="xs" color="#cbd5e1" style={{ marginTop: 4 }}>
              {origin.code ?? origin.city ?? '—'}  →  {destination.code ?? destination.city ?? '—'}
            </Typography>
          )}
          <View style={[styles.row, { marginTop: 8 }]}>
            <Typography size="xs" color={status.color} weight="bold">{status.label}</Typography>
            {vessel && (
              <Typography size="xs" color="#94a3b8">
                {vessel.sogKnots != null ? `${vessel.sogKnots.toFixed(1)} kn` : '— kn'}
                {vessel.cogDeg != null ? ` · ${Math.round(vessel.cogDeg)}°` : ''}
              </Typography>
            )}
          </View>
          {vessel?.destination && (
            <Typography size="xs" color="#cbd5e1" style={{ marginTop: 4 }}>
              Dest: {vessel.destination}
              {vessel.eta ? `  ·  ETA ${vessel.eta}` : ''}
            </Typography>
          )}
          {ageSec !== null && (
            <Typography size="xs" color={ageSec > 600 ? '#fbbf24' : '#94a3b8'} style={{ marginTop: 6 }}>
              {ageSec > 600 ? '⚠️ Stale AIS — ' : '📡 '}Last position: {formatAge(ageSec)} ago
            </Typography>
          )}
        </View>
      )}
    </View>
  );
};

function formatAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  return `${Math.floor(sec / 3600)}h`;
}

function computeStatus(v: { sogKnots: number | null; navStatus: number | null } | null) {
  if (!v) return { label: 'Awaiting AIS…', color: '#94a3b8' };
  // ITU-R M.1371 nav status codes: 1 = at anchor, 5 = moored, 8 = sailing.
  if (v.navStatus === 1 || v.navStatus === 5) return { label: '● Moored / Anchored', color: '#fbbf24' };
  if (v.sogKnots != null && v.sogKnots < 0.3)  return { label: '● Stopped',           color: '#fbbf24' };
  return { label: '● Underway', color: '#34d399' };
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#0d1117' },
  port: {
    backgroundColor: 'rgba(13,17,23,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  overlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: 'rgba(13,17,23,0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.18)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
