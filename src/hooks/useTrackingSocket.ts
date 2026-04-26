// Subscribes to tracking events for a single deal and pipes them into the store.
// Joins `deal:${dealId}` on mount, leaves on unmount.

import { useEffect } from 'react';
import { useSocket } from './useSocket';
import { useTrackingStore } from '../store/tracking.store';
import { TRACKING_EVENTS } from '../constants/tracking';
import type { FlightPosition, GPSPosition, LatLng } from '../types/tracking';

interface ServerGpsPayload {
  dealId: string;
  position: {
    lat: number; lng: number; accuracy: number;
    heading: number | null; speed: number | null; altitude: number | null;
    updatedAt: number;
  };
}

interface ServerFlightPayload {
  dealId: string;
  position: FlightPosition;
  routePath?: { lat: number; lng: number }[];
}

export function useTrackingSocket(dealId: string | null | undefined): {
  isConnected: boolean;
} {
  const { socket, isConnected } = useSocket();

  const pushGPS = useTrackingStore((s) => s.pushGPSPosition);
  const pushFlight = useTrackingStore((s) => s.pushFlightPosition);
  const setRoute = useTrackingStore((s) => s.setFlightRoute);
  const markGPSLost = useTrackingStore((s) => s.markGPSLost);
  const clearGPSLost = useTrackingStore((s) => s.clearGPSLost);
  const promptSmartSwitch = useTrackingStore((s) => s.promptSmartSwitch);
  const hydrateFromSession = useTrackingStore((s) => s.hydrateFromSession);

  useEffect(() => {
    if (!socket || !dealId) return;

    socket.emit(TRACKING_EVENTS.JOIN_DEAL, { dealId });

    const onPong = (data: { dealId: string; session: any }) => {
      if (data.dealId !== dealId || !data.session) return;
      hydrateFromSession(data.session);
    };

    const onGpsUpdate = (payload: ServerGpsPayload) => {
      if (payload.dealId !== dealId) return;
      const p: GPSPosition = {
        lat:       payload.position.lat,
        lng:       payload.position.lng,
        accuracy:  payload.position.accuracy,
        heading:   payload.position.heading,
        speed:     payload.position.speed,
        altitude:  payload.position.altitude,
        updatedAt: payload.position.updatedAt,
      };
      pushGPS(dealId, p);
    };

    const onGpsLost = (payload: { dealId: string; lostAt: string }) => {
      if (payload.dealId !== dealId) return;
      markGPSLost(dealId, new Date(payload.lostAt).getTime());
    };

    const onGpsRecovered = (payload: ServerGpsPayload) => {
      if (payload.dealId !== dealId) return;
      clearGPSLost(dealId);
      pushGPS(dealId, {
        lat:       payload.position.lat,
        lng:       payload.position.lng,
        accuracy:  payload.position.accuracy,
        heading:   payload.position.heading,
        speed:     payload.position.speed,
        altitude:  payload.position.altitude,
        updatedAt: payload.position.updatedAt,
      });
    };

    const onSuggestFlight = (payload: { dealId: string }) => {
      if (payload.dealId !== dealId) return;
      promptSmartSwitch(dealId);
    };

    const onFlightUpdate = (payload: ServerFlightPayload) => {
      if (payload.dealId !== dealId) return;
      pushFlight(dealId, payload.position);
      if (payload.routePath?.length) {
        const path: LatLng[] = payload.routePath.map((p) => ({
          latitude: p.lat,
          longitude: p.lng,
        }));
        setRoute(dealId, path);
      }
    };

    const onFlightNotFound = (payload: { dealId: string; callsign: string }) => {
      if (payload.dealId !== dealId) return;
      // No store action — surfaced via the SmartSwitch / status card UI.
      console.warn(`[tracking] Flight not found: ${payload.callsign}`);
    };

    socket.on(TRACKING_EVENTS.PONG, onPong);
    socket.on(TRACKING_EVENTS.GPS_UPDATE, onGpsUpdate);
    socket.on(TRACKING_EVENTS.GPS_LOST, onGpsLost);
    socket.on(TRACKING_EVENTS.GPS_RECOVERED, onGpsRecovered);
    socket.on(TRACKING_EVENTS.SUGGEST_FLIGHT, onSuggestFlight);
    socket.on(TRACKING_EVENTS.FLIGHT_UPDATE, onFlightUpdate);
    socket.on(TRACKING_EVENTS.FLIGHT_NOT_FOUND, onFlightNotFound);

    return () => {
      socket.off(TRACKING_EVENTS.PONG, onPong);
      socket.off(TRACKING_EVENTS.GPS_UPDATE, onGpsUpdate);
      socket.off(TRACKING_EVENTS.GPS_LOST, onGpsLost);
      socket.off(TRACKING_EVENTS.GPS_RECOVERED, onGpsRecovered);
      socket.off(TRACKING_EVENTS.SUGGEST_FLIGHT, onSuggestFlight);
      socket.off(TRACKING_EVENTS.FLIGHT_UPDATE, onFlightUpdate);
      socket.off(TRACKING_EVENTS.FLIGHT_NOT_FOUND, onFlightNotFound);
      socket.emit(TRACKING_EVENTS.LEAVE_DEAL, { dealId });
    };
  }, [socket, dealId, pushGPS, pushFlight, setRoute, markGPSLost, clearGPSLost, promptSmartSwitch, hydrateFromSession]);

  return { isConnected };
}
