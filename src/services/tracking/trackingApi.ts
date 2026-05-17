// Tracking REST API client. Wraps the project's apiClient and returns the same
// { success, data, error } envelope used elsewhere.

import { apiClient } from '../api/client';
import type { TrackingSessionDTO, TrackingMode } from '../../types/tracking';

interface PositionLogPoint {
  id:         string;
  mode:       'gps' | 'flight' | 'boat';
  lat:        number;
  lng:        number;
  altitudeM:  number | null;
  headingDeg: number | null;
  speedMs:    number | null;
  source:     string | null;
  loggedAt:   string;
}

interface ActivateOpts {
  callsign?: string;   // for flight
  mmsi?:     number;   // for boat
}

export const trackingApi = {
  activate: (dealId: string, mode: 'gps' | 'flight' | 'boat', opts: ActivateOpts = {}) =>
    apiClient.post<{ ok: true; session: any }>('/tracking/activate', {
      dealId,
      mode,
      ...(opts.callsign ? { callsign: opts.callsign } : {}),
      ...(opts.mmsi     ? { mmsi: opts.mmsi }         : {}),
    }),

  deactivate: (dealId: string) =>
    apiClient.post<{ ok: true }>('/tracking/deactivate', { dealId }),

  switchMode: (
    dealId: string,
    newMode: Exclude<TrackingMode, 'idle'>,
    opts: ActivateOpts = {},
  ) =>
    apiClient.post<{ ok: true }>('/tracking/switch-mode', {
      dealId,
      newMode,
      ...(opts.callsign ? { callsign: opts.callsign } : {}),
      ...(opts.mmsi     ? { mmsi: opts.mmsi }         : {}),
    }),

  pushGPS: (
    dealId: string,
    pos: {
      lat: number;
      lng: number;
      accuracy: number;
      heading?: number | null;
      speed?: number | null;
      altitude?: number | null;
      timestamp?: number;
    },
  ) =>
    apiClient.post<{ ok: true; session: any }>('/tracking/gps-position', {
      dealId,
      ...pos,
    }),

  getSession: (dealId: string) =>
    apiClient.get<{ session: TrackingSessionDTO | null }>(`/tracking/${dealId}`),

  getHistory: (dealId: string, limit = 50) =>
    apiClient.get<{ points: PositionLogPoint[] }>(`/tracking/${dealId}/history?limit=${limit}`),

  getCredits: () =>
    apiClient.get<{ configured: boolean; credits: number | null }>('/tracking/credits'),
};
