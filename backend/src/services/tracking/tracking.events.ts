// Socket.io room + event constants for tracking.
// One room per deal: every event is scoped to `deal:${dealId}`.

export const dealRoom = (dealId: string): string => `deal:${dealId}`;

export const TRACKING_EVENTS = {
  // server → client
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
  // client → server
  JOIN_DEAL:        'tracking:join_deal',
  LEAVE_DEAL:       'tracking:leave_deal',
  GPS_POSITION:     'tracking:gps_position',
  PING:             'tracking:ping',
} as const;
