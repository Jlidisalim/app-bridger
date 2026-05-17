// Mobile tracking types — kept in sync with backend tracking.service serializeSession.

export type TrackingMode = 'idle' | 'gps' | 'flight' | 'boat';

export interface LatLng {
  latitude:  number;
  longitude: number;
}

export interface GPSPosition {
  lat:       number;
  lng:       number;
  accuracy:  number;
  heading:   number | null;
  speed:     number | null;   // m/s
  altitude:  number | null;   // m
  updatedAt: number;          // Unix ms
}

export interface FlightPosition {
  icao24:        string;
  callsign:      string;
  lat:           number;
  lng:           number;
  altitudeM:     number;
  velocityMs:    number;
  velocityKmh:   number;
  headingDeg:    number;
  verticalRate:  number;
  onGround:      boolean;
  positionSource?: 'ADS-B' | 'ASTERIX' | 'MLAT' | 'FLARM' | 'unknown';
  isStale:       boolean;
  updatedAt:     number;
}

// AIS vessel position. Several fields are nullable because AIS uses sentinel
// values (e.g. heading=511) when data is unavailable — we normalize those to null.
export interface VesselPosition {
  mmsi:        number;
  imo:         number | null;
  name:        string | null;
  callsign:    string | null;
  lat:         number;
  lng:         number;
  cogDeg:      number | null;
  sogKnots:    number | null;
  sogKmh:      number | null;
  headingDeg:  number | null;
  navStatus:   number | null;
  type:        number | null;
  draughtM:    number | null;
  destination: string | null;
  eta:         string | null;
  isStale:     boolean;
  updatedAt:   number;
}

export interface TrackingSessionDTO {
  dealId: string;
  mode:   TrackingMode;
  gps: {
    isActive:    boolean;
    lat:         number | null;
    lng:         number | null;
    accuracyM:   number | null;
    headingDeg:  number | null;
    speedMs:     number | null;
    altitudeM:   number | null;
    updatedAt:   number | null;
    lostAt:      number | null;
  };
  flight: {
    isActive:     boolean;
    callsign:     string | null;
    icao24:       string | null;
    lat:          number | null;
    lng:          number | null;
    altitudeM:    number | null;
    headingDeg:   number | null;
    velocityMs:   number | null;
    verticalRate: number | null;
    onGround:     boolean | null;
    isStale:      boolean | null;
    updatedAt:    number | null;
    lastPollAt:   number | null;
  };
  boat: {
    isActive:    boolean;
    mmsi:        number | null;
    imo:         number | null;
    name:        string | null;
    callsign:    string | null;
    lat:         number | null;
    lng:         number | null;
    cogDeg:      number | null;
    sogKnots:    number | null;
    headingDeg:  number | null;
    navStatus:   number | null;
    type:        number | null;
    draughtM:    number | null;
    destination: string | null;
    eta:         string | null;
    isStale:     boolean | null;
    updatedAt:   number | null;
    lastPollAt:  number | null;
  };
}

// Per-deal tracking state held in the Zustand store.
export interface TrackingDealState {
  dealId: string;
  mode:   TrackingMode;
  gps: {
    isActive:          boolean;
    currentPosition:   GPSPosition | null;
    lastKnownPosition: GPSPosition | null;
    positionHistory:   GPSPosition[];
    permissionStatus:  'undetermined' | 'granted' | 'denied';
    signalLostAt:      number | null;
  };
  flight: {
    isActive:             boolean;
    icao24:               string | null;
    callsign:             string | null;
    currentPosition:      FlightPosition | null;
    interpolatedPosition: FlightPosition | null;
    positionHistory:      FlightPosition[];
    routePath:            LatLng[];
    lastPollAt:           number | null;
  };
  boat: {
    isActive:        boolean;
    mmsi:            number | null;
    currentPosition: VesselPosition | null;
    positionHistory: VesselPosition[];
    routePath:       LatLng[];
    lastPollAt:      number | null;
  };
  smartSwitch: {
    pendingPrompt: boolean;
  };
}
