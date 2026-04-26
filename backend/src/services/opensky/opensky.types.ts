// OpenSky Network REST API — type definitions
//
// The /states/all endpoint returns state vectors as ARRAYS, not objects.
// Index positions are documented at:
//   https://openskynetwork.github.io/opensky-api/rest.html

export type RawStateVector = [
  string,           // [0]  icao24
  string | null,    // [1]  callsign (8-char, space-padded)
  string,           // [2]  origin_country
  number | null,    // [3]  time_position (Unix sec)
  number,           // [4]  last_contact (Unix sec)
  number | null,    // [5]  longitude (WGS-84)
  number | null,    // [6]  latitude  (WGS-84)
  number | null,    // [7]  baro_altitude (meters)
  boolean,          // [8]  on_ground
  number | null,    // [9]  velocity (m/s)
  number | null,    // [10] true_track (degrees, clockwise from north)
  number | null,    // [11] vertical_rate (m/s)
  number[] | null,  // [12] sensors
  number | null,    // [13] geo_altitude (meters)
  string | null,    // [14] squawk
  boolean,          // [15] spi
  0 | 1 | 2 | 3,    // [16] position_source (0=ADS-B, 1=ASTERIX, 2=MLAT, 3=FLARM)
  number | null,    // [17] category (extended only)
];

export interface OpenSkyStatesResponse {
  time: number;
  states: RawStateVector[] | null;
}

export type PositionSource = 'ADS-B' | 'ASTERIX' | 'MLAT' | 'FLARM' | 'unknown';

export interface FlightPosition {
  icao24:         string;
  callsign:       string;
  lat:            number;
  lng:            number;
  altitudeM:      number;
  velocityMs:     number;
  velocityKmh:    number;
  headingDeg:     number;
  verticalRate:   number;
  onGround:       boolean;
  positionSource: PositionSource;
  updatedAt:      number;
  isStale:        boolean;
}

export type TrackWaypoint = [
  number,         // [0] time
  number | null,  // [1] latitude
  number | null,  // [2] longitude
  number | null,  // [3] baro_altitude
  number | null,  // [4] true_track
  boolean,        // [5] on_ground
];

export interface OpenSkyTrackResponse {
  icao24:    string;
  startTime: number;
  endTime:   number;
  callsign:  string | null;
  path:      TrackWaypoint[];
}
