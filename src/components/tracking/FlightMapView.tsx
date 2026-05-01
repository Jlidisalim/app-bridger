// Flight-mode "radar" view. Dark map style, plane marker, great-circle route.
// The plane position is the interpolated value (advances every 500ms between
// real OpenSky updates).

import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useTrackingStore, selectDeal } from '../../store/tracking.store';
import { PlaneMarker } from './PlaneMarker';
import { RADAR_DARK_STYLE } from './mapStyles';
import { greatCircleArc, toLL } from '../../utils/geo';
import { Typography } from '../Typography';

interface AirportInfo { lat: number; lng: number; iata?: string; city?: string; }

interface Props {
  dealId: string;
  origin?:      AirportInfo | null;
  destination?: AirportInfo | null;
  style?: ViewStyle;
  interactive?: boolean;
  showOverlay?: boolean;
}

export const FlightMapView: React.FC<Props> = ({
  dealId,
  origin,
  destination,
  style,
  interactive = true,
  showOverlay = true,
}) => {
  const state = useTrackingStore(selectDeal(dealId));
  const flight = state.flight;
  const plane = flight.interpolatedPosition ?? flight.currentPosition;

  const mapRef = useRef<MapView>(null);

  // Prefer the OpenSky historical track; fall back to a great-circle arc.
  const greatCircle = useMemo(() => {
    if (flight.routePath.length > 1) return flight.routePath; // already from server
    if (origin && destination) {
      return greatCircleArc({ lat: origin.lat, lng: origin.lng }, { lat: destination.lat, lng: destination.lng }, 64).map(
        (p) => ({ latitude: p.lat, longitude: p.lng }),
      );
    }
    return [];
  }, [flight.routePath, origin?.lat, origin?.lng, destination?.lat, destination?.lng]);

  const initialRegion: Region = useMemo(() => {
    if (origin && destination) {
      const midLat = (origin.lat + destination.lat) / 2;
      const midLng = (origin.lng + destination.lng) / 2;
      const dLat = Math.abs(origin.lat - destination.lat) * 1.4 + 4;
      const dLng = Math.abs(origin.lng - destination.lng) * 1.4 + 4;
      return { latitude: midLat, longitude: midLng, latitudeDelta: dLat, longitudeDelta: dLng };
    }
    if (plane) {
      return { latitude: plane.lat, longitude: plane.lng, latitudeDelta: 8, longitudeDelta: 8 };
    }
    return { latitude: 30, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };
  }, []); // intentionally one-shot

  useEffect(() => {
    if (!plane || !mapRef.current || !interactive) return;
    // Gentle re-center every ~10 updates; don't fight user pan.
  }, [plane?.lat, plane?.lng, interactive]); // intentionally inert — initial region is enough

  const ageSec = plane ? Math.max(0, Math.floor((Date.now() - plane.updatedAt) / 1000)) : null;
  const status = computeStatus(plane);

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
            strokeColor="rgba(255,255,255,0.55)"
            strokeWidth={1.5}
          />
        )}

        {origin && (
          <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} title={origin.iata ?? 'Origin'}>
            <View style={[styles.airport, { borderColor: '#22d3ee' }]}>
              <Typography size="xs" weight="bold" color="#22d3ee">{origin.iata ?? '•'}</Typography>
            </View>
          </Marker>
        )}
        {destination && (
          <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destination.iata ?? 'Destination'}>
            <View style={[styles.airport, { borderColor: '#60a5fa' }]}>
              <Typography size="xs" weight="bold" color="#60a5fa">{destination.iata ?? '•'}</Typography>
            </View>
          </Marker>
        )}

        {plane && (
          <Marker
            coordinate={{ latitude: plane.lat, longitude: plane.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges
            flat
          >
            <PlaneMarker headingDeg={plane.headingDeg} size={36} />
          </Marker>
        )}
      </MapView>

      {showOverlay && (
        <View style={styles.overlay}>
          <View style={styles.row}>
            <Typography size="sm" color="#fff" weight="bold">
              ✈︎ {flight.callsign ?? '—'}
            </Typography>
            <Typography size="xs" color="#94a3b8">via OpenSky</Typography>
          </View>
          {origin && destination && (
            <Typography size="xs" color="#cbd5e1" style={{ marginTop: 4 }}>
              {origin.iata ?? origin.city ?? '—'}  →  {destination.iata ?? destination.city ?? '—'}
            </Typography>
          )}
          <View style={[styles.row, { marginTop: 8 }]}>
            <Typography size="xs" color={status.color} weight="bold">{status.label}</Typography>
            {plane && (
              <Typography size="xs" color="#94a3b8">
                {Math.round(plane.altitudeM)}m · {plane.velocityKmh} km/h
              </Typography>
            )}
          </View>
          {ageSec !== null && (
            <Typography size="xs" color={ageSec > 90 ? '#fbbf24' : '#94a3b8'} style={{ marginTop: 6 }}>
              {ageSec > 90 ? '⚠️ Stale data — ' : '📡 '}Last data: {ageSec}s ago
            </Typography>
          )}
        </View>
      )}
    </View>
  );
};

function computeStatus(p: { onGround: boolean; verticalRate: number; velocityMs: number } | null) {
  if (!p) return { label: 'Awaiting data…', color: '#94a3b8' };
  if (p.onGround && p.velocityMs < 1) return { label: '● On ground',   color: '#fbbf24' };
  if (p.verticalRate > 2)             return { label: '▲ Climbing',    color: '#34d399' };
  if (p.verticalRate < -2)            return { label: '▼ Descending',  color: '#60a5fa' };
  return                                     { label: '● Cruising',    color: '#34d399' };
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#0d1117' },
  airport: {
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
    borderColor: 'rgba(99,102,241,0.18)',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
