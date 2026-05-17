export type TrackingMode = 'idle' | 'gps' | 'flight' | 'boat';

export interface GPSPositionPayload {
  lat:       number;
  lng:       number;
  accuracy:  number;
  heading?:  number | null;
  speed?:    number | null;  // m/s
  altitude?: number | null;
  timestamp?: number;        // Unix ms
}

export interface ActivateTrackingInput {
  dealId:    string;
  mode:      'gps' | 'flight' | 'boat';
  callsign?: string;   // for flight mode
  mmsi?:     number;   // for boat mode
}
