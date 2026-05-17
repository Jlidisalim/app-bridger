// Vessel icon that rotates smoothly to match COG/heading.
// `Ship` from lucide-react-native points roughly forward; we treat it as
// heading=0 → north, same convention as the plane marker.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Ship } from 'lucide-react-native';

interface Props {
  headingDeg: number;
  size?:      number;
  color?:     string;
}

export const BoatMarker: React.FC<Props> = ({ headingDeg, size = 32, color = '#22d3ee' }) => {
  const rotation = useRef(new Animated.Value(headingDeg)).current;
  const lastRef = useRef(headingDeg);

  useEffect(() => {
    const last = lastRef.current;
    let target = headingDeg;
    const diff = target - last;
    if (diff > 180) target -= 360;
    if (diff < -180) target += 360;
    Animated.timing(rotation, {
      toValue: target,
      duration: 500,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
    lastRef.current = headingDeg;
  }, [headingDeg, rotation]);

  const rotate = rotation.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  return (
    <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          transform: [{ rotate } as any],
          shadowColor: '#000',
          shadowOpacity: 0.4,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
          elevation: 4,
        }}
      >
        <Ship size={size} color={color} fill={color} strokeWidth={1.5} />
      </Animated.View>
    </View>
  );
};
