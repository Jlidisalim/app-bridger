// Plane marker for the flight map. A crisp blue plane inside a white disc
// with a soft drop shadow so it reads cleanly on the light map. No
// animated pulse — it caused snapshot artifacts on Android's Google Maps
// where tracksViewChanges re-rasterises the view every frame.

import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Plane } from 'lucide-react-native';

interface Props {
  headingDeg: number;
  size?:      number;
}

export const FlightMarker = memo<Props>(function FlightMarker({ headingDeg, size = 30 }) {
  const disc = size + 16;
  return (
    <View style={[styles.container, { width: disc, height: disc }]}>
      <View style={[styles.ring, { width: disc, height: disc, borderRadius: disc / 2 }]} />
      <View style={[styles.disc, { width: size + 10, height: size + 10, borderRadius: (size + 10) / 2 }]}>
        <View style={{ transform: [{ rotate: `${headingDeg}deg` }] }}>
          <Plane size={size - 4} color="#ffffff" fill="#ffffff" strokeWidth={1.2} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    backgroundColor: 'rgba(37,99,235,0.16)',
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
});
