// Owns the device GPS subscription for the traveler.
// Streams positions to the backend over the existing socket; falls back to HTTP
// when the socket isn't connected.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useTrackingStore } from '../store/tracking.store';
import { useSocket } from './useSocket';
import { TRACKING, TRACKING_EVENTS } from '../constants/tracking';
import { trackingApi } from '../services/tracking/trackingApi';
import type { GPSPosition } from '../types/tracking';

interface Options {
  dealId:     string;
  enabled:    boolean;
  isTraveler: boolean;
}

interface Return {
  start:             () => Promise<void>;
  stop:              () => Promise<void>;
  permissionStatus:  'undetermined' | 'granted' | 'denied';
  requestPermission: () => Promise<'granted' | 'denied'>;
  isStarting:        boolean;
}

export function useGPSTracking({ dealId, enabled, isTraveler }: Options): Return {
  const { socket, isConnected } = useSocket();
  const setPermission   = useTrackingStore((s) => s.setGPSPermission);
  const activateGPS     = useTrackingStore((s) => s.activateGPS);
  const deactivateGPS   = useTrackingStore((s) => s.deactivateGPS);
  const pushGPSPosition = useTrackingStore((s) => s.pushGPSPosition);
  const markGPSLost     = useTrackingStore((s) => s.markGPSLost);

  const [permissionStatus, setPermissionState] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [isStarting, setIsStarting] = useState(false);

  const subRef = useRef<Location.LocationSubscription | null>(null);
  const lossTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Surface current permission on mount.
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => {
        const status = mapStatus(p.status);
        setPermissionState(status);
        setPermission(dealId, status);
      })
      .catch(() => {});
  }, [dealId, setPermission]);

  const requestPermission = useCallback(async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    const status = mapStatus(result.status);
    setPermissionState(status);
    setPermission(dealId, status);
    return status === 'granted' ? 'granted' : 'denied';
  }, [dealId, setPermission]);

  const armLossTimer = useCallback(() => {
    if (lossTimerRef.current) clearTimeout(lossTimerRef.current);
    lossTimerRef.current = setTimeout(() => {
      markGPSLost(dealId, Date.now());
    }, TRACKING.GPS_LOSS_THRESHOLD_MS);
  }, [dealId, markGPSLost]);

  const sendPosition = useCallback(
    async (position: GPSPosition) => {
      if (!isTraveler) return;
      if (socket?.connected) {
        socket.emit(TRACKING_EVENTS.GPS_POSITION, {
          dealId,
          ...position,
          timestamp: position.updatedAt,
        });
        return;
      }
      // HTTP fallback — fire-and-forget; failure is non-fatal.
      trackingApi
        .pushGPS(dealId, {
          lat: position.lat,
          lng: position.lng,
          accuracy: position.accuracy,
          heading: position.heading,
          speed: position.speed,
          altitude: position.altitude,
          timestamp: position.updatedAt,
        })
        .catch(() => {});
    },
    [dealId, isTraveler, socket],
  );

  const start = useCallback(async () => {
    if (subRef.current) return;
    setIsStarting(true);
    try {
      const granted = await requestPermission();
      if (granted !== 'granted') return;

      activateGPS(dealId);

      subRef.current = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.BestForNavigation,
          timeInterval:     TRACKING.GPS_PUSH_INTERVAL_MS,
          distanceInterval: TRACKING.GPS_DISTANCE_INTERVAL_M,
        },
        (loc) => {
          const position: GPSPosition = {
            lat:       loc.coords.latitude,
            lng:       loc.coords.longitude,
            accuracy:  loc.coords.accuracy ?? 0,
            heading:   typeof loc.coords.heading === 'number' && loc.coords.heading >= 0 ? loc.coords.heading : null,
            speed:     typeof loc.coords.speed === 'number' && loc.coords.speed >= 0 ? loc.coords.speed : null,
            altitude:  loc.coords.altitude ?? null,
            updatedAt: loc.timestamp ?? Date.now(),
          };
          pushGPSPosition(dealId, position);
          armLossTimer();
          sendPosition(position).catch(() => {});
        },
      );

      armLossTimer();
    } finally {
      setIsStarting(false);
    }
  }, [activateGPS, armLossTimer, dealId, pushGPSPosition, requestPermission, sendPosition]);

  const stop = useCallback(async () => {
    if (lossTimerRef.current) {
      clearTimeout(lossTimerRef.current);
      lossTimerRef.current = null;
    }
    if (subRef.current) {
      subRef.current.remove();
      subRef.current = null;
    }
    deactivateGPS(dealId);
  }, [dealId, deactivateGPS]);

  // Auto start/stop based on `enabled`. Cleanup on unmount.
  useEffect(() => {
    if (enabled) {
      start().catch((e) => console.warn('[useGPSTracking] start failed', e));
    } else {
      stop().catch(() => {});
    }
    return () => {
      stop().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Note: socket connection state is intentionally unused here — sendPosition
  // re-reads it via closure on each tick.
  void isConnected;

  return { start, stop, permissionStatus, requestPermission, isStarting };
}

function mapStatus(s: Location.PermissionStatus): 'granted' | 'denied' | 'undetermined' {
  if (s === Location.PermissionStatus.GRANTED) return 'granted';
  if (s === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}
