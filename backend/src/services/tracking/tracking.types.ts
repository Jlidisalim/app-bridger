export type TrackingMode = 'idle' | 'gps' | 'flight';

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
  mode:      'gps' | 'flight';
  callsign?: string;
}
