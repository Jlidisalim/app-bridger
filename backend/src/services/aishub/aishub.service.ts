// AISHub Web Service client.
// Polls vessel positions by MMSI. AISHub returns one response per request — the
// caller decides whether to ask for a single MMSI, a list, or a bounding box.
//
// Endpoint: https://data.aishub.net/ws.php
//
// We always pass format=1 (human-readable) and output=json so we get real
// units (degrees, knots) and parseable JSON instead of XML/CSV.

import axios, { AxiosInstance } from 'axios';
import logger from '../../utils/logger';
import config from '../../config/env';
import type {
  AISHubMeta,
  AISHubVesselRaw,
  VesselPosition,
} from './aishub.types';

const BASE_URL = 'https://data.aishub.net/ws.php';

// AIS sentinel values that mean "data not available"
const COG_NA     = 360;
const SOG_NA     = 102.4;
const HEADING_NA = 511;

// AIS positions older than this are flagged stale.
const STALE_AGE_MS = 10 * 60_000;

export class AISHubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AISHubError';
  }
}

export class AISHubNotConfiguredError extends AISHubError {
  constructor() {
    super('AISHUB_USERNAME is not configured');
    this.name = 'AISHubNotConfiguredError';
  }
}

const client: AxiosInstance = axios.create({ timeout: 15_000 });

function isConfigured(): boolean {
  return !!config.aishub.username;
}

function parseVessel(raw: AISHubVesselRaw): VesselPosition | null {
  if (raw.LATITUDE == null || raw.LONGITUDE == null) return null;

  const cog        = raw.COG != null && raw.COG !== COG_NA ? raw.COG : null;
  const sogKnots   = raw.SOG != null && raw.SOG !== SOG_NA ? raw.SOG : null;
  const heading    = raw.HEADING != null && raw.HEADING !== HEADING_NA ? raw.HEADING : null;
  const updatedAt  = raw.TIME ? Date.parse(raw.TIME.replace(' GMT', 'Z').replace(' ', 'T')) : NaN;
  const updatedTs  = Number.isFinite(updatedAt) ? updatedAt : Date.now();

  return {
    mmsi:        raw.MMSI,
    imo:         raw.IMO && raw.IMO > 0 ? raw.IMO : null,
    name:        raw.NAME?.trim() || null,
    callsign:    raw.CALLSIGN?.trim() || null,
    lat:         raw.LATITUDE,
    lng:         raw.LONGITUDE,
    cogDeg:      cog,
    sogKnots,
    sogKmh:      sogKnots != null ? Math.round(sogKnots * 1.852 * 10) / 10 : null,
    headingDeg:  heading,
    navStatus:   raw.NAVSTAT ?? null,
    type:        raw.TYPE ?? null,
    draughtM:    raw.DRAUGHT && raw.DRAUGHT > 0 ? raw.DRAUGHT : null,
    destination: raw.DEST?.trim() || null,
    eta:         raw.ETA?.trim() || null,
    updatedAt:   updatedTs,
    isStale:     Date.now() - updatedTs > STALE_AGE_MS,
  };
}

function unpackResponse(data: unknown): AISHubVesselRaw[] {
  if (!Array.isArray(data) || data.length === 0) {
    throw new AISHubError('Empty response from AISHub');
  }
  const meta = data[0] as AISHubMeta | undefined;
  if (meta?.ERROR) {
    throw new AISHubError(meta.ERROR_MESSAGE ?? 'AISHub error');
  }
  const vessels = (data[1] as AISHubVesselRaw[] | undefined) ?? [];
  return vessels;
}

async function request(params: Record<string, string | number>): Promise<AISHubVesselRaw[]> {
  if (!isConfigured()) throw new AISHubNotConfiguredError();
  const merged = {
    username: config.aishub.username,
    format:   1,
    output:   'json',
    compress: 0,
    ...params,
  };
  const { data } = await client.get<unknown>(BASE_URL, { params: merged });
  return unpackResponse(data);
}

// Single-vessel lookup by MMSI. The most common call path for tracking a deal.
export async function getVesselByMmsi(mmsi: number): Promise<VesselPosition | null> {
  try {
    const rows = await request({ mmsi });
    const match = rows.find((r) => r.MMSI === mmsi) ?? rows[0];
    return match ? parseVessel(match) : null;
  } catch (err) {
    if (err instanceof AISHubError) {
      logger.warn('AISHub getVesselByMmsi failed', { mmsi, error: err.message });
      return null;
    }
    throw err;
  }
}

// Multi-vessel lookup by MMSI list. Caller may pass IMO instead.
export async function getVesselsByMmsiList(mmsis: number[]): Promise<VesselPosition[]> {
  if (mmsis.length === 0) return [];
  const rows = await request({ mmsi: mmsis.join(',') });
  return rows.map(parseVessel).filter((v): v is VesselPosition => v !== null);
}

export async function getVesselsInBbox(
  latmin: number, latmax: number, lonmin: number, lonmax: number,
): Promise<VesselPosition[]> {
  const rows = await request({ latmin, latmax, lonmin, lonmax });
  return rows.map(parseVessel).filter((v): v is VesselPosition => v !== null);
}

export { isConfigured as isAisHubConfigured };
