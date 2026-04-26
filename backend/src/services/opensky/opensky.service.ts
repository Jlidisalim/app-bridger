// OpenSky Network REST client.
// All public functions return parsed, normalized FlightPosition objects.
// Rate limit (X-Rate-Limit-Remaining) is tracked and exposed via getLastKnownCredits().

import axios, { AxiosInstance } from 'axios';
import { openskyTokens } from './opensky.token';
import logger from '../../utils/logger';
import type {
  OpenSkyStatesResponse,
  OpenSkyTrackResponse,
  RawStateVector,
  FlightPosition,
} from './opensky.types';

const BASE_URL = 'https://opensky-network.org/api';

export class OpenSkyRateLimitError extends Error {
  constructor(public retryAfterSec: number) {
    super(`OpenSky rate limit. Retry after ${retryAfterSec}s`);
    this.name = 'OpenSkyRateLimitError';
  }
}

export class FlightNotFoundError extends Error {
  constructor(public callsign: string) {
    super(`Flight not found: ${callsign}`);
    this.name = 'FlightNotFoundError';
  }
}

let lastKnownCredits: number | null = null;
export const getLastKnownCredits = (): number | null => lastKnownCredits;

const client: AxiosInstance = axios.create({ baseURL: BASE_URL, timeout: 15_000 });

client.interceptors.request.use(async (cfg) => {
  const headers = await openskyTokens.getHeaders();
  cfg.headers.Authorization = headers.Authorization;
  return cfg;
});

client.interceptors.response.use(
  (res) => {
    const remaining = res.headers['x-rate-limit-remaining'];
    if (remaining) lastKnownCredits = parseInt(remaining, 10);
    return res;
  },
  async (error) => {
    if (error.response?.status === 401 && !error.config.__retried) {
      error.config.__retried = true;
      await openskyTokens.forceRefresh();
      const headers = await openskyTokens.getHeaders();
      error.config.headers.Authorization = headers.Authorization;
      return client.request(error.config);
    }
    if (error.response?.status === 429) {
      const retryAfter = parseInt(
        error.response.headers['x-rate-limit-retry-after-seconds'] ?? '60',
        10,
      );
      logger.warn('OpenSky 429 rate limited', { retryAfter });
      throw new OpenSkyRateLimitError(retryAfter);
    }
    throw error;
  },
);

const POSITION_SOURCES = ['ADS-B', 'ASTERIX', 'MLAT', 'FLARM'] as const;

function parseStateVector(raw: RawStateVector): FlightPosition | null {
  const lat = raw[6];
  const lng = raw[5];
  if (lat === null || lng === null) return null;

  const velocityMs = raw[9] ?? 0;
  return {
    icao24:        raw[0],
    callsign:      (raw[1] ?? raw[0]).trim(),
    lat,
    lng,
    altitudeM:     raw[7] ?? raw[13] ?? 0,
    velocityMs,
    velocityKmh:   Math.round(velocityMs * 3.6),
    headingDeg:    raw[10] ?? 0,
    verticalRate:  raw[11] ?? 0,
    onGround:      raw[8],
    positionSource: POSITION_SOURCES[raw[16]] ?? 'unknown',
    updatedAt:     Date.now(),
    isStale:       raw[3] === null,
  };
}

function matchesCallsign(rawCallsign: string | null, input: string): boolean {
  if (!rawCallsign) return false;
  const a = rawCallsign.trim().replace(/\s+/g, '').toUpperCase();
  const b = input.trim().replace(/\s+/g, '').toUpperCase();
  return a === b || a.startsWith(b);
}

// First-time lookup: fetches all states, filters by callsign.
// Cost: 4 credits. Use ONCE per flight, then switch to icao24.
export async function resolveFlightByCallsign(
  callsign: string,
): Promise<{ position: FlightPosition; icao24: string } | null> {
  const { data } = await client.get<OpenSkyStatesResponse>('/states/all');
  if (!data.states) return null;

  const match = data.states.find((raw) => matchesCallsign(raw[1], callsign));
  if (!match) return null;

  const position = parseStateVector(match);
  if (!position) return null;
  return { position, icao24: match[0] };
}

// Per-aircraft poll. Cost: 1 credit. The cheap path.
export async function getFlightByIcao24(icao24: string): Promise<FlightPosition | null> {
  const { data } = await client.get<OpenSkyStatesResponse>('/states/all', {
    params: { icao24: icao24.toLowerCase() },
  });
  if (!data.states?.[0]) return null;
  return parseStateVector(data.states[0]);
}

// Live track for the route polyline.
export async function getLiveTrack(icao24: string): Promise<OpenSkyTrackResponse | null> {
  try {
    const { data } = await client.get<OpenSkyTrackResponse>('/tracks/all', {
      params: { icao24: icao24.toLowerCase(), time: 0 },
    });
    return data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function getFlightsInBbox(
  lamin: number, lomin: number, lamax: number, lomax: number,
): Promise<FlightPosition[]> {
  const { data } = await client.get<OpenSkyStatesResponse>('/states/all', {
    params: { lamin, lomin, lamax, lomax },
  });
  if (!data.states) return [];
  return data.states
    .map(parseStateVector)
    .filter((p): p is FlightPosition => p !== null);
}

export async function getRemainingCredits(): Promise<number | null> {
  try {
    await client.get<OpenSkyStatesResponse>('/states/all', { params: { icao24: 'ffffff' } });
    return lastKnownCredits;
  } catch {
    return lastKnownCredits;
  }
}
