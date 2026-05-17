// AISHub Web Service — type definitions
// API docs: https://www.aishub.net/api
//
// AISHub returns either:
//   [{ ERROR: false, USERNAME, FORMAT, ... }, [ vessel, vessel, ... ]]   on success
//   [{ ERROR: true,  ERROR_MESSAGE: "..." }]                              on error
//
// We always request format=1 (human-readable) and output=json so values come
// in real-world units (degrees, knots) instead of AIS-encoded integers.

export interface AISHubVesselRaw {
  MMSI:      number;
  TIME:      string;          // "YYYY-MM-DD HH:mm:ss GMT"  (format=1)
  LATITUDE:  number;          // degrees                    (format=1)
  LONGITUDE: number;          // degrees                    (format=1)
  COG?:      number;          // Course Over Ground (deg, 360 = N/A)
  SOG?:      number;          // Speed Over Ground (knots,  102.4 = N/A)
  HEADING?:  number;          // True heading (deg, 511 = N/A)
  NAVSTAT?:  number;          // Navigational status (ITU-R M.1371)
  IMO?:      number;
  NAME?:     string;
  CALLSIGN?: string;
  TYPE?:     number;          // Vessel type code
  A?:        number;          // Dimension to Bow (m)
  B?:        number;          // Dimension to Stern (m)
  C?:        number;          // Dimension to Port (m)
  D?:        number;          // Dimension to Starboard (m)
  DRAUGHT?:  number;          // meters (format=1)
  DEST?:     string;
  ETA?:      string;          // "MM-DD HH:mm"  (format=1)
}

export interface AISHubMeta {
  ERROR:         boolean;
  USERNAME?:     string;
  FORMAT?:       number;
  RECORDS?:      number;
  ERROR_MESSAGE?: string;
}

// Raw response shape is a tuple of [meta, vessels[]] — vessels[] is omitted on error.
export type AISHubResponse =
  | [AISHubMeta]
  | [AISHubMeta, AISHubVesselRaw[]];

// Normalized internal representation. Kept parallel to FlightPosition so the
// tracking pipeline can treat both consistently.
export interface VesselPosition {
  mmsi:        number;
  imo:         number | null;
  name:        string | null;
  callsign:    string | null;
  lat:         number;
  lng:         number;
  cogDeg:      number | null;   // Course over ground (null if 360 / unavailable)
  sogKnots:    number | null;   // Speed over ground   (null if 102.4 / unavailable)
  sogKmh:      number | null;
  headingDeg:  number | null;   // True heading        (null if 511 / unavailable)
  navStatus:   number | null;
  type:        number | null;
  draughtM:    number | null;
  destination: string | null;
  eta:         string | null;
  updatedAt:   number;          // Unix ms
  isStale:     boolean;         // true if AIS timestamp is older than ~10 min
}
