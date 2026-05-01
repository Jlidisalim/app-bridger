// Tracking-related tunables. Keep in sync with backend/src/config/env.ts.

export const TRACKING = {
  GPS_PUSH_INTERVAL_MS:    15_000,
  GPS_DISTANCE_INTERVAL_M: 10,
  GPS_LOSS_THRESHOLD_MS:   120_000,
  INTERPOLATION_TICK_MS:   500,
  HISTORY_TRAIL_LIMIT:     20,
} as const;

// Socket event names — must match backend tracking.events.ts.
export const TRACKING_EVENTS = {
  ACTIVATED:        'tracking:activated',
  DEACTIVATED:      'tracking:deactivated',
  MODE_SWITCHED:    'tracking:mode_switched',
  GPS_UPDATE:       'tracking:gps_update',
  GPS_LOST:         'tracking:gps_lost',
  GPS_RECOVERED:    'tracking:gps_recovered',
  SUGGEST_FLIGHT:   'tracking:suggest_flight',
  FLIGHT_UPDATE:    'tracking:flight_update',
  FLIGHT_NOT_FOUND: 'tracking:flight_not_found',
  ERROR:            'tracking:error',
  PONG:             'tracking:pong',
  JOIN_DEAL:        'tracking:join_deal',
  LEAVE_DEAL:       'tracking:leave_deal',
  GPS_POSITION:     'tracking:gps_position',
  PING:             'tracking:ping',
} as const;
